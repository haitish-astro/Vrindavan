import { useMemo, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Send, X } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { timeAgo } from '../lib/dates'
import type { QuickNote } from '../lib/types'
import { HeartButton, useReactions } from './Hearts'
import { Button, ConfirmDialog, EmptyState, ErrorNote, Spinner } from './ui'

const STARTERS = ['Thinking of you ♡', 'Good morning, my love', 'I’m proud of you', 'Can’t wait to see you', 'You make my days softer']
const COLORS = ['bg-[#fbe3e6]', 'bg-[#ebe5f5]', 'bg-[#f5ebcf]', 'bg-[#dfeeee]', 'bg-[#e6eddc]']
const MAX = 500

/** Quick notes: write one in a few seconds, keep them all like sticky notes. */
export function LittleNotes({ autoFocus = false, limit }: { autoFocus?: boolean; limit?: number }) {
  const { api } = useApp()
  const world = useWorld()
  const notes = useAsync(() => api.listQuickNotes(world.space.id, limit), [api, world.space.id, limit])
  const ids = useMemo(() => (notes.data ?? []).map((n) => n.id), [notes.data])
  const hearts = useReactions('quick_note', ids)

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<QuickNote | null>(null)
  const [working, setWorking] = useState(false)

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    const body = text.trim()
    if (!body) return setError('Write a few words first.')
    setBusy(true)
    setError(null)
    try {
      const note = await api.addQuickNote(world.space.id, body)
      notes.setData((current) => [note, ...(current ?? [])])
      setText('')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setWorking(true)
    try {
      await api.deleteQuickNote(removing.id)
      notes.setData((current) => (current ?? []).filter((n) => n.id !== removing.id))
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setWorking(false)
      setRemoving(null)
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={send} className="paper space-y-3 p-4 sm:p-5" noValidate>
        <label htmlFor="little-note" className="sr-only">
          A little note
        </label>
        <textarea
          id="little-note"
          rows={2}
          autoFocus={autoFocus}
          maxLength={MAX}
          className="field hand resize-none text-[1.35rem]"
          placeholder="Hey, I was thinking about you today ♡"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
          }}
        />
        <div className="flex flex-wrap gap-2" aria-label="Quick ideas">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => setText(starter)}
              className="rounded-full border border-rose/30 bg-blush/40 px-3 py-1.5 text-sm text-rose-deep transition hover:bg-blush"
            >
              {starter}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-rose-deep">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-soft">{text.length > MAX - 80 ? `${MAX - text.length} left` : ''}</span>
          <Button type="submit" busy={busy}>
            <Send className="size-4" aria-hidden /> Leave this note
          </Button>
        </div>
      </form>

      {notes.loading && <Spinner label="Finding the little notes…" />}
      {notes.error && <ErrorNote message={notes.error} onRetry={notes.reload} />}
      {notes.data && notes.data.length === 0 && (
        <EmptyState title="No little notes yet">A few words, any time. They stay here for both of you.</EmptyState>
      )}

      {notes.data && notes.data.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <AnimatePresence initial={false}>
            {notes.data.map((note, index) => (
              <StickyNote
                key={note.id}
                note={note}
                index={index}
                author={nameOf(world, note.author_id)}
                mine={note.author_id === world.me.id}
                hearts={hearts.forTarget(note.id)}
                onHearts={(next) => hearts.replace(note.id, next)}
                onRemove={() => setRemoving(note)}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this little note?"
        message="It will disappear for both of you. This cannot be undone."
        confirmLabel="Remove note"
        busy={working}
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function StickyNote({
  note,
  index,
  author,
  mine,
  hearts,
  onHearts,
  onRemove,
}: {
  note: QuickNote
  index: number
  author: string
  mine: boolean
  hearts: Parameters<typeof HeartButton>[0]['reactions']
  onHearts: Parameters<typeof HeartButton>[0]['onChange']
  onRemove: () => void
}) {
  const tilt = [-2, 1.5, -1, 2.2, -1.6][index % 5]!
  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.85, rotate: tilt * 3 }}
      animate={{ opacity: 1, scale: 1, rotate: tilt }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileHover={{ rotate: 0, y: -3 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className={`relative flex min-h-36 flex-col rounded-sm p-4 pb-2 shadow-polaroid ${COLORS[index % COLORS.length]}`}
    >
      {/* a little strip of washi tape */}
      <span className="absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 rotate-[-3deg] bg-gold-soft/80" aria-hidden />
      {mine && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this note"
          className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full text-ink-soft/70 hover:bg-white/50 hover:text-rose-deep"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      <p className="hand flex-1 text-[1.3rem] leading-snug break-words whitespace-pre-line text-ink">{note.body}</p>
      <div className="mt-2 flex items-end justify-between gap-1">
        <p className="text-xs text-ink-soft">
          — {author}
          <br />
          {timeAgo(note.created_at)}
        </p>
        <HeartButton type="quick_note" targetId={note.id} reactions={hearts} onChange={onHearts} showCaption={false} />
      </div>
    </motion.li>
  )
}
