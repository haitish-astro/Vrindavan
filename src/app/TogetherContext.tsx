/**
 * Being together in the app:
 *  - whether your love is here right now, which page they are on, and when they arrived
 *  - when they were last here (if they are away)
 *  - how many new things they added since you last looked at each part (for the tab badges)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { useApp, useWorld } from './AppContext'
import { useLiveRoom } from '../lib/live'
import type { Section, UpdateCounts } from '../lib/types'

export interface Place {
  /** "reading letters" */
  doing: string
  emoji: string
  /** where "Join them" takes you */
  path: string
}

/** What a page means, in words. Longest prefixes first. */
const PLACES: [string, Place][] = [
  ['/letters/new', { doing: 'writing you a letter', emoji: '✍️', path: '/letters' }],
  ['/letters', { doing: 'reading letters & notes', emoji: '✉️', path: '/letters' }],
  ['/memories/new', { doing: 'adding a memory', emoji: '📸', path: '/memories' }],
  ['/memories', { doing: 'looking through memories', emoji: '📸', path: '/memories' }],
  ['/chat', { doing: 'in our chat', emoji: '💬', path: '/chat' }],
  ['/calendar', { doing: 'on the calendar', emoji: '📅', path: '/calendar' }],
  ['/doodle', { doing: 'drawing on the doodle board', emoji: '🎨', path: '/doodle' }],
  ['/chess', { doing: 'at the chess board', emoji: '♟️', path: '/chess' }],
  ['/games/sea_battle', { doing: 'playing sea battle', emoji: '🚢', path: '/games/sea_battle' }],
  ['/games/ludo', { doing: 'playing ludo', emoji: '🎲', path: '/games/ludo' }],
  ['/games/snakes', { doing: 'playing snakes & ladders', emoji: '🐍', path: '/games/snakes' }],
  ['/games/connect4', { doing: 'playing connect four', emoji: '🔴', path: '/games/connect4' }],
  ['/games/quiz', { doing: 'playing "How well do you know me?"', emoji: '💭', path: '/games/quiz' }],
  ['/games', { doing: 'in the games corner', emoji: '🎮', path: '/games' }],
  ['/story', { doing: 'reading our story', emoji: '📜', path: '/story' }],
  ['/settings', { doing: 'in Our Details', emoji: '🌿', path: '/settings' }],
  ['/world', { doing: 'wandering Our World', emoji: '🌸', path: '/world' }],
  ['/', { doing: 'on the home page', emoji: '🏡', path: '/' }],
]

export function placeOf(path: string): Place {
  const found = PLACES.find(([prefix]) => (prefix === '/' ? path === '/' : path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix)))
  return found ? found[1] : { doing: 'somewhere in our world', emoji: '🌸', path: '/' }
}

function sectionOf(path: string): Section | null {
  if (path.startsWith('/memories')) return 'memories'
  if (path.startsWith('/letters')) return 'letters'
  if (path.startsWith('/calendar')) return 'calendar'
  if (path.startsWith('/world') || path.startsWith('/doodle')) return 'world'
  return null
}

interface Together {
  partnerOnline: boolean
  /** online and looking at the app right now (not a background tab) */
  partnerActive: boolean
  partnerPath: string | null
  /** we are on the same page */
  sameRoom: boolean
  /** true for a few seconds after they arrive */
  justArrived: boolean
  /** ISO time they were last here, if known */
  partnerLastSeen: string | null
  counts: UpdateCounts
}

const EMPTY: UpdateCounts = { memories: 0, letters: 0, calendar: 0, doodles: 0, chessTurn: false, games: 0 }
const TogetherContext = createContext<Together>({
  partnerOnline: false,
  partnerActive: false,
  partnerPath: null,
  sameRoom: false,
  justArrived: false,
  partnerLastSeen: null,
  counts: EMPTY,
})

export function TogetherProvider({ children }: { children: ReactNode }) {
  const { api } = useApp()
  const world = useWorld()
  const { pathname } = useLocation()
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  const [counts, setCounts] = useState<UpdateCounts>(EMPTY)
  const [justArrived, setJustArrived] = useState(false)
  const [lastSeen, setLastSeen] = useState<string | null>(partner?.last_seen_at ?? null)

  const { track, states } = useLiveRoom('site')

  // Share where I am (and whether I'm actually looking).
  useEffect(() => {
    track({ path: pathname, active: visible })
  }, [track, pathname, visible])

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const theirs = partner ? states[partner.id] : undefined
  const partnerOnline = Boolean(theirs)
  const partnerPath = typeof theirs?.path === 'string' ? theirs.path : null
  const partnerActive = partnerOnline && theirs?.active !== false

  // A little sparkle when they arrive; remember when they leave.
  const wasOnline = useRef<boolean | null>(null)
  const openedAt = useRef(Date.now())
  useEffect(() => {
    // (if they were already here when I opened the app, that's not "arriving")
    if (wasOnline.current === false && partnerOnline && Date.now() - openedAt.current > 5000) {
      setJustArrived(true)
      const t = setTimeout(() => setJustArrived(false), 6000)
      wasOnline.current = partnerOnline
      return () => clearTimeout(t)
    }
    if (wasOnline.current && !partnerOnline) setLastSeen(new Date().toISOString())
    wasOnline.current = partnerOnline
  }, [partnerOnline])

  // "I'm here" for last-seen, every couple of minutes while looking.
  useEffect(() => {
    if (!visible) return
    void api.touchLastSeen()
    const beat = setInterval(() => void api.touchLastSeen(), 120_000)
    return () => clearInterval(beat)
  }, [api, visible])

  // ── what's new ──
  const refresh = useCallback(async () => {
    try {
      setCounts(await api.countUpdates(world.space.id, me))
    } catch {
      // badges just stay as they are
    }
  }, [api, world.space.id, me])

  // Looking at a section clears its badge (and remembers it, on every device).
  const section = sectionOf(pathname)
  const previous = useRef<Section | null>(null)
  useEffect(() => {
    const leaving = previous.current
    previous.current = section
    if (leaving && leaving !== section) void api.markSeen(leaving)
    if (section) {
      void api.markSeen(section).then(refresh)
      setCounts((c) => clear(c, section))
    }
  }, [api, section, refresh])

  // Refresh: now, every 45 s, when coming back to the tab, and whenever they move around.
  useEffect(() => {
    void refresh()
    const tick = setInterval(() => void refresh(), 45_000)
    return () => clearInterval(tick)
  }, [refresh])
  useEffect(() => {
    if (visible) void refresh()
  }, [visible, refresh])
  useEffect(() => {
    if (partnerPath) void refresh()
  }, [partnerPath, refresh])

  // While I'm on a section, keep its badge at zero.
  const shown = useMemo(() => (section ? clear(counts, section) : counts), [counts, section])

  const value = useMemo<Together>(
    () => ({
      partnerOnline,
      partnerActive,
      partnerPath,
      sameRoom: Boolean(partnerPath && placeOf(partnerPath).path === placeOf(pathname).path),
      justArrived,
      partnerLastSeen: lastSeen ?? partner?.last_seen_at ?? null,
      counts: shown,
    }),
    [partnerOnline, partnerActive, partnerPath, pathname, justArrived, lastSeen, partner?.last_seen_at, shown],
  )
  return <TogetherContext.Provider value={value}>{children}</TogetherContext.Provider>
}

function clear(c: UpdateCounts, section: Section): UpdateCounts {
  if (section === 'world') return { ...c, doodles: 0 }
  return { ...c, [section]: 0 }
}

export function useTogether(): Together {
  return useContext(TogetherContext)
}
