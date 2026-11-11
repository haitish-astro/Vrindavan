import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { formatLong, isFuture, todayISO } from '../lib/dates'
import { prepareImage } from '../lib/images'
import type { Memory, Milestone } from '../lib/types'
import { coverPath } from '../components/Polaroid'
import { PhotoPicker, type PickedPhoto } from '../components/PhotoPicker'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Label,
  Modal,
  Page,
  PageHeader,
  PrivatePhoto,
  Spinner,
} from '../components/ui'

type Entry =
  | { kind: 'milestone'; date: string; milestone: Milestone }
  | { kind: 'memory'; date: string; memory: Memory }

/** Our story so far: milestones we add, with every adventure woven in automatically. */
export default function Story() {
  const { api } = useApp()
  const world = useWorld()
  const spaceId = world.space.id
  const [params, setParams] = useSearchParams()

  const story = useAsync(
    () => Promise.all([api.listMilestones(spaceId), api.listMemories(spaceId)]),
    [api, spaceId],
  )
  const [editing, setEditing] = useState<Milestone | 'new' | null>(null)
  const [removing, setRemoving] = useState<Milestone | null>(null)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // "Add a Milestone" on the home page lands here with ?new=1
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const { past, future } = useMemo(() => {
    const [milestones, memories] = story.data ?? [[], []]
    const entries: Entry[] = [
      ...milestones.map((milestone) => ({ kind: 'milestone' as const, date: milestone.happened_on, milestone })),
      ...memories.map((memory) => ({ kind: 'memory' as const, date: memory.happened_on, memory })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    return {
      past: entries.filter((e) => !isFuture(e.date)),
      future: entries.filter((e) => isFuture(e.date)),
    }
  }, [story.data])

  const saved = (milestone: Milestone) => {
    story.setData((current) => {
      const [milestones, memories] = current ?? [[], []]
      return [[...milestones.filter((m) => m.id !== milestone.id), milestone], memories]
    })
    setEditing(null)
  }

  const remove = async () => {
    if (!removing) return
    setWorking(true)
    try {
      await api.deleteMilestone(removing)
      story.setData((current) =>
        current ? [current[0].filter((m) => m.id !== removing.id), current[1]] : current,
      )
    } catch (e) {
      setNotice(friendlyError(e))
    } finally {
      setWorking(false)
      setRemoving(null)
    }
  }

  const renderEntry = (entry: Entry, index: number) => (
    <TimelineItem
      key={entry.kind === 'milestone' ? entry.milestone.id : entry.memory.id}
      entry={entry}
      index={index}
      mine={entry.kind === 'milestone' && entry.milestone.created_by === world.me.id}
      addedBy={entry.kind === 'milestone' ? nameOf(world, entry.milestone.created_by) : null}
      onEdit={() => entry.kind === 'milestone' && setEditing(entry.milestone)}
      onRemove={() => entry.kind === 'milestone' && setRemoving(entry.milestone)}
    />
  )

  return (
    <Page>
      <PageHeader
        eyebrow="Our story"
        title="How it all unfolded"
        subtitle="Milestones and adventures, in the order they happened."
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden /> Add a Milestone
          </Button>
        }
      />

      {notice && (
        <p role="alert" className="mb-4 rounded-xl bg-blush/60 px-4 py-2.5 text-sm text-rose-deep">
          {notice}
        </p>
      )}
      {story.loading && <Spinner label="Unrolling our story…" />}
      {story.error && <ErrorNote message={story.error} onRetry={story.reload} />}

      {story.data && past.length + future.length === 0 && (
        <EmptyState
          title="Our story begins here"
          action={
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden /> Add the first milestone
            </Button>
          }
        >
          The day we met, a first date, a conversation that changed everything. Add the moments that shaped us.
        </EmptyState>
      )}

      {past.length > 0 && <ol className="relative">{past.map(renderEntry)}</ol>}

      {future.length > 0 && (
        <>
          <p className="eyebrow my-5 pl-10">Still to come</p>
          <ol className="relative opacity-90">{future.map(renderEntry)}</ol>
        </>
      )}

      <MilestoneForm
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={saved}
      />
      <ConfirmDialog
        open={removing !== null}
        title="Remove this milestone?"
        message="It will disappear from our story for both of you. This cannot be undone."
        confirmLabel="Remove milestone"
        busy={working}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </Page>
  )
}

function TimelineItem({
  entry,
  index,
  mine,
  addedBy,
  onEdit,
  onRemove,
}: {
  entry: Entry
  index: number
  mine: boolean
  addedBy: string | null
  onEdit: () => void
  onRemove: () => void
}) {
  const isMemory = entry.kind === 'memory'
  const title = isMemory ? entry.memory.title : entry.milestone.title
  const description = isMemory ? entry.memory.description : entry.milestone.description
  const location = isMemory ? entry.memory.location : entry.milestone.location
  const photo = isMemory ? coverPath(entry.memory) : entry.milestone.photo_path
  const upcoming = isFuture(entry.date)

  const body = (
    <>
      {photo && <PrivatePhoto path={photo} alt="" className="mb-3 aspect-[16/10] rounded-xl" />}
      <h2 className="text-2xl leading-tight text-peacock-deep">
        {isMemory && entry.memory.emoji && <span className="mr-1.5 text-xl">{entry.memory.emoji}</span>}
        {title}
      </h2>
      {location && (
        <p className="mt-1 inline-flex items-center gap-1 text-sm text-ink-soft">
          <MapPin className="size-3.5" aria-hidden />
          {location}
        </p>
      )}
      {description && <p className="mt-2 line-clamp-4 whitespace-pre-line text-ink">{description}</p>}
    </>
  )

  return (
    <motion.li
      className="relative pb-7 pl-10 last:pb-2"
      initial={{ opacity: 0, x: -14 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '0px 0px -60px 0px' }}
      transition={{ duration: 0.55, ease: 'easeOut', delay: Math.min(index, 4) * 0.05 }}
    >
      {/* the thread and its bead */}
      <span className="absolute top-2 bottom-0 left-[0.6875rem] w-px bg-gradient-to-b from-gold/70 to-gold/20" aria-hidden />
      <span
        aria-hidden
        className={`absolute top-1 left-0 flex size-6 items-center justify-center rounded-full border-2 bg-paper ${
          isMemory ? 'border-peacock' : 'border-gold'
        } ${upcoming ? 'border-dashed' : ''}`}
      >
        <span className={`size-2 rounded-full ${isMemory ? 'bg-peacock' : 'bg-gold'}`} />
      </span>

      <p className="mb-1.5 text-sm font-semibold text-ink-soft">
        {formatLong(entry.date)}
        <span className={`ml-2 text-xs font-bold tracking-wider uppercase ${isMemory ? 'text-peacock' : 'text-gold'}`}>
          {isMemory ? 'Adventure' : 'Milestone'}
        </span>
      </p>

      {isMemory ? (
        <Link to={`/memories/${entry.memory.id}`} className="paper block p-4 transition hover:-translate-y-0.5">
          {body}
          <p className="mt-3 text-sm font-semibold text-peacock-deep">Open this memory →</p>
        </Link>
      ) : (
        <div className={`paper p-4 ${upcoming ? 'border-dashed' : ''}`}>
          {body}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-ink-soft">Added by {addedBy}</p>
            {mine && (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={onEdit}
                  aria-label={`Edit ${title}`}
                  className="flex size-10 items-center justify-center rounded-full text-peacock-deep hover:bg-peacock-soft/60"
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label={`Remove ${title}`}
                  className="flex size-10 items-center justify-center rounded-full text-rose-deep hover:bg-blush/60"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.li>
  )
}

function MilestoneForm({
  target,
  onClose,
  onSaved,
}: {
  target: Milestone | 'new' | null
  onClose: () => void
  onSaved: (milestone: Milestone) => void
}) {
  const { api } = useApp()
  const world = useWorld()
  const existing = target && target !== 'new' ? target : null

  const [title, setTitle] = useState(existing?.title ?? '')
  const [date, setDate] = useState(existing?.happened_on ?? todayISO())
  const [description, setDescription] = useState(existing?.description ?? '')
  const [location, setLocation] = useState(existing?.location ?? '')
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [removePhoto, setRemovePhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return setError('Give this milestone a title.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Choose a date.')
    setBusy(true)
    setError(null)
    try {
      const input = {
        title: title.trim(),
        happened_on: date,
        description: description.trim() || null,
        location: location.trim() || null,
      }
      const image = photos[0] ? await prepareImage(photos[0].file) : undefined
      const milestone = existing
        ? await api.updateMilestone(existing, input, image ?? (removePhoto ? null : undefined))
        : await api.createMilestone(world.space.id, input, image)
      onSaved(milestone)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Modal open={target !== null} onClose={busy ? () => {} : onClose} title={existing ? 'Edit milestone' : 'A new milestone'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="m-title">What happened?</Label>
          <input
            id="m-title"
            className="field"
            placeholder="The day we first met"
            maxLength={120}
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="m-date" hint="future dates are welcome">
            When?
          </Label>
          <input
            id="m-date"
            type="date"
            className="field"
            required
            max="2999-12-31"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="m-description" hint="optional">
            A few words
          </Label>
          <textarea
            id="m-description"
            rows={3}
            className="field resize-y"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="m-location" hint="optional">
            Where?
          </Label>
          <input
            id="m-location"
            className="field"
            maxLength={120}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-semibold">
            Photograph <span className="text-xs font-normal text-ink-soft">optional</span>
          </p>
          {existing?.photo_path && photos.length === 0 && !removePhoto && (
            <div className="mb-2 flex items-center gap-3">
              <PrivatePhoto path={existing.photo_path} alt="Current photograph" className="size-20 rounded-lg" />
              <button type="button" className="text-sm font-semibold text-rose-deep" onClick={() => setRemovePhoto(true)}>
                Remove photograph
              </button>
            </div>
          )}
          <PhotoPicker photos={photos} onChange={setPhotos} multiple={false} label="Add a photograph" />
        </div>
        {error && (
          <p role="alert" className="text-sm text-rose-deep">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            {existing ? 'Save changes' : 'Add to our story'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
