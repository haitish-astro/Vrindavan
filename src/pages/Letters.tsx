import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { Heart, MessageCircle, PenLine } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { useAsync } from '../lib/hooks'
import { formatShort, localDay, timeAgo } from '../lib/dates'
import type { Letter } from '../lib/types'
import { Envelope } from '../components/Envelope'
import { useReactions } from '../components/Hearts'
import { LittleNotes } from '../components/LittleNotes'
import { ButtonLink, EmptyState, ErrorNote, Page, PageHeader, Spinner } from '../components/ui'

/** Letters from my heart, and the little notes — two tabs of one place. */
export default function Letters() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'notes' ? 'notes' : 'letters'

  const select = (next: 'letters' | 'notes') =>
    setParams(next === 'notes' ? { tab: 'notes' } : {}, { replace: true })

  const tabClass = (active: boolean) =>
    `relative flex-1 rounded-full py-2.5 text-sm font-semibold transition ${
      active ? 'text-peacock-deep' : 'text-ink-soft hover:text-peacock-deep'
    }`

  return (
    <Page>
      <PageHeader
        eyebrow="Letters from my heart"
        title={tab === 'notes' ? 'Little notes' : 'Letters'}
        subtitle={tab === 'notes' ? 'Everyday affection, in a few words.' : 'Words worth keeping, sealed with love.'}
        action={
          tab === 'letters' ? (
            <ButtonLink to="/letters/new">
              <PenLine className="size-4" aria-hidden /> Write a letter
            </ButtonLink>
          ) : undefined
        }
      />

      <div role="tablist" aria-label="Letters or little notes" className="paper mb-6 flex gap-1 p-1">
        {(['letters', 'notes'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tabClass(tab === name)}
            onClick={() => select(name)}
          >
            {tab === name && (
              <motion.span
                layoutId="letters-tab"
                className="absolute inset-0 rounded-full bg-peacock-soft"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{name === 'letters' ? 'Letters' : 'Little notes'}</span>
          </button>
        ))}
      </div>

      {tab === 'letters' ? <LetterShelf /> : <LittleNotes autoFocus={params.get('write') === '1'} />}
    </Page>
  )
}

function LetterShelf() {
  const { api } = useApp()
  const world = useWorld()
  const me = world.me.id
  const letters = useAsync(() => api.listLetters(world.space.id), [api, world.space.id])
  const sentIds = useMemo(
    () => (letters.data ?? []).filter((l) => l.status === 'sent').map((l) => l.id),
    [letters.data],
  )
  const hearts = useReactions('letter', sentIds)

  const groups = useMemo(() => {
    const all = letters.data ?? []
    const byDate = (a: Letter, b: Letter) => (b.sent_at ?? b.updated_at).localeCompare(a.sent_at ?? a.updated_at)
    return {
      forMe: all.filter((l) => l.status === 'sent' && l.author_id !== me).sort(byDate),
      fromMe: all.filter((l) => l.status === 'sent' && l.author_id === me).sort(byDate),
      drafts: all.filter((l) => l.status === 'draft' && l.author_id === me).sort(byDate),
    }
  }, [letters.data, me])

  if (letters.loading) return <Spinner label="Gathering the envelopes…" />
  if (letters.error) return <ErrorNote message={letters.error} onRetry={letters.reload} />

  if (!letters.data?.length) {
    return (
      <EmptyState
        title="No letters yet"
        action={
          <ButtonLink to="/letters/new">
            <PenLine className="size-4" aria-hidden /> Write the first one
          </ButtonLink>
        }
      >
        Some things are better said slowly. Write a letter — they can open it whenever they like.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-9">
      {groups.forMe.length > 0 && (
        <Shelf title={`From ${nameOf(world, groups.forMe[0]!.author_id)}`}>
          {groups.forMe.map((letter, i) => (
            <EnvelopeTile key={letter.id} letter={letter} index={i} hearts={hearts.forTarget(letter.id).length} />
          ))}
        </Shelf>
      )}
      {groups.fromMe.length > 0 && (
        <Shelf title="From you">
          {groups.fromMe.map((letter, i) => (
            <EnvelopeTile key={letter.id} letter={letter} index={i} hearts={hearts.forTarget(letter.id).length} />
          ))}
        </Shelf>
      )}
      {groups.drafts.length > 0 && (
        <section>
          <h2 className="eyebrow mb-3">Your drafts · only you can see these</h2>
          <ul className="space-y-2">
            {groups.drafts.map((letter) => (
              <li key={letter.id}>
                <Link
                  to={`/letters/${letter.id}/edit`}
                  className="paper flex items-center gap-3 border-dashed px-4 py-3 transition hover:-translate-y-0.5"
                >
                  <PenLine className="size-4 shrink-0 text-gold" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-ink">{letter.title || 'Untitled letter'}</span>
                    <span className="block truncate text-sm text-ink-soft">{letter.body}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">{timeAgo(letter.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Shelf({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-3">{title}</h2>
      <ul className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3">{children}</ul>
    </section>
  )
}

function EnvelopeTile({ letter, index, hearts }: { letter: Letter; index: number; hearts: number }) {
  const world = useWorld()
  const mine = letter.author_id === world.me.id
  const openedByMe = mine || letter.opens.some((o) => o.user_id === world.me.id)
  const openedByThem = letter.opens.some((o) => o.user_id !== world.me.id)
  const tilt = [-1.5, 1.2, -0.6, 1.6][index % 4]

  return (
    <motion.li
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: Math.min(index, 5) * 0.05 }}
    >
      <Link
        to={`/letters/${letter.id}`}
        state={{ animate: true }}
        className="group block"
        aria-label={`${letter.title || 'A letter'}${openedByMe ? '' : ', not opened yet'}`}
      >
        <motion.div style={{ rotate: tilt }} whileHover={{ rotate: 0, y: -4 }} transition={{ duration: 0.3 }}>
          <Envelope sealed={!openedByMe} open={false} rise={openedByMe ? 0 : 0} />
        </motion.div>
        <p className="hand mt-3 truncate text-ink">{letter.title || 'A letter'}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
          <span>{formatShort(localDay(letter.sent_at ?? letter.updated_at))}</span>
          {!openedByMe && <span className="font-semibold text-rose-deep">New ♡</span>}
          {mine && <span>{openedByThem ? 'Opened' : 'Not opened yet'}</span>}
          {hearts > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Heart className="size-3 fill-rose text-rose" aria-hidden /> {hearts}
            </span>
          )}
          {letter.replies.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageCircle className="size-3" aria-hidden /> {letter.replies.length}
            </span>
          )}
        </p>
      </Link>
    </motion.li>
  )
}
