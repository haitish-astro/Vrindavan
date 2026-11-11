import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CalendarDays, Milestone as MilestoneIcon, Plus, Sparkles as SparklesIcon } from 'lucide-react'
import { useApp, useWorld } from '../app/AppContext'
import { useAsync } from '../lib/hooks'
import { messageForToday } from '../lib/dailyMessages'
import { dayOfYear, daysBetween, formatLong, todayISO } from '../lib/dates'
import type { Memory } from '../lib/types'
import { LotusDivider } from '../components/Decor'
import { Polaroid } from '../components/Polaroid'
import { ButtonLink, EmptyState, ErrorNote, Page, Spinner } from '../components/ui'

const GREETINGS = [
  'Welcome back to our little world ♡',
  'Another beautiful day in our story.',
  'Somewhere between Radha and Krishna, we found a little world of our own.',
]

export default function Home() {
  const { api } = useApp()
  const world = useWorld()
  const { space, me } = world
  const memories = useAsync(() => api.listMemories(space.id), [api, space.id])

  const greeting = space.welcome_greeting?.trim() || GREETINGS[dayOfYear() % GREETINGS.length]!
  const thought = useMemo(() => messageForToday(), [])
  const days = space.first_met_on ? daysBetween(space.first_met_on, todayISO()) : null

  const latest = memories.data?.[0]
  const older = useMemo(() => (memories.data ?? []).slice(1), [memories.data])
  const [throwbackSeed, setThrowbackSeed] = useState(() => Math.random())
  const throwback: Memory | undefined = older.length
    ? older[Math.floor(throwbackSeed * older.length) % older.length]
    : undefined

  return (
    <Page className="space-y-7">
      {/* A. greeting */}
      <section className="pt-2 text-center">
        {me.display_name && <p className="eyebrow mb-2">Radhe Radhe, {me.display_name}</p>}
        <h1 className="mx-auto max-w-md text-[2rem] leading-tight text-peacock-deep sm:text-4xl">{greeting}</h1>
      </section>

      {/* B. our story counter */}
      <section className="paper px-6 py-6 text-center" aria-label="Our story counter">
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
      </section>

      {/* C. today's thought */}
      <section className="px-3 text-center" aria-label="Today's thought">
        <p className="eyebrow mb-2">Today&rsquo;s thought</p>
        <p className="font-serif text-[1.4rem] leading-snug text-ink italic">{thought}</p>
        <LotusDivider className="mt-5" />
      </section>

      {/* D. a little note (the featured message from Settings, until letters arrive) */}
      {space.featured_message?.trim() && (
        <section className="paper relative px-6 py-6" aria-label="A little note for you">
          <p className="eyebrow mb-2">A little note for you</p>
          <p className="hand whitespace-pre-line text-rose-deep">{space.featured_message}</p>
        </section>
      )}

      {/* E + G. latest adventure and a throwback */}
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

      {/* H. quick actions */}
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Quick actions">
        <ButtonLink to="/memories/new" className="w-full">
          <Plus className="size-4" aria-hidden /> Add a Memory
        </ButtonLink>
        <ButtonLink to="/story?new=1" variant="soft" className="w-full">
          <MilestoneIcon className="size-4" aria-hidden /> Add a Milestone
        </ButtonLink>
      </section>
    </Page>
  )
}
