import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { ArrowLeft, Send, Trash2 } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from '../lib/local'
import type { LetterInput } from '../lib/types'
import { Button, ConfirmDialog, ErrorNote, Page, Spinner } from '../components/ui'
import { LETTER_PAPER } from './LetterView'

const MAX = 20000

/** Writing a letter: as simple as a sheet of paper. Kept safe on this device while you write. */
export default function LetterCompose() {
  const { id } = useParams()
  const { api } = useApp()
  const world = useWorld()
  const navigate = useNavigate()
  const existing = useAsync(() => (id ? api.getLetter(id) : Promise.resolve(null)), [api, id])
  const draftKey = id ?? 'new'

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [restored, setRestored] = useState(false)
  const [busy, setBusy] = useState<'draft' | 'sent' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ready = useRef(false)

  const partner = world.members.find((m) => m.id !== world.me.id)
  const to = partner ? nameOf(world, partner.id) : 'your love'

  // Fill in from the server, or from what this device kept if it is newer work.
  useEffect(() => {
    if (existing.loading || ready.current) return
    const local = loadLocalDraft(draftKey)
    const server = existing.data
    if (local && (local.body !== (server?.body ?? '') || local.title !== (server?.title ?? ''))) {
      setTitle(local.title)
      setBody(local.body)
      setRestored(true)
    } else if (server) {
      setTitle(server.title ?? '')
      setBody(server.body)
    }
    ready.current = true
  }, [existing.loading, existing.data, draftKey])

  // Keep a copy on this device while writing (cleared once saved).
  useEffect(() => {
    if (!ready.current) return
    const timer = setTimeout(() => saveLocalDraft(draftKey, { title, body }), 400)
    return () => clearTimeout(timer)
  }, [title, body, draftKey])

  if (id) {
    if (existing.loading) return <Spinner />
    if (existing.error) return <ErrorNote message={existing.error} onRetry={existing.reload} />
    if (!existing.data) return <Navigate to="/letters" replace />
    if (existing.data.author_id !== world.me.id) return <Navigate to={`/letters/${id}`} replace />
  }

  const letter = existing.data ?? undefined
  const alreadySent = letter?.status === 'sent'

  const save = async (status: 'draft' | 'sent') => {
    if (!body.trim()) return setError('A letter needs a few words first.')
    const input: LetterInput = { title: title.trim() || null, body: body.trim(), status }
    setBusy(status)
    setError(null)
    setSavedNote(null)
    try {
      const saved = await api.saveLetter(world.space.id, letter, input)
      clearLocalDraft(draftKey)
      if (status === 'sent') {
        navigate(`/letters/${saved.id}`, { replace: true, state: { justSent: !alreadySent } })
        return
      }
      if (!id) {
        navigate(`/letters/${saved.id}/edit`, { replace: true })
        return
      }
      existing.setData(saved)
      setSavedNote('Draft saved. Only you can see it.')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  const removeDraft = async () => {
    if (!letter) return
    try {
      await api.deleteLetter(letter.id)
      clearLocalDraft(draftKey)
      navigate('/letters', { replace: true })
    } catch (e) {
      setError(friendlyError(e))
      setConfirmDelete(false)
    }
  }

  const discardRestored = () => {
    clearLocalDraft(draftKey)
    setTitle(letter?.title ?? '')
    setBody(letter?.body ?? '')
    setRestored(false)
  }

  return (
    <Page>
      <div className="mb-3 flex items-center justify-between">
        <Link
          to={alreadySent && id ? `/letters/${id}` : '/letters'}
          className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </Link>
        {letter && !alreadySent && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-rose-deep hover:bg-blush/60"
          >
            <Trash2 className="size-4" aria-hidden /> Delete draft
          </button>
        )}
      </div>

      {restored && (
        <p className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gold-soft/60 px-4 py-2.5 text-sm text-ink">
          <span>We kept what you were writing on this device.</span>
          <button type="button" onClick={discardRestored} className="font-semibold text-peacock-deep">
            Discard it
          </button>
        </p>
      )}

      <div
        className="relative rounded-sm border border-gold/25 bg-paper px-5 pt-6 pb-5 shadow-polaroid sm:px-9"
        style={{ backgroundImage: LETTER_PAPER, backgroundPosition: '0 7.7rem' }}
      >
        <p className="eyebrow">{alreadySent ? 'Editing your letter' : 'A letter'} for {to}</p>
        <label htmlFor="letter-title" className="sr-only">
          Title (optional)
        </label>
        <input
          id="letter-title"
          className="hand mt-2 w-full border-none bg-transparent text-[2rem] text-rose-deep placeholder:text-rose/40 focus:outline-none"
          placeholder="A title, if you like"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <label htmlFor="letter-body" className="sr-only">
          Your letter
        </label>
        <textarea
          id="letter-body"
          autoFocus={!id}
          rows={14}
          maxLength={MAX}
          className="mt-3 block min-h-[22rem] w-full resize-y border-none bg-transparent font-serif text-[1.3rem] leading-[2.1rem] text-ink placeholder:text-ink-soft/50 focus:outline-none"
          placeholder={`My dear ${to},`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {body.length > MAX - 1000 && <p className="text-right text-xs text-ink-soft">{MAX - body.length} characters left</p>}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-deep">
          {error}
        </p>
      )}
      {savedNote && (
        <p role="status" className="mt-3 text-sm font-semibold text-sage-deep">
          {savedNote}
        </p>
      )}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {!alreadySent && (
          <Button variant="soft" onClick={() => void save('draft')} busy={busy === 'draft'} disabled={busy !== null}>
            Save as draft
          </Button>
        )}
        <Button onClick={() => void save('sent')} busy={busy === 'sent'} disabled={busy !== null}>
          <Send className="size-4" aria-hidden />
          {alreadySent ? 'Save changes' : `Send to ${to} ♡`}
        </Button>
      </div>
      {!alreadySent && (
        <p className="mt-3 text-center text-xs text-ink-soft sm:text-right">
          Drafts are visible only to you. Once sent, {to} can open it right away.
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this draft?"
        message="This draft will be gone for good."
        confirmLabel="Delete draft"
        onConfirm={() => void removeDraft()}
        onCancel={() => setConfirmDelete(false)}
      />
    </Page>
  )
}
