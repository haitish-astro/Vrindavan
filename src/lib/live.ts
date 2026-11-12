import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp, useWorld } from '../app/AppContext'
import type { LiveRoom, LiveRoomName } from './types'

type Handler = (event: string, payload: Record<string, unknown>, from: string) => void

/**
 * Join a private live room (doodle, chat or chess) while this screen is open.
 * Gives you: send(), whether your love is here right now, and the connection state.
 */
export function useLiveRoom(room: LiveRoomName, onEvent?: Handler) {
  const { api } = useApp()
  const world = useWorld()
  const [peers, setPeers] = useState<string[]>([])
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting')
  const handler = useRef(onEvent)
  handler.current = onEvent
  const live = useRef<LiveRoom | null>(null)

  useEffect(() => {
    const joined = api.joinRoom(world.space.id, room, world.me.id, {
      onEvent: (event, payload, from) => handler.current?.(event, payload, from),
      onPresence: setPeers,
      onStatus: setStatus,
    })
    live.current = joined
    return () => {
      joined.leave()
      live.current = null
    }
  }, [api, world.space.id, world.me.id, room])

  const send = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    live.current?.send(event, payload)
  }, [])

  return { send, partnerHere: peers.some((id) => id !== world.me.id), status }
}

/** Calls fn at most once per `ms`, always delivering the latest arguments. */
export function useThrottle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  const latest = useRef(fn)
  latest.current = fn
  const last = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<A | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return useCallback(
    (...args: A) => {
      const now = Date.now()
      const wait = ms - (now - last.current)
      if (wait <= 0) {
        last.current = now
        latest.current(...args)
        return
      }
      pending.current = args
      timer.current ??= setTimeout(() => {
        timer.current = null
        last.current = Date.now()
        if (pending.current) latest.current(...pending.current)
        pending.current = null
      }, wait)
    },
    [ms],
  )
}

/** Small pill shown on live screens: "♡ Name is here" / reconnecting. */
export function presenceLabel(partnerName: string, partnerHere: boolean, status: string) {
  if (status === 'offline') return { text: 'Reconnecting…', tone: 'muted' as const }
  if (status === 'connecting') return { text: 'Connecting…', tone: 'muted' as const }
  return partnerHere
    ? { text: `${partnerName} is here with you`, tone: 'live' as const }
    : { text: `${partnerName} isn’t here right now`, tone: 'muted' as const }
}
