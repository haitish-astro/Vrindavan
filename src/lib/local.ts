/** Small conveniences kept on this device only. */
import { todayISO } from './dates'
import type { World } from './types'

const PREFIX = 'vrindavan.'
const WELCOMED_KEY = `${PREFIX}welcomed`
const GREETING_KEY = `${PREFIX}greeting`
const DRAFT_PREFIX = `${PREFIX}draft.`
// Deliberately outside PREFIX so it survives signing out — that is its whole point.
const EMAIL_KEY = 'vrindavan-remembered-email'

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

/** The last email used to sign in on this device, so only the password needs typing. */
export function rememberedEmail(): string {
  return read(EMAIL_KEY) ?? ''
}
export function rememberEmail(email: string | null) {
  write(EMAIL_KEY, email)
}

/** A letter being written, kept safe if the phone closes the tab. */
export interface LocalDraft {
  title: string
  body: string
}
export function loadLocalDraft(key: string): LocalDraft | null {
  try {
    const parsed = JSON.parse(read(DRAFT_PREFIX + key) ?? 'null') as Partial<LocalDraft> | null
    if (!parsed || typeof parsed.body !== 'string') return null
    return { title: typeof parsed.title === 'string' ? parsed.title : '', body: parsed.body }
  } catch {
    return null
  }
}
export function saveLocalDraft(key: string, draft: LocalDraft) {
  write(DRAFT_PREFIX + key, draft.title || draft.body ? JSON.stringify(draft) : null)
}
export function clearLocalDraft(key: string) {
  write(DRAFT_PREFIX + key, null)
}

/** On sign-out: forget everything personal this device kept (but not the remembered email). */
export function forgetDevice() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    keys.forEach((key) => localStorage.removeItem(key))
  } catch {
    // nothing stored
  }
}
