import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Trash2 } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { formatLong, parseISO, todayISO } from '../lib/dates'
import { countdown, downloadICS, formatTimeOfDay, monthGrid, occursOn, ordinal, upcoming, type Occurrence } from '../lib/calendar'
import type { CalendarEvent, CalendarEventInput } from '../lib/types'
import { WeekSchedule } from '../components/WeekSchedule'
import { Button, ConfirmDialog, ErrorNote, Label, Modal, Page, PageHeader, Spinner } from '../components/ui'

const SYMBOLS = ['♡', '🎂', '💍', '✈️', '📞', '🎉', '🌸', '🍽️', '🎬', '⭐']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function Calendar() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'week' ? 'week' : 'dates'
  const select = (next: 'dates' | 'week') => setParams(next === 'week' ? { tab: 'week' } : {}, { replace: true })

  return (
    <Page>
      <Link
        to="/world"
        className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
      >
        <ArrowLeft className="size-4" aria-hidden /> Our World
      </Link>
      <PageHeader
        eyebrow="Our calendar"
        title={tab === 'week' ? 'Our week' : 'Special dates'}
        subtitle={tab === 'week' ? 'When each of you is busy — and when you are both free.' : 'The days worth remembering, and the ones to look forward to.'}
      />
      <div role="tablist" aria-label="Special dates or our week" className="paper mb-6 flex gap-1 p-1">
        {(['dates', 'week'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => select(name)}
            className={`relative flex-1 rounded-full py-2.5 text-sm font-semibold transition ${
              tab === name ? 'text-peacock-deep' : 'text-ink-soft hover:text-peacock-deep'
            }`}
          >
            {tab === name && (
              <motion.span
                layoutId="calendar-tab"
                className="absolute inset-0 rounded-full bg-peacock-soft"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative">{name === 'week' ? 'Our week' : 'Special dates'}</span>
          </button>
        ))}
      </div>
      {tab === 'week' ? <WeekSchedule /> : <SpecialDates />}
    </Page>
  )
}

