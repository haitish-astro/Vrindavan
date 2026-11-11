import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { todayISO } from '../lib/dates'
import { uploadPhotos, type UploadStatus } from '../lib/uploads'
import type { MemoryInput } from '../lib/types'
import { PhotoPicker, UploadProgress, type PickedPhoto } from '../components/PhotoPicker'
import { Button, ErrorNote, Label, Page, PageHeader, Spinner } from '../components/ui'

const SYMBOLS = ['🦚', '🪷', '🌸', '✨', '🌙', '☕', '🌊', '🎶', '🏔️', '🍰', '🛕', '❤️']
const clean = (value: string) => value.trim() || null

/**
 * Add a memory:  Title → Date → Photos → Note → Save.
 * The same form, without photos and note, edits a memory's details.
 */
export default function MemoryForm() {
  const { id } = useParams()
  const editing = Boolean(id)
  const { api } = useApp()
  const world = useWorld()
  const navigate = useNavigate()

  const existing = useAsync(() => (id ? api.getMemory(id) : Promise.resolve(null)), [api, id])

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayISO())
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [favorite, setFavorite] = useState('')
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [showMore, setShowMore] = useState(editing)

  const [busy, setBusy] = useState(false)
  const [upload, setUpload] = useState<UploadStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const memory = existing.data
    if (!memory) return
    setTitle(memory.title)
    setDate(memory.happened_on)
    setLocation(memory.location ?? '')
    setDescription(memory.description ?? '')
    setEmoji(memory.emoji)
  }, [existing.data])

  if (editing) {
    if (existing.loading) return <Spinner />
    if (existing.error) return <ErrorNote message={existing.error} onRetry={existing.reload} />
    if (!existing.data) return <Navigate to="/memories" replace />
    if (existing.data.created_by !== world.me.id) return <Navigate to={`/memories/${id}`} replace />
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return setError('Give this memory a title.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Choose the date of this memory.')

    const input: MemoryInput = {
      title: title.trim(),
      happened_on: date,
      location: clean(location),
      description: clean(description),
      emoji,
    }
    setBusy(true)
    setError(null)
    try {
      if (editing && id) {
        await api.updateMemory(id, input)
        navigate(`/memories/${id}`, { replace: true })
        return
      }
      const memory = await api.createMemory(world.space.id, input)
      let failed = 0
      if (photos.length > 0) {
        const result = await uploadPhotos(api, memory, photos.map((p) => p.file), 0, setUpload)
        failed = result.failed
      }
      let noteFailed = false
      if (note.trim() || favorite.trim()) {
        try {
          await api.saveNote(memory, undefined, { note: clean(note), favorite_moment: clean(favorite) })
        } catch {
          noteFailed = true
        }
      }
      navigate(`/memories/${memory.id}`, { replace: true, state: { failedPhotos: failed, noteFailed } })
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
      setUpload(null)
    }
  }

  return (
    <Page>
      <Link
        to={editing ? `/memories/${id}` : '/memories'}
        className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Link>
      <PageHeader
        eyebrow={editing ? 'Edit' : 'A new page'}
        title={editing ? 'Edit this memory' : 'Add a Memory'}
        subtitle={editing ? undefined : 'A title, a date, a few photos. That is all it takes.'}
      />

      <form onSubmit={submit} className="paper space-y-5 p-5 sm:p-7" noValidate>
        <div>
          <Label htmlFor="title">What shall we call it?</Label>
          <input
            id="title"
            className="field"
            placeholder="Chai by the river"
            maxLength={120}
            required
            autoFocus={!editing}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="date">When was it?</Label>
          <input
            id="date"
            type="date"
            className="field"
            required
            max="2999-12-31"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {!editing && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">Photos</p>
            <PhotoPicker photos={photos} onChange={setPhotos} />
            <p className="mt-1.5 text-xs text-ink-soft">
              Photos are made lighter before uploading, and stay private to the two of us.
            </p>
          </div>
        )}

        {!editing && (
          <div>
            <Label htmlFor="note" hint="optional">
              A note from you
            </Label>
            <textarea
              id="note"
              rows={3}
              className="field hand resize-y"
              placeholder="What do you want to remember about this?"
              maxLength={4000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          aria-expanded={showMore}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-peacock-deep"
        >
          <ChevronDown className={`size-4 transition-transform ${showMore ? 'rotate-180' : ''}`} aria-hidden />
          {showMore ? 'Fewer details' : 'Add a few more details'}
        </button>

        {showMore && (
          <div className="space-y-5">
            <div>
              <Label htmlFor="location" hint="optional">
                Where?
              </Label>
              <input
                id="location"
                className="field"
                placeholder="A little café, a city, a rooftop…"
                maxLength={120}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="description" hint="optional">
                The story of the day
              </Label>
              <textarea
                id="description"
                rows={4}
                className="field resize-y"
                placeholder="What happened?"
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {!editing && (
              <div>
                <Label htmlFor="favorite" hint="optional">
                  Your favourite moment
                </Label>
                <input
                  id="favorite"
                  className="field"
                  placeholder="The moment you would relive"
                  maxLength={500}
                  value={favorite}
                  onChange={(e) => setFavorite(e.target.value)}
                />
              </div>
            )}
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">A little symbol</legend>
              <div className="flex flex-wrap gap-2">
                {SYMBOLS.map((symbol) => (
                  <button
                    key={symbol}
                    type="button"
                    aria-pressed={emoji === symbol}
                    aria-label={`Symbol ${symbol}`}
                    onClick={() => setEmoji(emoji === symbol ? null : symbol)}
                    className={`flex size-11 items-center justify-center rounded-full border text-xl transition ${
                      emoji === symbol ? 'border-peacock bg-peacock-soft' : 'border-peacock/15 bg-paper'
                    }`}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-rose-deep">
            {error}
          </p>
        )}
        {upload && upload.total > 0 && (
          <UploadProgress label={`Saving photo ${upload.current} of ${upload.total}…`} fraction={upload.fraction} />
        )}

        <Button type="submit" busy={busy} className="w-full">
          {editing ? 'Save changes' : busy ? 'Saving our memory…' : 'Save this memory ♡'}
        </Button>
      </form>
    </Page>
  )
}
