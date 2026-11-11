/** Dates are stored as plain `YYYY-MM-DD` strings; these helpers keep them timezone-safe. */

export function todayISO(): string {
  const d = new Date()
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Parse `YYYY-MM-DD` as a local date (never shifts a day across timezones). */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4))
}

export function formatLong(iso: string): string {
  return parseISO(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatShort(iso: string): string {
  return parseISO(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Whole days from `fromISO` to `toISO` (positive when `to` is later). */
export function daysBetween(fromISO: string, toISODate: string): number {
  const a = parseISO(fromISO)
  const b = parseISO(toISODate)
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((utcB - utcA) / 86_400_000)
}

/** Day number within the year (1–366), used to pick the thought of the day. */
export function dayOfYear(d = new Date()): number {
  const start = Date.UTC(d.getFullYear(), 0, 0)
  const now = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((now - start) / 86_400_000)
}

/** Local calendar day (YYYY-MM-DD) of a timestamp. */
export function localDay(timestamp: string): string {
  const d = new Date(timestamp)
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** "just now", "5 min ago", "yesterday", "3 days ago", then a date. */
export function timeAgo(timestamp: string): string {
  const seconds = (Date.now() - new Date(timestamp).getTime()) / 1000
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  const today = todayISO()
  const day = localDay(timestamp)
  if (day === today) return `${Math.floor(seconds / 3600)} h ago`
  const gap = daysBetween(day, today)
  if (gap === 1) return 'yesterday'
  if (gap < 7) return `${gap} days ago`
  return formatShort(day)
}

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** "Today", "Yesterday", or a full date — for separating chat days. */
export function dayLabel(timestamp: string): string {
  const day = localDay(timestamp)
  const gap = daysBetween(day, todayISO())
  if (gap === 0) return 'Today'
  if (gap === 1) return 'Yesterday'
  return formatLong(day)
}

export function isFuture(iso: string): boolean {
  return iso > todayISO()
}
