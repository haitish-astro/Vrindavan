/** Special dates: yearly repeats, countdowns, and calendar files for your phone. */
import { daysBetween, parseISO, todayISO } from './dates'
import type { CalendarEvent } from './types'

export interface Occurrence {
  event: CalendarEvent
  /** the date it falls on (YYYY-MM-DD) */
  date: string
  /** for yearly events: how many years since the first one (0 on the first) */
  years: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

/** The date a yearly event falls on in a given year (29 February → 28 February in other years). */
export function yearlyDate(original: string, year: number): string {
  const [, m, d] = original.split('-').map(Number) as [number, number, number]
  if (m === 2 && d === 29 && !isLeap(year)) return iso(year, 2, 28)
  return iso(year, m, d)
}

export function occursOn(event: CalendarEvent, day: string): Occurrence | null {
  if (!event.yearly) return event.event_date === day ? { event, date: day, years: 0 } : null
  const year = Number(day.slice(0, 4))
  const startYear = Number(event.event_date.slice(0, 4))
  if (year < startYear) return null
  return yearlyDate(event.event_date, year) === day ? { event, date: day, years: year - startYear } : null
}

/** The next time an event happens, today included. */
export function nextOccurrence(event: CalendarEvent, from = todayISO()): Occurrence | null {
  if (!event.yearly) return event.event_date >= from ? { event, date: event.event_date, years: 0 } : null
  const startYear = Number(event.event_date.slice(0, 4))
  const fromYear = Number(from.slice(0, 4))
  for (const year of [fromYear, fromYear + 1]) {
    if (year < startYear) continue
    const date = yearlyDate(event.event_date, year)
    if (date >= from) return { event, date, years: year - startYear }
  }
  return year0(event, startYear)
}
function year0(event: CalendarEvent, startYear: number): Occurrence {
  return { event, date: yearlyDate(event.event_date, startYear), years: 0 }
}

export function upcoming(events: CalendarEvent[], count = 6, from = todayISO()): Occurrence[] {
  return events
    .map((e) => nextOccurrence(e, from))
    .filter((o): o is Occurrence => o !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.event.event_time ?? '').localeCompare(b.event.event_time ?? ''))
    .slice(0, count)
}

/** "today ♡", "tomorrow", "in 12 days" */
export function countdown(date: string, from = todayISO()): string {
  const days = daysBetween(from, date)
  if (days === 0) return 'today ♡'
  if (days === 1) return 'tomorrow'
  if (days < 0) return `${-days} days ago`
  return `in ${days} days`
}

/** "3rd", "12th" … for anniversaries */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** Six weeks of days (Sunday first) covering the month that contains `monthISO`. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const start = new Date(first)
  start.setUTCDate(1 - first.getUTCDay())
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  })
}

export function formatTimeOfDay(time: string | null): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number) as [number, number]
  const d = parseISO('2000-01-01')
  d.setHours(h, m)
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// ── .ics files (add to Apple / Google calendar) ──

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

export function toICS(event: CalendarEvent): string {
  const date = event.event_date.replace(/-/g, '')
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Our Little Vrindavan//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@our-little-vrindavan`,
    `DTSTAMP:${stamp}`,
  ]
  if (event.event_time) {
    const [h, m] = event.event_time.split(':')
    lines.push(`DTSTART:${date}T${h}${m}00`)
  } else {
    const next = parseISO(event.event_date)
    next.setDate(next.getDate() + 1)
    const end = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`
    lines.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${end}`)
  }
  lines.push(`SUMMARY:${escapeText(`${event.symbol ? `${event.symbol} ` : ''}${event.title}`)}`)
  if (event.note) lines.push(`DESCRIPTION:${escapeText(event.note)}`)
  if (event.yearly) lines.push('RRULE:FREQ=YEARLY')
  lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:♡', 'TRIGGER:-P1D', 'END:VALARM')
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadICS(event: CalendarEvent) {
  const blob = new Blob([toICS(event)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${event.title.replace(/[^\w\- ]+/g, '').trim() || 'our-date'}.ics`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
