import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import {
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Repeat,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { daysBetween, parseISO, todayISO } from '../lib/dates'
import { countdown, downloadICS, formatTimeOfDay, monthGrid, occursOn, ordinal, upcoming, type Occurrence } from '../lib/calendar'
import type { CalendarEvent, CalendarEventInput } from '../lib/types'
import { WeekSchedule } from '../components/WeekSchedule'
import { Button, ConfirmDialog, ErrorNote, Label, Modal, Page, PageHeader, Spinner } from '../components/ui'

const SYMBOLS = ['♡', '🎂', '💍', '✈️', '📞', '🎉', '🌸', '🍽️', '🎬', '⭐']
const QUICK_SYMBOLS = ['♡', '🎂', '✈️', '🍽️', '🎉']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const YEARLY_HINT = /birthday|anniversary|bday|first met|we met/i
/** soft card colours for the "coming up" row */
const TINTS = ['from-blush to-[#fbe9ec]', 'from-lavender to-[#f1edf8]', 'from-gold-soft to-[#fbf3e1]', 'from-peacock-soft to-[#eef6f6]']

const longDay = (iso: string) =>
  parseISO(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDay = (iso: string) => parseISO(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function Calendar() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'week' ? 'week' : 'dates'
  const select = (next: 'dates' | 'week') => setParams(next === 'week' ? { tab: 'week' } : {}, { replace: true })

  return (
    <Page>
      <PageHeader
        eyebrow="Our calendar"
        title={tab === 'week' ? 'Our week' : 'Our dates'}
        subtitle={
          tab === 'week'
            ? 'When each of you is busy — and when you are both free.'
            : 'Tap any day to add plans, dates and the days worth remembering.'
        }
      />
      <div role="tablist" aria-label="Our dates or our week" className="paper mb-6 flex gap-1 p-1">
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
            <span className="relative">{name === 'week' ? 'Our week' : 'Our dates'}</span>
          </button>
        ))}
      </div>
      {tab === 'week' ? <WeekSchedule /> : <OurDates />}
    </Page>
  )
}