function SpecialDates() {
  const { api } = useApp()
  const world = useWorld()
  const events = useAsync(() => api.listEvents(world.space.id), [api, world.space.id])
  const today = todayISO()
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [selected, setSelected] = useState(today)
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null)
  const [removing, setRemoving] = useState<CalendarEvent | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // "The day we met" comes from Our Details and repeats every year.
  const all = useMemo<CalendarEvent[]>(() => {
    const list = [...(events.data ?? [])]
    if (world.space.first_met_on) {
      list.push({
        id: 'first-met',
        space_id: world.space.id,
        created_by: '',
        title: 'The day we met',
        event_date: world.space.first_met_on,
        event_time: null,
        note: null,
        yearly: true,
        symbol: '♡',
        created_at: '',
      })
    }
    return list
  }, [events.data, world.space.first_met_on, world.space.id])

  const days = useMemo(() => monthGrid(month.y, month.m), [month])
  const onDay = (day: string) => all.map((e) => occursOn(e, day)).filter((o): o is Occurrence => o !== null)
  const soon = useMemo(() => upcoming(all, 6), [all])
  const selectedOccurrences = onDay(selected)
  const monthLabel = new Date(month.y, month.m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const shift = (delta: number) =>
    setMonth(({ y, m }) => {
      const d = new Date(y, m - 1 + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() + 1 }
    })

  const saved = (event: CalendarEvent) => {
    events.setData((list) => [...(list ?? []).filter((e) => e.id !== event.id), event])
    setSelected(event.event_date >= today || !event.yearly ? event.event_date : selected)
    setEditing(null)
  }
  const remove = async () => {
    if (!removing) return
    try {
      await api.deleteEvent(removing.id)
      events.setData((list) => (list ?? []).filter((e) => e.id !== removing.id))
    } catch (e) {
      setNotice(friendlyError(e))
    } finally {
      setRemoving(null)
    }
  }

  if (events.loading) return <Spinner label="Opening the calendar…" />
  if (events.error) return <ErrorNote message={events.error} onRetry={events.reload} />

  return (
    <div className="space-y-6">
      {notice && (
        <p role="alert" className="rounded-xl bg-blush/60 px-4 py-2 text-sm text-rose-deep">
          {notice}
        </p>
      )}

      {/* coming up */}
      {soon.length > 0 && (
        <section aria-label="Coming up">
          <p className="eyebrow mb-3">Coming up</p>
          <ul className="flex snap-x gap-3 overflow-x-auto pb-2">
            {soon.map((o, i) => (
              <motion.li
                key={`${o.event.id}-${o.date}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="snap-start"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelected(o.date)
                    setMonth({ y: Number(o.date.slice(0, 4)), m: Number(o.date.slice(5, 7)) })
                  }}
                  className={`paper flex w-40 flex-col items-start px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                    i === 0 ? 'border-rose/40 bg-blush/40' : ''
                  }`}
                >
                  <span className="text-2xl">{o.event.symbol ?? '♡'}</span>
                  <span className="mt-1 line-clamp-2 font-semibold text-ink">{o.event.title}</span>
                  <span className="mt-1 text-xs text-ink-soft">
                    {parseISO(o.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                  <span className="hand text-[1.2rem] text-rose-deep">{countdown(o.date)}</span>
                </button>
              </motion.li>
            ))}
          </ul>
        </section>
      )}

      {/* month */}
      <section className="paper p-4 sm:p-5" aria-label="Month">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="flex size-10 items-center justify-center rounded-full hover:bg-peacock-soft/60">
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <h2 className="font-serif text-2xl text-peacock-deep">{monthLabel}</h2>
          <button type="button" onClick={() => shift(1)} aria-label="Next month" className="flex size-10 items-center justify-center rounded-full hover:bg-peacock-soft/60">
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center" role="grid" aria-label={monthLabel}>
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-[0.68rem] font-bold tracking-wider text-ink-soft uppercase" role="columnheader">
              {w}
            </div>
          ))}
          {days.map((day) => {
            const inMonth = Number(day.slice(5, 7)) === month.m
            const items = onDay(day)
            const isToday = day === today
            const isSelected = day === selected
            return (
              <button
                key={day}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${formatLong(day)}${items.length ? `, ${items.map((o) => o.event.title).join(', ')}` : ''}`}
                onClick={() => setSelected(day)}
                className={`relative flex aspect-square flex-col items-center justify-start rounded-xl pt-1.5 text-sm transition ${
                  isSelected ? 'bg-peacock text-white shadow-soft' : isToday ? 'bg-blush/60 font-bold text-rose-deep' : 'hover:bg-peacock-soft/50'
                } ${inMonth ? '' : 'opacity-35'}`}
              >
                {Number(day.slice(8))}
                {items.length > 0 && (
                  <span className="mt-0.5 flex max-w-full gap-0.5 overflow-hidden text-[0.7rem] leading-none" aria-hidden>
                    {items.slice(0, 2).map((o) => (
                      <span key={o.event.id}>{o.event.symbol ?? '♡'}</span>
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* the chosen day */}
      <section aria-label={formatLong(selected)}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-serif text-2xl text-peacock-deep">{formatLong(selected)}</h2>
          <Button variant="soft" onClick={() => setEditing('new')} className="px-4">
            <Plus className="size-4" aria-hidden /> Add
          </Button>
        </div>
        <AnimatePresence initial={false}>
          {selectedOccurrences.length === 0 ? (
            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="paper px-5 py-4 text-sm text-ink-soft">
              Nothing here yet. Add a birthday, a trip, an anniversary — anything worth looking forward to.
            </motion.p>
          ) : (
            <ul className="space-y-2">
              {selectedOccurrences.map((o) => {
                const virtual = o.event.id === 'first-met'
                const mine = o.event.created_by === world.me.id
                return (
                  <motion.li
                    key={o.event.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="paper flex items-start gap-3 px-4 py-3"
                  >
                    <span className="text-2xl leading-none">{o.event.symbol ?? '♡'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">
                        {o.event.title}
                        {o.event.yearly && o.years > 0 && (
                          <span className="ml-1.5 text-sm font-normal text-rose-deep">· {ordinal(o.years)} year</span>
                        )}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-soft">
                        {o.event.event_time && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock3 className="size-3" aria-hidden /> {formatTimeOfDay(o.event.event_time)}
                          </span>
                        )}
                        {o.event.yearly && <span>every year</span>}
                        {!virtual && <span>added by {nameOf(world, o.event.created_by)}</span>}
                        <span className="text-rose-deep">{countdown(o.date)}</span>
                      </p>
                      {o.event.note && <p className="mt-1 text-sm whitespace-pre-line text-ink">{o.event.note}</p>}
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      {!virtual && (
                        <button
                          type="button"
                          onClick={() => downloadICS(o.event)}
                          aria-label={`Add “${o.event.title}” to your phone's calendar`}
                          title="Add to my phone's calendar"
                          className="flex size-9 items-center justify-center rounded-full text-peacock-deep hover:bg-peacock-soft/60"
                        >
                          <CalendarPlus className="size-4" aria-hidden />
                        </button>
                      )}
                      {mine && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(o.event)}
                            aria-label={`Edit ${o.event.title}`}
                            className="flex size-9 items-center justify-center rounded-full text-peacock-deep hover:bg-peacock-soft/60"
                          >
                            <Pencil className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoving(o.event)}
                            aria-label={`Remove ${o.event.title}`}
                            className="flex size-9 items-center justify-center rounded-full text-rose-deep hover:bg-blush/60"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </>
                      )}
                      {virtual && (
                        <Link to="/settings" aria-label="Change the day we met" className="flex size-9 items-center justify-center rounded-full text-peacock-deep hover:bg-peacock-soft/60">
                          <Pencil className="size-4" aria-hidden />
                        </Link>
                      )}
                    </div>
                  </motion.li>
                )
              })}
            </ul>
          )}
        </AnimatePresence>
      </section>

      <EventForm
        key={editing === 'new' ? `new-${selected}` : (editing?.id ?? 'closed')}
        target={editing}
        defaultDate={selected}
        onClose={() => setEditing(null)}
        onSaved={saved}
      />
      <ConfirmDialog
        open={removing !== null}
        title="Remove this date?"
        message="It will disappear from the calendar for both of you."
        confirmLabel="Remove"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function EventForm({
  target,
  defaultDate,
  onClose,
  onSaved,
}: {
  target: CalendarEvent | 'new' | null
  defaultDate: string
  onClose: () => void
  onSaved: (event: CalendarEvent) => void
}) {
  const { api } = useApp()
  const world = useWorld()
  const existing = target && target !== 'new' ? target : undefined
  const [title, setTitle] = useState(existing?.title ?? '')
  const [date, setDate] = useState(existing?.event_date ?? defaultDate)
  const [time, setTime] = useState(existing?.event_time?.slice(0, 5) ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [yearly, setYearly] = useState(existing?.yearly ?? false)
  const [symbol, setSymbol] = useState(existing?.symbol ?? '♡')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!title.trim()) return setError('What is happening on this day?')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Choose a date.')
    const input: CalendarEventInput = {
      title: title.trim(),
      event_date: date,
      event_time: time || null,
      note: note.trim() || null,
      yearly,
      symbol,
    }
    setBusy(true)
    setError(null)
    try {
      onSaved(await api.saveEvent(world.space.id, existing, input))
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <Modal open={target !== null} onClose={busy ? () => {} : onClose} title={existing ? 'Change this date' : 'Something to remember'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="ev-title">What is it?</Label>
          <input id="ev-title" className="field" maxLength={120} placeholder="Her birthday, our trip to Goa…" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ev-date">Date</Label>
            <input id="ev-date" type="date" className="field" value={date} max="2999-12-31" onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ev-time" hint="optional">
              Time
            </Label>
            <input id="ev-time" type="time" className="field" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-parchment/60 px-4">
          <input type="checkbox" className="size-5 accent-peacock" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
          <span className="text-sm font-semibold">Every year (birthdays, anniversaries)</span>
        </label>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">A little symbol</legend>
          <div className="flex flex-wrap gap-2">
            {SYMBOLS.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={symbol === s}
                aria-label={`Symbol ${s}`}
                onClick={() => setSymbol(s)}
                className={`flex size-10 items-center justify-center rounded-full border text-lg transition ${
                  symbol === s ? 'border-peacock bg-peacock-soft' : 'border-peacock/15 bg-paper'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor="ev-note" hint="optional">
            A note
          </Label>
          <textarea id="ev-note" rows={2} maxLength={1000} className="field resize-none" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-rose-deep">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" busy={busy}>
            <CalendarDays className="size-4" aria-hidden /> {existing ? 'Save' : 'Add to our calendar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
