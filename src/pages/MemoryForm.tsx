import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { todayISO } from '../lib/dates'
import { uploadLabel, uploadPhotos, type UploadStatus } from '../lib/uploads'
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
  const [params] = useSearchParams()
  const isCall = editing ? existing.data?.kind === 'call' : params.get('kind') === 'call'
  const listPath = isCall ? '/memories?tab=calls' : '/memories'

  const [title, setTitle] = useState('')
  const [date, setDate] = useState(todayISO())
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState<string | null>(null)
  const [minutes, setMinutes] = useState('')
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
    setMinutes(memory.call_minutes ? String(memory.call_minutes) : '')
  }, [existing.data])

  if (editing) {
    if (existing.loading) return <Spinner />
    if (existing.error) return <ErrorNote message={existing.error} onRetry={existing.reload} />
    if (!existing.data) return <Navigate to={listPath} replace />
    if (existing.data.created_by !== world.me.id) return <Navigate to={`/memories/${id}`} replace />
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return setError(isCall ? 'Give this call a little title.' : 'Give this memory a title.')
    const callMinutes = minutes.trim() ? Math.round(Number(minutes)) : null
    if (callMinutes !== null && (!Number.isFinite(callMinutes) || callMinutes < 0 || callMinutes > 1440)) {
      return setError('Call length should be in minutes, up to 1440.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Choose the date of this memory.')

    const input: MemoryInput = {
      title: title.trim(),
      happened_on: date,
      location: clean(location),
      description: clean(description),
      emoji,
      ...(isCall ? { call_minutes: callMinutes } : {}),
    }
    setBusy(true)
    setError(null)
    try {
      if (editing && id) {
        await api.updateMemory(id, input)
        navigate(`/memories/${id}`, { replace: true })
        return
      }
      const memory = await api.createMemory(world.space.id, input, isCall ? 'call' : 'adventure')
      let failed = 0
      let failReason: string | undefined
      if (photos.length > 0) {
        const result = await uploadPhotos(api, memory, photos.map((p) => p.file), 0, setUpload)
        failed = result.failed
        failReason = result.reason
      }
      let noteFailed = false
      if (note.trim() || favorite.trim()) {
        try {
          await api.saveNote(memory, undefined, { note: clean(note), favorite_moment: clean(favorite) })
        } catch {
          noteFailed = true
        }
      }
      navigate(`/memories/${memory.id}`, { replace: true, state: { failedPhotos: failed, failReason, noteFailed } })
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
      setUpload(null)
    }
  }

  return (
    <Page>
      <Link
        to={editing ? `/memories/${id}` : listPath}
        className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Link>
      <PageHeader
        eyebrow={editing ? 'Edit' : isCall ? 'FaceTime' : 'A new page'}
        title={editing ? (isCall ? 'Edit this call' : 'Edit this memory') : isCall ? 'Save a FaceTime' : 'Add a Memory'}
        subtitle={
          editing
            ? undefined
            : isCall
              ? 'A title, the day, a few screenshots. Even miles apart, it counts.'
              : 'A title, a date, a few photos or videos. That is all it takes.'
        }
      />

      <form onSubmit={submit} className="paper space-y-5 p-5 sm:p-7" noValidate>
        <div>
          <Label htmlFor="title">{isCall ? 'What was this call?' : 'What shall we call it?'}</Label>
          <input
            id="title"
            className="field"
            placeholder={isCall ? 'Falling asleep on FaceTime again' : 'Chai by the river'}
            maxLength={120}
            required
            autoFocus={!editing}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="date">{isCall ? 'Which day?' : 'When was it?'}</Label>
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

        {isCall && (
          <div>
            <Label htmlFor="minutes" hint="optional">
              How long did you talk? (minutes)
            </Label>
            <input
              id="minutes"
              type="number"
              inputMode="numeric"
              min={0}
              max={1440}
              className="field"
              placeholder="e.g. 95"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
        )}

        {!editing && (
          <div>
            <p className="mb-1.5 text-sm font-semibold">{isCall ? 'Screenshots & recordings' : 'Photos & videos'}</p>
            <PhotoPicker photos={photos} onChange={setPhotos} label={isCall ? 'Add screenshots or recordings' : 'Add photos or videos'} />
            <p className="mt-1.5 text-xs text-ink-soft">
              Photos and videos are made lighter on your device before uploading. Everything stays private to the two of you.
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
              placeholder={isCall ? 'What did you talk about? What made you laugh?' : 'What do you want to remember about this?'}
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
                {isCall ? 'Where were you each?' : 'Where?'}
              </Label>
              <input
                id="location"
                className="field"
                placeholder={isCall ? 'Me in Mumbai, you in Boston…' : 'A little café, a city, a rooftop…'}
                maxLength={120}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="description" hint="optional">
                {isCall ? 'The story of the call' : 'The story of the day'}
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
          <UploadProgress label={uploadLabel(upload)} fraction={upload.fraction} />
        )}

        <Button type="submit" busy={busy} className="w-full">
          {editing ? 'Save changes' : busy ? 'Saving our memory…' : 'Save this memory ♡'}
        </Button>
      </form>
    </Page>
  )
}