function OurDates() {
  const { api } = useApp()
  const world = useWorld()
  const events = useAsync(() => api.listEvents(world.space.id), [api, world.space.id])
  const today = todayISO()
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [direction, setDirection] = useState(0)
  const [selected, setSelected] = useState(today)
  const [editing, setEditing] = useState<{ event?: CalendarEvent; title?: string; symbol?: string } | null>(null)
  const [removing, setRemoving] = useState<CalendarEvent | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const dayPanel = useRef<HTMLElement>(null)

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
  const onDay = (day: string) =>
    all
      .map((e) => occursOn(e, day))
      .filter((o): o is Occurrence => o !== null)
      .sort((a, b) => (a.event.event_time ?? '').localeCompare(b.event.event_time ?? ''))
  const soon = useMemo(() => upcoming(all, 8), [all])
  const selectedOccurrences = onDay(selected)
  const monthName = new Date(month.y, month.m - 1, 1).toLocaleDateString(undefined, { month: 'long' })

  const goTo = (y: number, m: number) => {
    setDirection(y * 12 + m > month.y * 12 + month.m ? 1 : -1)
    setMonth({ y, m })
  }
  const shift = (delta: number) => {
    const d = new Date(month.y, month.m - 1 + delta, 1)
    goTo(d.getFullYear(), d.getMonth() + 1)
  }
  const pick = (day: string, scroll = false) => {
    setSelected(day)
    const y = Number(day.slice(0, 4))
    const m = Number(day.slice(5, 7))
    if (y !== month.y || m !== month.m) goTo(y, m)
    if (scroll) requestAnimationFrame(() => dayPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const saved = (event: CalendarEvent) => {
    events.setData((list) => [...(list ?? []).filter((e) => e.id !== event.id), event])
    pick(event.event_date)
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
          <ul className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pt-1 pb-3">
            {soon.map((o, i) => {
              const days = daysBetween(today, o.date)
              return (
                <motion.li
                  key={`${o.event.id}-${o.date}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="snap-start"
                >
                  <button
                    type="button"
                    onClick={() => pick(o.date, true)}
                    className={`flex h-full w-36 flex-col items-start rounded-2xl border border-white/70 bg-gradient-to-br ${TINTS[i % TINTS.length]} px-4 py-3 text-left shadow-soft transition hover:-translate-y-1 hover:shadow-polaroid`}
                  >
                    <span className="text-2xl leading-none">{o.event.symbol ?? '♡'}</span>
                    {days === 0 ? (
                      <span className="hand mt-2 text-[1.7rem] leading-none text-rose-deep">Today ♡</span>
                    ) : (
                      <span className="mt-2 flex items-baseline gap-1">
                        <span className="font-serif text-3xl leading-none text-peacock-deep">{days}</span>
                        <span className="text-xs text-ink-soft">{days === 1 ? 'day to go' : 'days to go'}</span>
                      </span>
                    )}
                    <span className="mt-2 line-clamp-2 text-sm font-semibold text-ink">{o.event.title}</span>
                    <span className="mt-auto pt-1 text-xs text-ink-soft">{shortDay(o.date)}</span>
                  </button>
                </motion.li>
              )
            })}
          </ul>
        </section>
      )}

      {/* month */}
      <section className="paper overflow-hidden" aria-label="Month">
        <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-blush/50 via-paper to-lavender/50 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="flex size-10 items-center justify-center rounded-full bg-paper/80 shadow-soft hover:bg-peacock-soft"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="text-center">
            <h2 className="font-serif text-[1.9rem] leading-none text-peacock-deep">{monthName}</h2>
            <p className="mt-0.5 text-xs font-semibold tracking-[0.25em] text-gold">{month.y}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {(month.y !== Number(today.slice(0, 4)) || month.m !== Number(today.slice(5, 7))) && (
              <button
                type="button"
                onClick={() => pick(today)}
                className="hidden rounded-full bg-paper/80 px-3 py-2 text-xs font-semibold text-peacock-deep shadow-soft sm:block"
              >
                Today
              </button>
            )}
            <button
              type="button"
              onClick={() => shift(1)}
              aria-label="Next month"
              className="flex size-10 items-center justify-center rounded-full bg-paper/80 shadow-soft hover:bg-peacock-soft"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="p-2 sm:p-3">
          <div className="grid grid-cols-7 gap-1 pb-1 text-center" aria-hidden>
            {WEEKDAYS.map((w, i) => (
              <div key={w} className={`text-[0.65rem] font-bold tracking-wider uppercase ${i === 0 || i === 6 ? 'text-rose' : 'text-ink-soft'}`}>
                {w}
              </div>
            ))}
          </div>
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={`${month.y}-${month.m}`}
              custom={direction}
              initial={{ opacity: 0, x: direction * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -40 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="grid grid-cols-7 gap-1"
              role="grid"
              aria-label={`${monthName} ${month.y}`}
            >
              {days.map((day) => {
                const inMonth = Number(day.slice(5, 7)) === month.m
                const items = onDay(day)
                const isToday = day === today
                const isSelected = day === selected
                const weekend = [0, 6].includes(parseISO(day).getDay())
                return (
                  <button
                    key={day}
                    type="button"
                    role="gridcell"
                    aria-selected={isSelected}
                    aria-label={`${longDay(day)}${items.length ? `: ${items.map((o) => o.event.title).join(', ')}` : ''}`}
                    onClick={() => pick(day)}
                    onDoubleClick={() => {
                      pick(day)
                      setEditing({})
                    }}
                    className={`group relative flex aspect-square flex-col items-stretch overflow-hidden rounded-xl p-1 text-left transition sm:aspect-auto sm:min-h-[5.25rem] sm:p-1.5 ${
                      isSelected
                        ? 'bg-peacock-soft ring-2 ring-peacock'
                        : isToday
                          ? 'bg-blush/50 ring-1 ring-rose/50'
                          : weekend
                            ? 'bg-parchment/50 hover:bg-peacock-soft/50'
                            : 'hover:bg-peacock-soft/40'
                    } ${inMonth ? '' : 'opacity-35'}`}
                  >
                    <span
                      className={`mx-auto flex size-6 items-center justify-center rounded-full text-[0.8rem] sm:mx-0 ${
                        isSelected ? 'bg-peacock font-bold text-white' : isToday ? 'font-bold text-rose-deep' : 'text-ink'
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    {items.length > 0 && (
                      <>
                        {/* phones: little symbols */}
                        <span className="mt-auto flex justify-center gap-0.5 text-[0.7rem] leading-none sm:hidden" aria-hidden>
                          {items.slice(0, 2).map((o) => (
                            <span key={o.event.id}>{o.event.symbol ?? '♡'}</span>
                          ))}
                          {items.length > 2 && <span className="text-ink-soft">+</span>}
                        </span>
                        {/* wider screens: little labels */}
                        <span className="mt-1 hidden flex-col gap-0.5 sm:flex" aria-hidden>
                          {items.slice(0, 2).map((o) => (
                            <span
                              key={o.event.id}
                              className={`truncate rounded-md px-1 py-0.5 text-[0.65rem] leading-tight font-semibold ${
                                o.event.yearly ? 'bg-blush text-rose-deep' : 'bg-peacock-soft text-peacock-deep'
                              }`}
                            >
                              {o.event.symbol ?? '♡'} {o.event.title}
                            </span>
                          ))}
                          {items.length > 2 && <span className="px-1 text-[0.62rem] text-ink-soft">+{items.length - 2} more</span>}
                        </span>
                      </>
                    )}
                  </button>
                )
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      {/* the chosen day */}
      <section ref={dayPanel} className="paper scroll-mt-4 overflow-hidden" aria-label={longDay(selected)}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-gold/20 px-4 py-3 sm:px-5">
          <h2 className="font-serif text-2xl text-peacock-deep">{longDay(selected)}</h2>
          <span className="hand text-[1.2rem] text-rose-deep">
            {selected === today ? 'today ♡' : countdown(selected)}
          </span>
        </div>

        <QuickAdd
          key={selected}
          day={selected}
          onSaved={saved}
          onMore={(title, symbol) => setEditing({ title, symbol })}
        />

        <AnimatePresence initial={false}>
          {selectedOccurrences.length === 0 ? (
            <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 pb-4 text-sm text-ink-soft sm:px-5">
              Nothing planned yet — a dinner, a call, a trip, a birthday… type it above.
            </motion.p>
          ) : (
            <ul className="space-y-2 px-3 pb-4 sm:px-4">
              {selectedOccurrences.map((o) => {
                const virtual = o.event.id === 'first-met'
                const mine = o.event.created_by === world.me.id
                return (
                  <motion.li
                    key={o.event.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-start gap-3 rounded-2xl border border-gold/15 bg-ivory/60 px-3 py-3"
                  >
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-full text-xl ${
                        o.event.yearly ? 'bg-blush' : 'bg-peacock-soft'
                      }`}
                    >
                      {o.event.symbol ?? '♡'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold break-words text-ink">{o.event.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
                        <span className="inline-flex items-center gap-0.5">
                          <Clock3 className="size-3" aria-hidden /> {o.event.event_time ? formatTimeOfDay(o.event.event_time) : 'All day'}
                        </span>
                        {o.event.yearly ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-blush px-1.5 py-0.5 font-semibold text-rose-deep">
                            <Repeat className="size-3" aria-hidden /> every year{o.years > 0 ? ` · ${ordinal(o.years)}` : ''}
                          </span>
                        ) : (
                          <span className="rounded-full bg-peacock-soft px-1.5 py-0.5 font-semibold text-peacock-deep">just this day</span>
                        )}
                        {!virtual && <span>added by {nameOf(world, o.event.created_by)}</span>}
                      </p>
                      {o.event.note && <p className="mt-1 text-sm whitespace-pre-line text-ink">{o.event.note}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5 sm:flex-row">
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
                            onClick={() => setEditing({ event: o.event })}
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
                        <Link
                          to="/settings"
                          aria-label="Change the day we met"
                          className="flex size-9 items-center justify-center rounded-full text-peacock-deep hover:bg-peacock-soft/60"
                        >
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
        key={editing ? (editing.event?.id ?? `new-${selected}-${editing.title ?? ''}`) : 'closed'}
        open={editing !== null}
        existing={editing?.event}
        startTitle={editing?.title}
        startSymbol={editing?.symbol}
        defaultDate={selected}
        onClose={() => setEditing(null)}
        onSaved={saved}
      />
      <ConfirmDialog
        open={removing !== null}
        title="Remove this from the calendar?"
        message="It will disappear for both of you."
        confirmLabel="Remove"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

/** Type a plan, press Enter — it lands on the chosen day, just once. */
function QuickAdd({
  day,
  onSaved,
  onMore,
}: {
  day: string
  onSaved: (event: CalendarEvent) => void
  onMore: (title: string, symbol: string) => void
}) {
  const { api } = useApp()
  const world = useWorld()
  const [title, setTitle] = useState('')
  const [symbol, setSymbol] = useState('♡')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const add = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!title.trim()) return setError('Write what is happening, like “Dinner at our place”.')
    setBusy(true)
    setError(null)
    try {
      const saved = await api.saveEvent(world.space.id, undefined, {
        title: title.trim(),
        event_date: day,
        event_time: null,
        note: null,
        yearly: false,
        symbol,
      })
      setTitle('')
      onSaved(saved)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={add} className="space-y-2 px-4 py-3 sm:px-5" noValidate>
      <div className="flex items-center gap-2">
        <label htmlFor="quick-add" className="sr-only">
          Add something on {shortDay(day)}
        </label>
        <input
          id="quick-add"
          className="field min-w-0 flex-1"
          placeholder={`Add to ${shortDay(day)}…`}
          maxLength={120}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setError(null)
          }}
        />
        <Button type="submit" busy={busy} aria-label="Add" className="shrink-0 px-4">
          <Plus className="size-4" aria-hidden />
          <span className="hidden sm:inline">Add</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_SYMBOLS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={symbol === s}
            aria-label={`Symbol ${s}`}
            onClick={() => setSymbol(s)}
            className={`flex size-8 items-center justify-center rounded-full text-base transition ${
              symbol === s ? 'bg-peacock-soft ring-1 ring-peacock' : 'hover:bg-parchment'
            }`}
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onMore(title.trim(), symbol)
            setTitle('')
          }}
          className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-peacock-deep hover:bg-peacock-soft/50"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden /> Time, note, every year…
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-deep">
          {error}
        </p>
      )}
    </form>
  )
}

function EventForm({
  open,
  existing,
  startTitle,
  startSymbol,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean
  existing?: CalendarEvent
  startTitle?: string
  startSymbol?: string
  defaultDate: string
  onClose: () => void
  onSaved: (event: CalendarEvent) => void
}) {
  const { api } = useApp()
  const world = useWorld()
  const [title, setTitle] = useState(existing?.title ?? startTitle ?? '')
  const [date, setDate] = useState(existing?.event_date ?? defaultDate)
  const [time, setTime] = useState(existing?.event_time?.slice(0, 5) ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [yearly, setYearly] = useState(existing?.yearly ?? false)
  const [repeatTouched, setRepeatTouched] = useState(Boolean(existing))
  const [symbol, setSymbol] = useState(existing?.symbol ?? startSymbol ?? '♡')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Birthdays and anniversaries usually repeat — suggest it, until they choose.
  useEffect(() => {
    if (!repeatTouched) setYearly(YEARLY_HINT.test(title))
  }, [title, repeatTouched])

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

  const repeatButton = (value: boolean, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={yearly === value}
      onClick={() => {
        setYearly(value)
        setRepeatTouched(true)
      }}
      className={`relative flex-1 rounded-full py-2.5 text-sm font-semibold transition ${
        yearly === value ? 'text-white' : 'text-ink-soft hover:text-peacock-deep'
      }`}
    >
      {yearly === value && (
        <motion.span layoutId="repeat-choice" className="absolute inset-0 rounded-full bg-peacock" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />
      )}
      <span className="relative">{label}</span>
    </button>
  )

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={existing ? 'Change this' : 'Add to our calendar'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="ev-title">What is it?</Label>
          <input
            id="ev-title"
            className="field"
            maxLength={120}
            autoFocus={!existing}
            placeholder="Dinner date, her birthday, our trip…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
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
        <div>
          <p className="mb-1.5 text-sm font-semibold">How often?</p>
          <div role="radiogroup" aria-label="How often" className="flex gap-1 rounded-full bg-parchment p-1">
            {repeatButton(false, 'Just this day')}
            {repeatButton(true, 'Every year')}
          </div>
          {yearly && !repeatTouched && (
            <p className="mt-1.5 text-xs text-ink-soft">Sounds like a yearly one — change it if not.</p>
          )}
        </div>
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
            <CalendarDays className="size-4" aria-hidden /> {existing ? 'Save' : 'Add'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
