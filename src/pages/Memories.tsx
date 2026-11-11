import { useMemo, useState } from 'react'
import { ArrowDownUp, Plus } from 'lucide-react'
import { useApp, useWorld } from '../app/AppContext'
import { useAsync } from '../lib/hooks'
import { yearOf } from '../lib/dates'
import { Polaroid } from '../components/Polaroid'
import { ButtonLink, EmptyState, ErrorNote, Page, PageHeader, Spinner } from '../components/ui'

export default function Memories() {
  const { api } = useApp()
  const { space } = useWorld()
  const memories = useAsync(() => api.listMemories(space.id), [api, space.id])
  const [year, setYear] = useState<number | 'all'>('all')
  const [oldestFirst, setOldestFirst] = useState(false)

  const years = useMemo(
    () => [...new Set((memories.data ?? []).map((m) => yearOf(m.happened_on)))].sort((a, b) => b - a),
    [memories.data],
  )
  const shown = useMemo(() => {
    const list = (memories.data ?? []).filter((m) => year === 'all' || yearOf(m.happened_on) === year)
    return oldestFirst ? [...list].reverse() : list
  }, [memories.data, year, oldestFirst])

  const chip = (active: boolean) =>
    `min-h-10 rounded-full px-4 text-sm font-semibold transition ${
      active ? 'bg-peacock text-white' : 'border border-peacock/20 bg-paper text-ink-soft hover:text-peacock-deep'
    }`

  return (
    <Page>
      <PageHeader
        eyebrow="Our adventures"
        title="Memories"
        subtitle="Every page of our scrapbook."
        action={
          <ButtonLink to="/memories/new">
            <Plus className="size-4" aria-hidden /> Add a Memory
          </ButtonLink>
        }
      />

      {memories.loading && <Spinner label="Opening the scrapbook…" />}
      {memories.error && <ErrorNote message={memories.error} onRetry={memories.reload} />}

      {memories.data && memories.data.length === 0 && (
        <EmptyState
          title="The first page is blank"
          action={
            <ButtonLink to="/memories/new">
              <Plus className="size-4" aria-hidden /> Add our first memory
            </ButtonLink>
          }
        >
          A walk, a chai, a sunset — anything can become a memory. Add a photo and a few words.
        </EmptyState>
      )}

      {memories.data && memories.data.length > 0 && (
        <>
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

          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6">
            {shown.map((memory, index) => (
              <li key={memory.id}>
                <Polaroid memory={memory} index={index} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}
