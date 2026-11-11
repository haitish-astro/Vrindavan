import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { friendlyError, type Api } from '../data/api'
import type { SessionUser, World } from '../lib/types'
import { forgetDevice, rememberGreeting } from '../lib/local'

interface AppState {
  api: Api
  /** undefined = still checking, null = signed out */
  user: SessionUser | null | undefined
  /** undefined = still loading, null = signed in but not one of the two members */
  world: World | null | undefined
  worldError: string | null
  setWorld: (world: World) => void
  reloadWorld: () => void
  signOut: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ api, children }: { api: Api; children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [world, setWorldState] = useState<World | null | undefined>(undefined)
  const [worldError, setWorldError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const userId = user?.id

  useEffect(() => {
    let active = true
    api
      .getUser()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null))
    const unsubscribe = api.onAuthChange((next) => {
      // Keep the same object when nothing changed so screens do not reload on token refresh.
      setUser((current) => (current?.id === next?.id && current?.email === next?.email ? current : next))
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [api])

  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!userId) {
      loadedFor.current = null
      setWorldState(undefined)
      setWorldError(null)
      return
    }
    let active = true
    setWorldError(null)
    if (loadedFor.current !== userId) setWorldState(undefined)
    api
      .loadWorld()
      .then((loaded) => {
        if (!active) return
        loadedFor.current = userId
        setWorldState(loaded)
        if (loaded) rememberGreeting(loaded)
      })
      .catch((error) => active && setWorldError(friendlyError(error)))
    return () => {
      active = false
    }
  }, [api, userId, reloadKey])

  const setWorld = useCallback((next: World) => {
    setWorldState(next)
    rememberGreeting(next)
  }, [])
  const reloadWorld = useCallback(() => setReloadKey((k) => k + 1), [])
  const signOut = useCallback(async () => {
    forgetDevice()
    await api.signOut()
    setUser(null)
  }, [api])

  const value = useMemo<AppState>(
    () => ({ api, user, world, worldError, setWorld, reloadWorld, signOut }),
    [api, user, world, worldError, setWorld, reloadWorld, signOut],
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const state = useContext(AppContext)
  if (!state) throw new Error('useApp must be used inside <AppProvider>')
  return state
}

/** For screens that only render once the world is loaded (everything behind the gate). */
export function useWorld(): World {
  const { world } = useApp()
  if (!world) throw new Error('World is not loaded yet')
  return world
}

/** A warm name for either of the two people. */
export function nameOf(world: World, userId: string | null | undefined): string {
  if (userId === world.me.id) return world.me.display_name?.trim() || 'You'
  const other = world.members.find((m) => m.id === userId)
  return other?.display_name?.trim() || 'Your love'
}
