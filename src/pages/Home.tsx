import { useMemo, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import { friendlyError } from '../data/api'
import { HeartButton, HeartShower, useReactions } from '../components/Hearts'
import type { QuickNote } from '../lib/types'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  CalendarDays,
  KeyRound,
  MessageCircleHeart,
  PenLine,
  Plus,
  Sparkles as SparklesIcon,
  StickyNote,
} from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { useChatStatus } from '../app/ChatContext'
import { useAsync } from '../lib/hooks'
import { messageForToday } from '../lib/dailyMessages'
import { dayOfYear, daysBetween, formatLong, timeAgo, todayISO } from '../lib/dates'
import type { Letter, Memory } from '../lib/types'
import { LotusDivider } from '../components/Decor'
import { Envelope } from '../components/Envelope'
import { Polaroid } from '../components/Polaroid'
import { Button, ButtonLink, EmptyState, ErrorNote, Page, Spinner } from '../components/ui'

const GREETINGS = [
  'Welcome back to our little world ♡',
  'Another beautiful day in our story.',
  'Somewhere between Radha and Krishna, we found a little world of our own.',
]

/** Sections arrive one after another, gently. */
const rise = (i: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.55, delay: 0.08 * i, ease: 'easeOut' as const },
})

export default function Home() {
  const { api } = useApp()
  const world = useWorld()
  const { space, me } = world
  const { unread } = useChatStatus()
  const partner = world.members.find((m) => m.id !== me.id)
  const partnerName = partner ? nameOf(world, partner.id) : 'your love'

  const memories = useAsync(() => api.listMemories(space.id), [api, space.id])
  const letters = useAsync(() => api.listLetters(space.id), [api, space.id])
  const notes = useAsync(() => api.listQuickNotes(space.id, 40), [api, space.id])
  const theirNote = notes.data?.find((n) => n.author_id !== me.id)
  const myNote = notes.data?.find((n) => n.author_id === me.id)

  const greeting = space.welcome_greeting?.trim() || GREETINGS[dayOfYear() % GREETINGS.length]!
  const thought = useMemo(() => messageForToday(), [])
  const days = space.first_met_on ? daysBetween(space.first_met_on, todayISO()) : null

  // The latest letter — theirs to you first, otherwise the latest either of you sent.
  const featured: Letter | undefined = useMemo(() => {
    const sent = (letters.data ?? [])
      .filter((l) => l.status === 'sent')
      .sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''))
    return sent.find((l) => l.author_id !== me.id) ?? sent[0]
  }, [letters.data, me.id])

  const latest = memories.data?.[0]
  const older = useMemo(() => (memories.data ?? []).slice(1), [memories.data])
  const [throwbackSeed, setThrowbackSeed] = useState(() => Math.random())
  const throwback: Memory | undefined = older.length
    ? older[Math.floor(throwbackSeed * older.length) % older.length]
    : undefined

  let step = 0

  return (
    <Page className="space-y-7">
      {/* greeting */}
      <motion.section {...rise(step++)} className="pt-2 text-center">
        {me.display_name && <p className="eyebrow mb-2">Radhe Radhe, {me.display_name}</p>}
        <h1 className="mx-auto max-w-md text-[2rem] leading-tight text-peacock-deep sm:text-4xl">{greeting}</h1>
      </motion.section>

      {/* their latest note to you, and a place to leave yours for them */}
      <motion.div {...rise(step++)}>
        <NoteExchange
          theirNote={theirNote}
          myNote={myNote}
          partnerName={partnerName}
          loading={notes.loading}
          onSent={(note) => notes.setData((current) => [note, ...(current ?? [])])}
        />
      </motion.div>

      {/* a gentle nudge until each person has a key only they know */}
      {me.own_password === false && (
        <motion.div {...rise(step++)}>
          <Link
            to="/settings#password"
            className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft/50 px-4 py-3 text-sm text-ink transition hover:bg-gold-soft"
          >
            <KeyRound className="size-5 shrink-0 text-gold" aria-hidden />
            <span>
              <strong className="font-semibold">Make your key your own.</strong> Choose a password only you know.
            </span>
          </Link>
        </motion.div>
      )}

      {/* our story counter */}
      <motion.section {...rise(step++)} className="paper px-6 py-6 text-center" aria-label="Our story counter">
        {days !== null && days >= 0 ? (
          <>
            <p className="font-serif text-6xl text-peacock">{days.toLocaleString()}</p>
            <p className="mt-1 text-ink-soft">
              {days === 1 ? 'day' : 'days'} of our story, since {formatLong(space.first_met_on!)}
            </p>
          </>
        ) : (
          <>
            <CalendarDays className="mx-auto size-6 text-gold" aria-hidden />
            <p className="mt-2 text-ink-soft">When did our story begin?</p>
            <Link to="/settings" className="mt-1 inline-block font-semibold text-peacock-deep underline-offset-4 hover:underline">
              Set the day we first met
            </Link>
          </>
        )}
      </motion.section>

      {/* chat */}
      <motion.div {...rise(step++)}>
        <Link
          to="/chat"
          className={`flex items-center gap-3 rounded-2xl px-5 py-4 transition hover:-translate-y-0.5 ${
            unread > 0 ? 'bg-peacock text-white shadow-polaroid' : 'paper text-ink'
          }`}
        >
          <motion.span
            animate={unread > 0 ? { scale: [1, 1.18, 1] } : { scale: 1 }}
            transition={{ duration: 1.4, repeat: unread > 0 ? Infinity : 0 }}
            className="flex"
          >
            <MessageCircleHeart className={`size-6 ${unread > 0 ? 'text-white' : 'text-rose'}`} aria-hidden />
          </motion.span>
          <span className="flex-1 font-semibold">
            {unread > 0
              ? `${unread} new message${unread > 1 ? 's' : ''} from ${partnerName} ♡`
              : `Talk to ${partnerName}`}
          </span>
        </Link>
      </motion.div>

      {/* today's thought */}
      <motion.section {...rise(step++)} className="px-3 text-center" aria-label="Today's thought">
        <p className="eyebrow mb-2">Today&rsquo;s thought</p>
        <p className="font-serif text-[1.4rem] leading-snug text-ink italic">{thought}</p>
        <LotusDivider className="mt-5" />
      </motion.section>

      {/* a little note for you: the latest letter */}
      {featured && (
        <motion.section {...rise(step++)} aria-label="A little note for you">
          <p className="eyebrow mb-3 text-center">
            {featured.author_id === me.id ? `Your latest letter to ${partnerName}` : 'A little note for you'}
          </p>
          <Link
            to={`/letters/${featured.id}`}
            state={{ animate: true }}
            className="mx-auto block max-w-xs transition hover:-translate-y-1"
          >
            <Envelope
              sealed={featured.author_id !== me.id && !featured.opens.some((o) => o.user_id === me.id)}
              note={
                <span className="hand text-rose-deep">
                  {featured.title || (featured.author_id === me.id ? 'from you' : `from ${nameOf(world, featured.author_id)}`)}
                </span>
              }
            />
            <p className="mt-3 text-center text-sm font-semibold text-peacock-deep">Tap to open ♡</p>
          </Link>
        </motion.section>
      )}

      {/* latest adventure, or the invitation to make the first one */}
      {memories.loading && <Spinner label="Gathering our memories…" />}
      {memories.error && <ErrorNote message={memories.error} onRetry={memories.reload} />}
      {memories.data && !latest && (
        <EmptyState
          title="Our scrapbook is waiting"
          action={
            <ButtonLink to="/memories/new">
              <Plus className="size-4" aria-hidden /> Add our first memory
            </ButtonLink>
          }
        >
          Every date becomes a memory, and every memory becomes a story. Let&rsquo;s begin with one.
        </EmptyState>
      )}
      {latest && (
        <section aria-label="Our latest adventure">
          <p className="eyebrow mb-3 text-center">Our latest adventure</p>
          <div className="mx-auto max-w-md">
            <Polaroid memory={latest} large />
          </div>
          {latest.description && (
            <p className="mx-auto mt-4 line-clamp-3 max-w-md text-center text-ink-soft">{latest.description}</p>
          )}
        </section>
      )}

      {throwback && (
        <section className="paper px-5 py-5" aria-label="Memory throwback">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">Remember this?</p>
            {older.length > 1 && (
              <button
                type="button"
                onClick={() => setThrowbackSeed(Math.random())}
                className="inline-flex items-center gap-1 text-sm font-semibold text-peacock-deep"
              >
                <SparklesIcon className="size-4" aria-hidden /> Another
              </button>
            )}
          </div>
          <div className="mx-auto max-w-xs">
            <Polaroid memory={throwback} />
          </div>
        </section>
      )}

      {/* quick actions */}
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Quick actions">
        <ButtonLink to="/memories/new" className="w-full">
          <Plus className="size-4" aria-hidden /> Add a Memory
        </ButtonLink>
        <ButtonLink to="/letters?tab=notes&write=1" variant="soft" className="w-full">
          <StickyNote className="size-4" aria-hidden /> Write a Little Note
        </ButtonLink>
        <ButtonLink to="/letters/new" variant="soft" className="w-full">
          <PenLine className="size-4" aria-hidden /> Write a Letter
        </ButtonLink>
      </section>
    </Page>
  )
}

