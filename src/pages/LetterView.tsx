import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Pencil, Send, Trash2, X } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { formatLong, localDay, timeAgo } from '../lib/dates'
import type { LetterReply } from '../lib/types'
import { LotusDivider } from '../components/Decor'
import { EnvelopeOpening } from '../components/Envelope'
import { HeartButton, HeartShower, useReactions } from '../components/Hearts'
import { Button, ButtonLink, ConfirmDialog, EmptyState, ErrorNote, Spinner } from '../components/ui'

export const LETTER_PAPER =
  'repeating-linear-gradient(transparent 0 2.1rem, rgb(196 161 90 / 0.16) 2.1rem calc(2.1rem + 1px))'

/** Opening a letter: the envelope animation, then the letter itself on paper. */
export default function LetterView() {
  const { id = '' } = useParams()
  const { api } = useApp()
  const world = useWorld()
  const navigate = useNavigate()
  const location = useLocation()
  const arrival = location.state as { animate?: boolean; justSent?: boolean } | null
  const still = useReducedMotion()

  const { data: letter, loading, error, reload, setData } = useAsync(() => api.getLetter(id), [api, id])
  const hearts = useReactions('letter', letter?.status === 'sent' ? [letter.id] : [])

  const [phase, setPhase] = useState<'pending' | 'envelope' | 'reading'>('pending')
  const [shower, setShower] = useState(Boolean(arrival?.justSent))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const recorded = useRef(false)

  const mine = letter?.author_id === world.me.id
  const openedByMe = Boolean(letter?.opens.some((o) => o.user_id === world.me.id))

  // Decide once, when the letter first arrives, whether to play the envelope.
  useEffect(() => {
    if (!letter || phase !== 'pending') return
    const animate = !still && !mine && (arrival?.animate || !openedByMe)
    setPhase(animate ? 'envelope' : 'reading')
  }, [letter, phase, still, mine, arrival?.animate, openedByMe])

  // "She opened your letter ♡"
  useEffect(() => {
    if (phase !== 'reading' || !letter || mine || openedByMe || recorded.current) return
    recorded.current = true
    void api.markLetterOpened(letter)
  }, [phase, letter, mine, openedByMe, api])

  const reveal = useCallback(() => setPhase('reading'), [])

  if (loading && !letter) return <Spinner label="Fetching the envelope…" />
  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (!letter) {
    return (
      <EmptyState title="This letter is not here" action={<ButtonLink to="/letters">Back to letters</ButtonLink>}>
        It may have been removed.
      </EmptyState>
    )
  }
  if (letter.status === 'draft') return <Navigate to={`/letters/${letter.id}/edit`} replace />

  const author = nameOf(world, letter.author_id)
  const partnerOpen = letter.opens.find((o) => o.user_id !== world.me.id)

  const remove = async () => {
    setWorking(true)
    try {
      await api.deleteLetter(letter.id)
      navigate('/letters', { replace: true })
    } catch (e) {
      setNotice(friendlyError(e))
      setWorking(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      {shower && <HeartShower onDone={() => setShower(false)} />}
      <AnimatePresence mode="wait">
        {phase === 'envelope' && (
          <motion.div key="envelope" exit={{ opacity: 0, y: 30, scale: 0.96 }} transition={{ duration: 0.35 }}>
            <EnvelopeOpening from={author} onDone={reveal} />
          </motion.div>
        )}
        {phase === 'reading' && (
          <motion.div
            key="reading"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-3 flex items-center justify-between">
              <Link
                to="/letters"
                className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
              >
                <ArrowLeft className="size-4" aria-hidden /> Letters
              </Link>
              {mine && (
                <div className="flex gap-1">
                  <Link
                    to={`/letters/${letter.id}/edit`}
                    aria-label="Edit this letter"
                    className="flex size-10 items-center justify-center rounded-full text-peacock-deep hover:bg-peacock-soft/60"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    aria-label="Delete this letter"
                    onClick={() => setConfirmDelete(true)}
                    className="flex size-10 items-center justify-center rounded-full text-rose-deep hover:bg-blush/60"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              )}
            </div>

            {notice && (
              <p role="alert" className="mb-3 rounded-xl bg-blush/60 px-4 py-2.5 text-sm text-rose-deep">
                {notice}
              </p>
            )}

            <article
              className="relative overflow-hidden rounded-sm border border-gold/25 bg-paper px-6 pt-8 pb-7 shadow-polaroid sm:px-10"
              style={{ backgroundImage: LETTER_PAPER, backgroundPosition: '0 5.2rem' }}
            >
              <span className="pointer-events-none absolute inset-y-0 left-8 w-px bg-rose/25 sm:left-12" aria-hidden />
              <p className="eyebrow text-center">
                {mine ? 'Your letter' : `A letter from ${author}`} · {formatLong(localDay(letter.sent_at ?? letter.created_at))}
              </p>
              {letter.title && (
                <h1 className="hand mt-3 text-center text-[2.4rem] leading-tight text-rose-deep">{letter.title}</h1>
              )}
              <LotusDivider className="mt-3 mb-5" />
              <div className="font-serif text-[1.3rem] leading-[2.1rem] break-words whitespace-pre-line text-ink">
                {letter.body}
              </div>
              <p className="hand mt-8 text-right text-[1.6rem] text-rose-deep">— {author} ♡</p>
            </article>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1">
              <HeartButton
                type="letter"
                targetId={letter.id}
                reactions={hearts.forTarget(letter.id)}
                onChange={(next) => hearts.replace(letter.id, next)}
              />
              {mine && (
                <p className="text-sm text-ink-soft">
                  {partnerOpen
                    ? `${nameOf(world, partnerOpen.user_id)} opened this ${timeAgo(partnerOpen.opened_at)} ♡`
                    : 'Not opened yet'}
                </p>
              )}
            </div>

            <Replies
              replies={letter.replies}
              onAdd={async (body) => {
                const reply = await api.addLetterReply(letter, body)
                setData((current) => (current ? { ...current, replies: [...current.replies, reply] } : current))
              }}
              onRemove={async (reply) => {
                await api.deleteLetterReply(reply.id)
                setData((current) =>
                  current ? { ...current, replies: current.replies.filter((r) => r.id !== reply.id) } : current,
                )
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this letter?"
        message="It will disappear for both of you, along with its replies. This cannot be undone."
        confirmLabel="Delete letter"
        busy={working}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}

function Replies({
  replies,
  onAdd,
  onRemove,
}: {
  replies: LetterReply[]
  onAdd: (body: string) => Promise<void>
  onRemove: (reply: LetterReply) => Promise<void>
}) {
  const world = useWorld()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<LetterReply | null>(null)
  const [working, setWorking] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true)
    setError(null)
    try {
      await onAdd(body)
      setText('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setWorking(true)
    try {
      await onRemove(removing)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setWorking(false)
      setRemoving(null)
    }
  }

  return (
    <section className="mt-8" aria-label="Replies">
      <p className="eyebrow mb-3 text-center">Written back</p>
      {replies.length > 0 && (
        <ul className="mb-4 space-y-3">
          {replies.map((reply) => (
            <motion.li
              key={reply.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="paper relative px-5 py-4"
            >
              <p className="hand whitespace-pre-line text-ink">{reply.body}</p>
              <p className="mt-1 text-xs text-ink-soft">
                — {nameOf(world, reply.author_id)} · {timeAgo(reply.created_at)}
              </p>
              {reply.author_id === world.me.id && (
                <button
                  type="button"
                  onClick={() => setRemoving(reply)}
                  aria-label="Remove your reply"
                  className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full text-ink-soft hover:bg-blush/60 hover:text-rose-deep"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </motion.li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="paper flex items-end gap-2 p-3" noValidate>
        <label htmlFor="reply" className="sr-only">
          Write back
        </label>
        <textarea
          id="reply"
          rows={2}
          maxLength={2000}
          className="field hand flex-1 resize-none border-none bg-transparent shadow-none focus:shadow-none"
          placeholder="Write back…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" busy={busy} aria-label="Send reply" className="px-4">
          <Send className="size-4" aria-hidden />
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-deep">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Remove your reply?"
        message="It will disappear for both of you."
        confirmLabel="Remove reply"
        busy={working}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  )
}
