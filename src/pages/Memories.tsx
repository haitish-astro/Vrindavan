import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { ArrowDownUp, Clock, Images, Plus, Video } from 'lucide-react'
import { useApp, useWorld } from '../app/AppContext'
import { useAsync } from '../lib/hooks'
import { formatMinutes, formatShort, yearOf } from '../lib/dates'
import type { Memory } from '../lib/types'
import { Polaroid, coverPath } from '../components/Polaroid'
import { ButtonLink, EmptyState, ErrorNote, Page, PageHeader, PrivatePhoto, Spinner } from '../components/ui'

type Tab = 'adventures' | 'calls'

export default function Memories() {
  const { api } = useApp()
  const { space } = useWorld()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'calls' ? 'calls' : 'adventures'
  const memories = useAsync(() => api.listMemories(space.id), [api, space.id])
  const [year, setYear] = useState<number | 'all'>('all')
  const [oldestFirst, setOldestFirst] = useState(false)

  const ofTab = useMemo(
    () => (memories.data ?? []).filter((m) => (tab === 'calls' ? m.kind === 'call' : m.kind !== 'call')),
    [memories.data, tab],
  )
  const years = useMemo(() => [...new Set(ofTab.map((m) => yearOf(m.happened_on)))].sort((a, b) => b - a), [ofTab])
  const shown = useMemo(() => {
    const list = ofTab.filter((m) => year === 'all' || yearOf(m.happened_on) === year)
    return oldestFirst ? [...list].reverse() : list
  }, [ofTab, year, oldestFirst])
  const totalMinutes = useMemo(() => ofTab.reduce((sum, m) => sum + (m.call_minutes ?? 0), 0), [ofTab])

  const select = (next: Tab) => {
    setYear('all')
    setParams(next === 'calls' ? { tab: 'calls' } : {}, { replace: true })
  }
  const chip = (active: boolean) =>
    `min-h-10 rounded-full px-4 text-sm font-semibold transition ${
      active ? 'bg-peacock text-white' : 'border border-peacock/20 bg-paper text-ink-soft hover:text-peacock-deep'
    }`
  const addTo = tab === 'calls' ? '/memories/new?kind=call' : '/memories/new'

  return (
    <Page>
      <PageHeader
        eyebrow={tab === 'calls' ? 'Across the miles' : 'Our adventures'}
        title={tab === 'calls' ? 'FaceTime' : 'Memories'}
        subtitle={tab === 'calls' ? 'The calls that kept us close.' : 'Every page of our scrapbook.'}
        action={
          <ButtonLink to={addTo}>
            <Plus className="size-4" aria-hidden /> {tab === 'calls' ? 'Save a FaceTime' : 'Add a Memory'}
          </ButtonLink>
        }
      />

      <div role="tablist" aria-label="Adventures or FaceTime" className="paper mb-6 flex gap-1 p-1">
        {(['adventures', 'calls'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => select(name)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-semibold transition ${
              tab === name ? 'text-peacock-deep' : 'text-ink-soft hover:text-peacock-deep'
            }`}
          >
            {tab === name && (
              <motion.span
                layoutId="memories-tab"
                className="absolute inset-0 rounded-full bg-peacock-soft"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {name === 'calls' ? <Video className="size-4" aria-hidden /> : <Images className="size-4" aria-hidden />}
              {name === 'calls' ? 'FaceTime' : 'Adventures'}
            </span>
          </button>
        ))}
      </div>

      {memories.loading && <Spinner label="Opening the scrapbook…" />}
      {memories.error && <ErrorNote message={memories.error} onRetry={memories.reload} />}

      {memories.data && ofTab.length === 0 && (
        <EmptyState
          title={tab === 'calls' ? 'No FaceTimes saved yet' : 'The first page is blank'}
          action={
            <ButtonLink to={addTo}>
              <Plus className="size-4" aria-hidden /> {tab === 'calls' ? 'Save our first FaceTime' : 'Add our first memory'}
            </ButtonLink>
          }
        >
          {tab === 'calls'
            ? 'A screenshot of a sleepy smile, a recording of a song, how long you talked — keep the calls that kept you close.'
            : 'A walk, a chai, a sunset — anything can become a memory. Add photos, videos and a few words.'}
        </EmptyState>
      )}

      {ofTab.length > 0 && (
        <>
          {tab === 'calls' && totalMinutes > 0 && (
            <p className="hand mb-4 text-center text-[1.4rem] text-rose-deep">
              {formatMinutes(totalMinutes)} of talking, and counting ♡
            </p>
          )}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            {years.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by year">
                <button type="button" className={chip(year === 'all')} aria-pressed={year === 'all'} onClick={() => setYear('all')}>
                  All
                </button>
                {years.map((y) => (
                  <button key={y} type="button" className={chip(year === y)} aria-pressed={year === y} onClick={() => setYear(y)}>
                    {y}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setOldestFirst((v) => !v)}
              className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-peacock-deep hover:bg-peacock-soft/50"
            >
              <ArrowDownUp className="size-4" aria-hidden />
              {oldestFirst ? 'Oldest first' : 'Newest first'}
            </button>
          </div>

          {tab === 'calls' ? (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {shown.map((memory, index) => (
                <li key={memory.id}>
                  <CallCard memory={memory} index={index} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6">
              {shown.map((memory, index) => (
                <li key={memory.id}>
                  <Polaroid memory={memory} index={index} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Page>
  )
}

/** A FaceTime memory, shown as a little phone screen. */
function CallCard({ memory, index }: { memory: Memory; index: number }) {
  const cover = coverPath(memory)
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.45, delay: Math.min(index, 6) * 0.04 }}
    >
      <Link
        to={`/memories/${memory.id}`}
        className="block rounded-[1.75rem] border-[5px] border-ink/85 bg-ink/85 shadow-polaroid"
        aria-label={`${memory.title}, FaceTime on ${formatShort(memory.happened_on)}`}
      >
        <div className="relative aspect-[9/14] overflow-hidden rounded-[1.4rem]">
          {cover ? (
            <PrivatePhoto path={cover} alt="" className="size-full" />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-blush via-lavender to-peacock-soft">
              <span className="text-4xl">{memory.emoji ?? '📞'}</span>
            </div>
          )}
          {/* the little self-view and call bar, like a FaceTime screen */}
          <span className="absolute top-2 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full bg-ink/70" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 via-ink/40 to-transparent px-3 pt-8 pb-3 text-white">
            <p className="hand truncate text-[1.25rem] leading-tight">{memory.title}</p>
            <p className="mt-0.5 flex items-center gap-2 text-[0.7rem] opacity-90">
              <span>{formatShort(memory.happened_on)}</span>
              {memory.call_minutes ? (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="size-3" aria-hidden /> {formatMinutes(memory.call_minutes)}
                </span>
              ) : null}
            </p>
          </div>
          {memory.photos.length > 1 && (
            <span className="absolute top-3 right-3 rounded-full bg-ink/55 px-2 py-0.5 text-[0.65rem] font-semibold text-white">
              {memory.photos.length}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
