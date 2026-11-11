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

export function isFuture(iso: string): boolean {
  return iso > todayISO()
}