/**
 * The heart of the home page: what they last left for you, and a box to leave something for them.
 * Notes are little notes (the same ones in Letters → Little notes), so nothing is ever lost.
 */
function NoteExchange({
  theirNote,
  myNote,
  partnerName,
  loading,
  onSent,
}: {
  theirNote: QuickNote | undefined
  myNote: QuickNote | undefined
  partnerName: string
  loading: boolean
  onSent: (note: QuickNote) => void
}) {
  const { api } = useApp()
  const world = useWorld()
  const hearts = useReactions('quick_note', theirNote ? [theirNote.id] : [])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justSent, setJustSent] = useState(false)

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    const body = text.trim()
    if (!body) return setError('Write a few words first.')
    setBusy(true)
    setError(null)
    try {
      const note = await api.addQuickNote(world.space.id, body)
      onSent(note)
      setText('')
      setJustSent(true)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3" aria-label={`Notes between you and ${partnerName}`}>
      {justSent && <HeartShower onDone={() => setJustSent(false)} />}

      {/* from them */}
      <div className="relative rounded-sm bg-[#fbe3e6] px-5 pt-6 pb-3 shadow-polaroid">
        <span className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 rotate-[-3deg] bg-gold-soft/80" aria-hidden />
        <p className="eyebrow text-rose-deep">A note from {partnerName}</p>
        {loading ? (
          <p className="mt-2 text-sm text-ink-soft">…</p>
        ) : theirNote ? (
          <>
            <AnimatePresence mode="wait">
              <motion.p
                key={theirNote.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="hand mt-2 text-[1.6rem] leading-snug break-words whitespace-pre-line text-ink"
              >
                {theirNote.body}
              </motion.p>
            </AnimatePresence>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-ink-soft">{timeAgo(theirNote.created_at)}</p>
              <HeartButton
                type="quick_note"
                targetId={theirNote.id}
                reactions={hearts.forTarget(theirNote.id)}
                onChange={(next) => hearts.replace(theirNote.id, next)}
                showCaption={false}
              />
            </div>
          </>
        ) : (
          <p className="hand mt-2 pb-2 text-[1.3rem] text-ink-soft">
            Nothing yet — when {partnerName} leaves you a note, it will be waiting right here.
          </p>
        )}
      </div>

      {/* for them */}
      <form onSubmit={send} className="paper p-4" noValidate>
        <label htmlFor="note-for-them" className="eyebrow mb-2 block">
          Leave a note for {partnerName}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="note-for-them"
            rows={2}
            maxLength={500}
            className="field hand flex-1 resize-none text-[1.3rem]"
            placeholder="Hey, I was thinking about you today ♡"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setJustSent(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
            }}
          />
          <Button type="submit" busy={busy} aria-label={`Send note to ${partnerName}`} className="px-4">
            <Send className="size-4" aria-hidden />
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-deep">
            {error}
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft" role="status">
          <span className="min-w-0 truncate">
            {myNote
              ? `${justSent ? 'Sent ♡ ' : ''}Your last note: “${myNote.body}” · ${timeAgo(myNote.created_at)}`
              : `It will appear at the top of ${partnerName}’s home.`}
          </span>
          <Link to="/letters?tab=notes" className="shrink-0 font-semibold text-peacock-deep">
            All notes →
          </Link>
        </p>
      </form>
    </section>
  )
}
