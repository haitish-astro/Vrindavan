import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, MapPin, Pencil, Trash2, X } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { formatLong } from '../lib/dates'
import { uploadPhotos, type UploadStatus } from '../lib/uploads'
import type { Memory, MemoryNote, Photo } from '../lib/types'
import { LotusDivider } from '../components/Decor'
import { UploadProgress } from '../components/PhotoPicker'
import {
  Button,
  ButtonLink,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Label,
  Page,
  PrivatePhoto,
  Spinner,
} from '../components/ui'

/** One page of the album: photos, the story, and a note from each of us. */
export default function MemoryDetail() {
  const { id = '' } = useParams()
  const { api } = useApp()
  const world = useWorld()
  const navigate = useNavigate()
  const location = useLocation()
  const arrival = location.state as { failedPhotos?: number; noteFailed?: boolean } | null

  const { data: memory, loading, error, reload, setData } = useAsync(() => api.getMemory(id), [api, id])

  const [viewing, setViewing] = useState<number | null>(null)
  const [upload, setUpload] = useState<UploadStatus | null>(null)
  const [notice, setNotice] = useState<string | null>(() => {
    if (arrival?.failedPhotos) {
      return `${arrival.failedPhotos} photo${arrival.failedPhotos > 1 ? 's' : ''} could not be uploaded. You can add ${arrival.failedPhotos > 1 ? 'them' : 'it'} again below.`
    }
    if (arrival?.noteFailed) return 'Your note could not be saved. You can write it again below.'
    return null
  })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [photoToRemove, setPhotoToRemove] = useState<Photo | null>(null)
  const [working, setWorking] = useState(false)

  if (loading && !memory) return <Spinner label="Turning to this page…" />
  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (!memory) {
    return (
      <EmptyState title="This page is missing" action={<ButtonLink to="/memories">Back to our memories</ButtonLink>}>
        The memory may have been removed.
      </EmptyState>
    )
  }

  const mine = memory.created_by === world.me.id
  const update = (change: (current: Memory) => Memory) => setData((current) => (current ? change(current) : current))

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setNotice(null)
    const nextOrder = memory.photos.reduce((max, p) => Math.max(max, p.sort_order + 1), 0)
    const result = await uploadPhotos(api, memory, [...files], nextOrder, setUpload)
    setUpload(null)
    update((m) => ({ ...m, photos: [...m.photos, ...result.uploaded] }))
    if (result.failed) {
      setNotice(`${result.failed} photo${result.failed > 1 ? 's' : ''} could not be uploaded. Please try again.`)
    }
  }

  const removePhoto = async () => {
    if (!photoToRemove) return
    setWorking(true)
    try {
      await api.deletePhoto(photoToRemove)
      update((m) => ({ ...m, photos: m.photos.filter((p) => p.id !== photoToRemove.id) }))
      setViewing(null)
    } catch (e) {
      setNotice(friendlyError(e))
    } finally {
      setWorking(false)
      setPhotoToRemove(null)
    }
  }

  const removeMemory = async () => {
    setWorking(true)
    try {
      await api.deleteMemory(memory)
      navigate('/memories', { replace: true })
    } catch (e) {
      setNotice(friendlyError(e))
      setWorking(false)
      setConfirmDelete(false)
    }
  }

  const [first, ...rest] = memory.photos
  const canRemove = (photo: Photo) => mine || photo.uploaded_by === world.me.id

  return (
    <Page>
      <div className="mb-3 flex items-center justify-between">
        <Link
          to="/memories"
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
        >
          <ArrowLeft className="size-4" aria-hidden /> Our memories
        </Link>
        {mine && (
          <div className="flex gap-1">
            <Link
              to={`/memories/${memory.id}/edit`}
              aria-label="Edit this memory"
              className="flex size-10 items-center justify-center rounded-full text-peacock-deep hover:bg-peacock-soft/60"
            >
              <Pencil className="size-4" aria-hidden />
            </Link>
            <button
              type="button"
              aria-label="Remove this memory"
              onClick={() => setConfirmDelete(true)}
              className="flex size-10 items-center justify-center rounded-full text-rose-deep hover:bg-blush/60"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      <article className="paper overflow-hidden">
        {/* photographs */}
        {first ? (
          <div className="p-3 pb-0 sm:p-4 sm:pb-0">
            <button
              type="button"
              className="block w-full"
              onClick={() => setViewing(0)}
              aria-label="Open photo 1"
            >
              <PrivatePhoto path={first.storage_path} alt={`${memory.title} — photo 1`} className="aspect-[4/3] rounded-xl" />
            </button>
            {rest.length > 0 && (
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {rest.map((photo, i) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      className="block w-full"
                      onClick={() => setViewing(i + 1)}
                      aria-label={`Open photo ${i + 2}`}
                    >
                      <PrivatePhoto
                        path={photo.thumb_path ?? photo.storage_path}
                        alt={`${memory.title} — photo ${i + 2}`}
                        className="aspect-square rounded-lg"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="flex h-28 items-center justify-center bg-parchment/70 text-sm text-ink-soft">
            No photographs yet — add one below.
          </div>
        )}

        <div className="px-5 py-6 text-center sm:px-8">
          {memory.emoji && <p className="text-3xl">{memory.emoji}</p>}
          <h1 className="mt-1 text-[2rem] leading-tight text-peacock-deep sm:text-4xl">{memory.title}</h1>
          <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-ink-soft">
            <span>{formatLong(memory.happened_on)}</span>
            {memory.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {memory.location}
              </span>
            )}
          </p>
          {memory.description && (
            <p className="mx-auto mt-5 max-w-prose text-left leading-relaxed whitespace-pre-line text-ink">
              {memory.description}
            </p>
          )}
          <LotusDivider className="mt-6" />
        </div>

        {/* add photographs */}
        <div className="px-5 pb-5 sm:px-8">
          {notice && (
            <p role="alert" className="mb-3 rounded-xl bg-blush/60 px-4 py-2.5 text-sm text-rose-deep">
              {notice}
            </p>
          )}
          {upload ? (
            <UploadProgress label={`Saving photo ${upload.current} of ${upload.total}…`} fraction={upload.fraction} />
          ) : (
            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-peacock/25 bg-paper px-5 text-[0.95rem] font-semibold text-peacock-deep transition hover:bg-peacock-soft/60 focus-within:ring-2 focus-within:ring-peacock">
              <Camera className="size-4" aria-hidden /> Add photographs
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  void addPhotos(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      </article>

      {/* notes from both of us */}
      <section className="mt-7" aria-label="In our words">
        <p className="eyebrow mb-3 text-center">In our words</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {world.members
            .slice()
            .sort((a) => (a.id === world.me.id ? -1 : 1))
            .map((member) => {
              const note = memory.notes.find((n) => n.author_id === member.id)
              return member.id === world.me.id ? (
                <MyNote
                  key={member.id}
                  memory={memory}
                  note={note}
                  onSaved={(saved) =>
                    update((m) => ({ ...m, notes: [...m.notes.filter((n) => n.id !== saved.id), saved] }))
                  }
                />
              ) : (
                <NoteCard key={member.id} author={nameOf(world, member.id)} note={note} />
              )
            })}
          {world.members.length < 2 && <NoteCard author="Your love" note={undefined} />}
        </div>
      </section>

      <Lightbox
        photos={memory.photos}
        index={viewing}
        title={memory.title}
        onMove={setViewing}
        onClose={() => setViewing(null)}
        onRemove={(photo) => setPhotoToRemove(photo)}
        canRemove={canRemove}
      />

      <ConfirmDialog
        open={photoToRemove !== null}
        title="Remove this photograph?"
        message="It will be taken out of this memory for both of you. This cannot be undone."
        confirmLabel="Remove photo"
        busy={working}
        onConfirm={() => void removePhoto()}
        onCancel={() => setPhotoToRemove(null)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Remove this memory?"
        message="The photographs and both of your notes will be removed for both of you. This cannot be undone."
        confirmLabel="Remove memory"
        busy={working}
        onConfirm={() => void removeMemory()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Page>
  )
}

function NoteCard({ author, note }: { author: string; note: MemoryNote | undefined }) {
  const empty = !note?.note && !note?.favorite_moment
  return (
    <div className="paper bg-[linear-gradient(transparent_95%,rgb(196_161_90/0.12)_95%)] bg-[length:100%_2rem] px-5 py-5">
      <p className="eyebrow mb-2">From {author}</p>
      {empty ? (
        <p className="text-sm text-ink-soft italic">{author} has not written here yet.</p>
      ) : (
        <>
          {note?.note && <p className="hand whitespace-pre-line text-ink">{note.note}</p>}
          {note?.favorite_moment && (
            <p className="mt-3 text-sm text-ink-soft">
              <span className="font-semibold text-rose-deep">Favourite moment · </span>
              {note.favorite_moment}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** Your own note: read it, or tap to write. Saving never touches your partner's note. */
function MyNote({
  memory,
  note,
  onSaved,
}: {
  memory: Memory
  note: MemoryNote | undefined
  onSaved: (note: MemoryNote) => void
}) {
  const { api } = useApp()
  const world = useWorld()
  const empty = !note?.note && !note?.favorite_moment
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(note?.note ?? '')
  const [favorite, setFavorite] = useState(note?.favorite_moment ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = () => {
    setText(note?.note ?? '')
    setFavorite(note?.favorite_moment ?? '')
    setError(null)
    setEditing(true)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = await api.saveNote(memory, note, {
        note: text.trim() || null,
        favorite_moment: favorite.trim() || null,
      })
      onSaved(saved)
      setEditing(false)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <div className="relative">
        <NoteCard author={nameOf(world, world.me.id)} note={note} />
        <button
          type="button"
          onClick={open}
          className="absolute top-3 right-3 inline-flex min-h-9 items-center gap-1 rounded-full bg-paper/90 px-3 text-sm font-semibold text-peacock-deep hover:bg-peacock-soft"
        >
          <Pencil className="size-3.5" aria-hidden />
          {empty ? 'Write' : 'Edit'}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={save} className="paper space-y-3 px-5 py-5">
      <div>
        <Label htmlFor="my-note">Your note</Label>
        <textarea
          id="my-note"
          rows={4}
          autoFocus
          className="field hand resize-y"
          maxLength={4000}
          placeholder="What do you want to remember about this?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="my-favorite" hint="optional">
          Your favourite moment
        </Label>
        <input
          id="my-favorite"
          className="field"
          maxLength={500}
          value={favorite}
          onChange={(e) => setFavorite(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-deep">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" busy={busy}>
          Save note
        </Button>
      </div>
    </form>
  )
}

/** Full-screen photo viewer: arrows, swipe, Escape. */
function Lightbox({
  photos,
  index,
  title,
  onMove,
  onClose,
  onRemove,
  canRemove,
}: {
  photos: Photo[]
  index: number | null
  title: string
  onMove: (index: number) => void
  onClose: () => void
  onRemove: (photo: Photo) => void
  canRemove: (photo: Photo) => boolean
}) {
  const open = index !== null && photos[index] !== undefined
  const count = photos.length
  const touchStart = useRef<number | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  const step = useCallback(
    (delta: number) => {
      if (index === null || count < 2) return
      onMove((index + delta + count) % count)
    },
    [index, count, onMove],
  )

  useEffect(() => {
    if (!open) return
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight') step(1)
      if (event.key === 'ArrowLeft') step(-1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose, step])

  const photo = open ? photos[index] : undefined

  return (
    <AnimatePresence>
      {photo && index !== null && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} — photo ${index + 1} of ${count}`}
          className="fixed inset-0 z-50 flex flex-col bg-ink/95"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onTouchStart={(e) => (touchStart.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const start = touchStart.current
            const end = e.changedTouches[0]?.clientX
            touchStart.current = null
            if (start === null || end === undefined) return
            if (end - start > 50) step(-1)
            if (start - end > 50) step(1)
          }}
        >
          <div className="flex items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
            <span className="px-2 text-sm">
              {index + 1} / {count}
            </span>
            <div className="flex gap-1">
              {canRemove(photo) && (
                <button
                  type="button"
                  aria-label="Remove this photograph"
                  onClick={() => onRemove(photo)}
                  className="flex size-11 items-center justify-center rounded-full hover:bg-white/15"
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              )}
              <button
                ref={closeButton}
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex size-11 items-center justify-center rounded-full hover:bg-white/15"
              >
                <X className="size-6" aria-hidden />
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
            <PrivatePhoto
              key={photo.id}
              path={photo.storage_path}
              alt={`${title} — photo ${index + 1}`}
              className="size-full !bg-transparent"
              imgClassName="object-contain"
            />
            {count > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => step(-1)}
                  className="absolute left-2 flex size-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  <ChevronLeft className="size-6" aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => step(1)}
                  className="absolute right-2 flex size-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  <ChevronRight className="size-6" aria-hidden />
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
