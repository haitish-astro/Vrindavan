/**
 * Our week: turning each person's regular busy times (stored in their own time
 * zone) into blocks on the viewer's day, and finding when you are both free.
 */
import type { ScheduleBlock } from './types'

export const myTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
    } catch {
      f = formatter('UTC')
    }
    formatters.set(tz, f)
  }
  return f
}

/** How far ahead of UTC a time zone is at a given instant, in minutes. */
export function tzOffsetMinutes(utcMs: number, tz: string): number {
  const parts = Object.fromEntries(formatter(tz).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000)
}

/** The instant when it is `minute` minutes past midnight of y-m-d in time zone tz (overflow is fine). */
export function zonedToUtc(y: number, m: number, d: number, minute: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, 0, minute)
  const first = tzOffsetMinutes(guess, tz)
  let t = guess - first * 60000
  const second = tzOffsetMinutes(t, tz)
  if (second !== first) t = guess - second * 60000
  return t
}

export interface Segment {
  block: ScheduleBlock
  /** minutes from the viewer's midnight */
  from: number
  to: number
}

/** All busy blocks that touch the given day (YYYY-MM-DD, in the viewer's time zone). */
export function segmentsForDay(blocks: ScheduleBlock[], day: string, viewerTz: string): Segment[] {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const dayStart = zonedToUtc(y, m, d, 0, viewerTz)
  const dayEnd = zonedToUtc(y, m, d + 1, 0, viewerTz)
  const length = Math.round((dayEnd - dayStart) / 60000)
  const out: Segment[] = []
  for (const block of blocks) {
    // The owner's calendar day can be a day either side of ours.
    for (const shift of [-1, 0, 1]) {
      const date = new Date(Date.UTC(y, m - 1, d + shift))
      const cy = date.getUTCFullYear()
      const cm = date.getUTCMonth() + 1
      const cd = date.getUTCDate()
      if (block.on_date) {
        // a one-off: only on its own date
        const iso = `${cy}-${String(cm).padStart(2, '0')}-${String(cd).padStart(2, '0')}`
        if (iso !== block.on_date) continue
      } else if (date.getUTCDay() !== block.weekday) continue
      const endMinute = block.end_minute > block.start_minute ? block.end_minute : block.end_minute + 1440
      const start = zonedToUtc(cy, cm, cd, block.start_minute, block.tz)
      const end = zonedToUtc(cy, cm, cd, endMinute, block.tz)
      const from = Math.max(start, dayStart)
      const to = Math.min(end, dayEnd)
      if (to > from) {
        out.push({
          block,
          from: Math.round((from - dayStart) / 60000),
          to: Math.min(length, Math.round((to - dayStart) / 60000)),
        })
      }
    }
  }
  return out.sort((a, b) => a.from - b.from)
}

/** Gaps of at least `min` minutes, within waking hours, when neither of you is busy. */
export function freeTogether(busy: Segment[], windowFrom = 7 * 60, windowTo = 23 * 60 + 30, min = 30) {
  const spans = busy
    .map((s) => [Math.max(s.from, windowFrom), Math.min(s.to, windowTo)] as const)
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0])
  const free: { from: number; to: number }[] = []
  let cursor = windowFrom
  for (const [a, b] of spans) {
    if (a - cursor >= min) free.push({ from: cursor, to: a })
    cursor = Math.max(cursor, b)
  }
  if (windowTo - cursor >= min) free.push({ from: cursor, to: windowTo })
  return free
}

export function minutesToLabel(minutes: number): string {
  const d = new Date(2000, 0, 1, 0, minutes)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export const toHHMM = (minutes: number) =>
  `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

export const fromHHMM = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  return h < 24 && m < 60 ? h * 60 + m : null
}

/** A friendly city name from a time zone ("America/New_York" → "New York"). */
export function tzLabel(tz: string): string {
  return (tz.split('/').pop() ?? tz).replace(/_/g, ' ')
}
