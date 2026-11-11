/** Small, non-sensitive conveniences kept on this device only. */
import { todayISO } from './dates'
import type { World } from './types'

const WELCOMED_KEY = 'vrindavan.welcomed'
const GREETING_KEY = 'vrindavan.greeting'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Private browsing — the app simply forgets.
  }
}

/** Has the welcome been seen today on this device? */
export function welcomedToday(): boolean {
  return read(WELCOMED_KEY) === todayISO()
}
export function markWelcomed() {
  write(WELCOMED_KEY, todayISO())
}

export interface SavedGreeting {
  name: string | null
  greeting: string | null
}

/** Lets the welcome screen greet a returning person by name before they sign in again. */
export function rememberGreeting(world: World) {
  const saved: SavedGreeting = {
    name: world.me.display_name?.trim() || null,
    greeting: world.space.welcome_greeting?.trim() || null,
  }
  write(GREETING_KEY, JSON.stringify(saved))
}
export function savedGreeting(): SavedGreeting {
  try {
    const parsed = JSON.parse(read(GREETING_KEY) ?? 'null') as Partial<SavedGreeting> | null
    return {
      name: typeof parsed?.name === 'string' ? parsed.name : null,
      greeting: typeof parsed?.greeting === 'string' ? parsed.greeting : null,
    }
  } catch {
    return { name: null, greeting: null }
  }
}
export function forgetGreeting() {
  write(GREETING_KEY, null)
}
