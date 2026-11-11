import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp, useWorld } from './AppContext'

interface ChatStatus {
  /** messages from your love that you have not seen yet */
  unread: number
  /** the chat screen calls this while it is open */
  setViewing: (viewing: boolean) => void
}

const ChatContext = createContext<ChatStatus>({ unread: 0, setViewing: () => {} })

/** Keeps the little unread badge on the Chat tab up to date, live. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { api } = useApp()
  const world = useWorld()
  const spaceId = world.space.id
  const me = world.me.id
  const [unread, setUnread] = useState(0)
  const viewing = useRef(false)

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const reads = await api.listChatReads(spaceId)
        const mine = reads.find((r) => r.user_id === me)?.last_read_at ?? null
        const count = await api.countUnread(spaceId, mine)
        if (active && !viewing.current) setUnread(count)
      } catch {
        // the badge simply stays as it is
      }
    }
    void refresh()
    const unsubscribe = api.subscribeChat(spaceId, {
      onMessage: (message) => {
        if (message.sender_id !== me && !viewing.current) setUnread((n) => n + 1)
      },
      onRead: (read) => {
        if (read.user_id === me) setUnread(0)
      },
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, spaceId, me])

  const setViewing = useCallback((value: boolean) => {
    viewing.current = value
    if (value) setUnread(0)
  }, [])

  const value = useMemo(() => ({ unread, setViewing }), [unread, setViewing])
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChatStatus(): ChatStatus {
  return useContext(ChatContext)
}
