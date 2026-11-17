import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Globe2, Plus, Trash2 } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useAsync } from '../lib/hooks'
import { parseISO, todayISO } from '../lib/dates'
import { freeTogether, fromHHMM, minutesToLabel, myTimeZone, segmentsForDay, toHHMM, tzLabel, type Segment } from '../lib/week'
import type { ScheduleBlock, ScheduleBlockInput } from '../lib/types'
import { Button, ConfirmDialog, ErrorNote, Label, Modal, Spinner } from './ui'

const HOUR_PX = 26
const LABELS = ['Work', 'Class', 'Gym', 'Commute', 'Sleep', 'Busy']
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const addDays = (iso: string, n: number) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Each person's regular busy times, side by side, in the viewer's own time zone. */
export function WeekSchedule() {
  const { api } = useApp()
  const world = useWorld()
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)
  const partnerName = partner ? nameOf(world, partner.id) : 'Your love'
  const tz = useMemo(() => myTimeZone(), [])
  const blocks = useAsync(() => api.listBlocks(world.space.id), [api, world.space.id])
  const reload = blocks.reload
  const today = todayISO()
  const [day, setDay] = useState(today)
  const [editing, setEditing] = useState<ScheduleBlock | 'new' | null>(null)
  const [removing, setRemoving] = useState<ScheduleBlock | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [now, setNow] = useState(() => new Date())

  // Their week may change while you look: refresh when you come back to the tab.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    const tick = setInterval(() => setNow(new Date()), 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(tick)
    }
  }, [reload])

  const weekStart = addDays(day, -parseISO(day).getDay())
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const all = blocks.data ?? []
  const mineSegments = segmentsForDay(all.filter((b) => b.user_id === me), day, tz)
  const theirSegments = segmentsForDay(all.filter((b) => b.user_id !== me), day, tz)
  const free = freeTogether([...mineSegments, ...theirSegments])
  const theirZones = [...new Set(all.filter((b) => b.user_id !== me).map((b) => b.tz))].filter((z) => z !== tz)
  const nowMinute = day === today ? now.getHours() * 60 + now.getMinutes() : null

  const remove = async () => {
    if (!removing) return
    try {
      await api.deleteBlock(removing.id)
      blocks.setData((list) => (list ?? []).filter((b) => b.id !== removing.id))
    } catch (e) {
      setNotice(friendlyError(e))
    } finally {
      setRemoving(null)
    }
  }

  if (blocks.loading && !blocks.data) return <Spinner label="Opening our week…" />
  if (blocks.error) return <ErrorNote message={blocks.error} onRetry={blocks.reload} />

  const Lane = ({ segments, mine }: { segments: Segment[]; mine: boolean }) => (
    <div className="relative" style={{ height: HOUR_PX * 24 }}>
      {segments.map((s, i) => {
        const short = s.to - s.from < 45
        return (
          <motion.button
            key={`${s.block.id}-${i}`}
            type="button"
            disabled={!mine}
            onClick={() => mine && setEditing(s.block)}
            initial={{ opacity: 0, scaleY: 0.8 }}
            animate={{ opacity: 1, scaleY: 1 }}
            className={`absolute inset-x-1 overflow-hidden rounded-lg border-l-4 px-2 text-left text-xs shadow-soft ${
              mine ? 'border-peacock bg-peacock-soft text-peacock-deep hover:brightness-95' : 'border-rose bg-blush text-rose-deep'
            } ${short ? 'py-0' : 'py-1'}`}
            style={{ top: (s.from / 60) * HOUR_PX, height: Math.max(14, ((s.to - s.from) / 60) * HOUR_PX), transformOrigin: 'top' }}
            aria-label={`${mine ? 'You' : partnerName}: ${s.block.label}, ${minutesToLabel(s.from)} to ${minutesToLabel(s.to)}`}
          >
            <span className="block truncate font-semibold">{s.block.label}</span>
            {!short && (
              <span className="block truncate opacity-80">
                {minutesToLabel(s.from)}–{minutesToLabel(s.to)}
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* days of the week */}
      <div className="paper flex items-center gap-1 p-2">
        <button type="button" onClick={() => setDay(addDays(day, -7))} aria-label="Previous week" className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-peacock-soft/60">
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <div className="grid flex-1 grid-cols-7 gap-1" role="tablist" aria-label="Day">
          {weekDays.map((d) => {
            const date = parseISO(d)
            const active = d === day
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
                onClick={() => setDay(d)}
                className={`flex flex-col items-center rounded-xl py-1.5 text-xs transition ${
                  active ? 'bg-peacock text-white' : d === today ? 'bg-blush/60 text-rose-deep' : 'text-ink-soft hover:bg-peacock-soft/50'
                }`}
              >
                <span className="font-bold">{DAY_LETTERS[date.getDay()]}</span>
                <span className="text-sm">{date.getDate()}</span>
              </button>
            )
          })}
        </div>
        <button type="button" onClick={() => setDay(addDays(day, 7))} aria-label="Next week" className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-peacock-soft/60">
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-ink-soft">
          <Globe2 className="size-3.5" aria-hidden />
          Shown in your time ({tzLabel(tz)})
          {theirZones.length > 0 && <> · {partnerName}’s times converted from {theirZones.map(tzLabel).join(', ')}</>}
        </p>
        <Button onClick={() => setEditing('new')} className="px-4">
          <Plus className="size-4" aria-hidden /> Add to my week
        </Button>
      </div>

      {notice && (
        <p role="alert" className="rounded-xl bg-blush/60 px-4 py-2 text-sm text-rose-deep">
          {notice}
        </p>
      )}

      {/* free together */}
      <section className="rounded-2xl border border-sage/50 bg-sage/15 px-4 py-3" aria-label="Free together">
        <p className="eyebrow !text-sage-deep">Free together on {DAY_NAMES[parseISO(day).getDay()]}</p>
        {free.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">No shared free time between 7 am and 11:30 pm — maybe a quick “goodnight” call ♡</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {free.map((f) => (
              <li key={f.from} className="rounded-full bg-paper px-3 py-1 text-sm font-semibold text-sage-deep shadow-soft">
                {minutesToLabel(f.from)} – {minutesToLabel(f.to)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* the day, both lanes */}
      <section className="paper overflow-hidden" aria-label="Both schedules">
        <div className="grid grid-cols-[3rem_1fr_1fr] border-b border-gold/20 text-center text-xs font-bold tracking-wider uppercase">
          <span />
          <span className="py-2 text-peacock-deep">You</span>
          <span className="py-2 text-rose-deep">{partnerName}</span>
        </div>
        <div className="max-h-[32rem] overflow-y-auto" ref={(el) => {
          // start the view around 7 am
          if (el && !el.dataset.scrolled) {
            el.scrollTop = HOUR_PX * 6.5
            el.dataset.scrolled = '1'
          }
        }}>
          <div className="relative grid grid-cols-[3rem_1fr_1fr]">
            {/* hour lines */}
            <div className="relative" style={{ height: HOUR_PX * 24 }}>
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="absolute right-1 -translate-y-1/2 text-[0.62rem] text-ink-soft" style={{ top: h * HOUR_PX }}>
                  {h === 0 ? '' : minutesToLabel(h * 60).replace(':00', '')}
                </span>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 left-12" aria-hidden>
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="absolute inset-x-0 border-t border-gold/15" style={{ top: h * HOUR_PX }} />
              ))}
              {free.map((f) => (
                <span
                  key={f.from}
                  className="absolute inset-x-0 bg-sage/20"
                  style={{ top: (f.from / 60) * HOUR_PX, height: ((f.to - f.from) / 60) * HOUR_PX }}
                />
              ))}
              {nowMinute !== null && (
                <span className="absolute inset-x-0 z-10 border-t-2 border-rose-deep" style={{ top: (nowMinute / 60) * HOUR_PX }}>
                  <span className="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-rose-deep" />
                </span>
              )}
            </div>
            <Lane segments={mineSegments} mine />
            <div className="border-l border-gold/20">
              <Lane segments={theirSegments} mine={false} />
            </div>
          </div>
        </div>
      </section>
      {mineSegments.length + theirSegments.length === 0 && (
        <p className="text-center text-sm text-ink-soft">
          Nothing on this day yet. Add your usual week once — work, classes, sleep — and it repeats every week.
        </p>
      )}

      <BlockForm
        key={editing === 'new' ? `new-${day}` : (editing?.id ?? 'closed')}
        target={editing}
        defaultWeekday={parseISO(day).getDay()}
        tz={tz}
        onClose={() => setEditing(null)}
        onSaved={(saved, replacedId) => {
          blocks.setData((list) => [...(list ?? []).filter((b) => b.id !== replacedId), ...saved])
          setEditing(null)
        }}
        onDelete={(block) => {
          setEditing(null)
          setRemoving(block)
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        title="Remove this from your week?"
        message="It will disappear from your week for both of you."
        confirmLabel="Remove"
        onConfirm={() => void remove()}
        onCancel={() => setRemoving(null)}
      />
    </div>
  )
}

function BlockForm({
  target,
  defaultWeekday,
  tz,
  onClose,
  onSaved,
  onDelete,
}: {
  target: ScheduleBlock | 'new' | null
  defaultWeekday: number
  tz: string
  onClose: () => void
  onSaved: (blocks: ScheduleBlock[], replacedId?: string) => void
  onDelete: (block: ScheduleBlock) => void
}) {
  const { api } = useApp()
  const world = useWorld()
  const existing = target && target !== 'new' ? target : undefined
  const [label, setLabel] = useState(existing?.label ?? 'Work')
  const [days, setDays] = useState<number[]>(existing ? [existing.weekday] : [defaultWeekday])
  const [start, setStart] = useState(existing ? toHHMM(existing.start_minute) : '09:00')
  const [end, setEnd] = useState(existing ? toHHMM(existing.end_minute % 1440) : '17:00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleDay = (d: number) =>
    setDays((list) => (existing ? [d] : list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort()))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const s = fromHHMM(start)
    let e = fromHHMM(end)
    if (!label.trim()) return setError('Give it a name, like “Work”.')
    if (days.length === 0) return setError('Choose at least one day.')
    if (s === null || e === null) return setError('Choose a start and end time.')
    if (e === 0) e = 1440
    if (s === e) return setError('Start and end can’t be the same.')
    const base = { label: label.trim(), start_minute: s, end_minute: e, tz }
    setBusy(true)
    setError(null)
    try {
      if (existing) {
        const input: ScheduleBlockInput = { ...base, weekday: days[0]! }
        onSaved([await api.updateBlock(existing.id, input)], existing.id)
      } else {
        onSaved(await api.addBlocks(world.space.id, days.map((weekday) => ({ ...base, weekday }))))
      }
    } catch (err) {
      setError(friendlyError(err))
      setBusy(false)
    }
  }

  const s = fromHHMM(start)
  const e = fromHHMM(end)
  const overnight = s !== null && e !== null && e !== 0 && e < s

  return (
    <Modal open={target !== null} onClose={busy ? () => {} : onClose} title={existing ? 'Change this' : 'Add to my week'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="blk-label">What is it?</Label>
          <input id="blk-label" className="field" maxLength={60} value={label} onChange={(ev) => setLabel(ev.target.value)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LABELS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLabel(l)}
                className={`rounded-full px-3 py-1 text-sm transition ${label === l ? 'bg-peacock text-white' : 'bg-parchment text-ink-soft hover:text-peacock-deep'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">{existing ? 'Day' : 'Which days?'}</legend>
          <div className="flex gap-1.5">
            {DAY_LETTERS.map((letter, d) => (
              <button
                key={d}
                type="button"
                aria-pressed={days.includes(d)}
                aria-label={DAY_NAMES[d]}
                onClick={() => toggleDay(d)}
                className={`flex size-10 items-center justify-center rounded-full text-sm font-bold transition ${
                  days.includes(d) ? 'bg-peacock text-white' : 'bg-parchment text-ink-soft'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
          {!existing && (
            <div className="mt-2 flex gap-3 text-xs font-semibold text-peacock-deep">
              <button type="button" onClick={() => setDays([1, 2, 3, 4, 5])}>Weekdays</button>
              <button type="button" onClick={() => setDays([0, 1, 2, 3, 4, 5, 6])}>Every day</button>
            </div>
          )}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="blk-start">From</Label>
            <input id="blk-start" type="time" className="field" value={start} onChange={(ev) => setStart(ev.target.value)} />
          </div>
          <div>
            <Label htmlFor="blk-end">Until</Label>
            <input id="blk-end" type="time" className="field" value={end} onChange={(ev) => setEnd(ev.target.value)} />
          </div>
        </div>
        <p className="text-xs text-ink-soft">
          In your time ({tzLabel(tz)}).{overnight ? ' This runs past midnight into the next morning.' : ''} It repeats every week.
        </p>
        {error && (
          <p role="alert" className="text-sm text-rose-deep">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {existing ? (
            <Button variant="ghost" className="text-rose-deep" onClick={() => onDelete(existing)} disabled={busy}>
              <Trash2 className="size-4" aria-hidden /> Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" busy={busy}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
