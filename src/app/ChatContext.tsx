import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { nameOf, useApp, useWorld } from './AppContext'
import { lastVisit, markVisit } from '../lib/local'
import { Feather } from '../components/Decor'

interface ChatStatus {
  /** messages from your love that you have not seen yet */
  unread: number
  /** the chat screen calls this while it is open */
  setViewing: (viewing: boolean) => void
}

interface Toast {
  id: string
  title: string
  body?: string
  to: string
  linger: number
}

const ChatContext = createContext<ChatStatus>({ unread: 0, setViewing: () => {} })

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Keeps the unread badge live, and gently tells you what happened:
 *  - when you arrive: "While you were away ♡ — 3 new messages · 1 sealed letter"
 *  - while you are elsewhere in the app: a little card when a message arrives
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { api } = useApp()
  const world = useWorld()
  const navigate = useNavigate()
  const spaceId = world.space.id
  const me = world.me.id
  const partnerId = world.members.find((m) => m.id !== me)?.id
  const partnerName = partnerId ? nameOf(world, partnerId) : 'Your love'

  const [unread, setUnread] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const viewing = useRef(false)
  const greeted = useRef(false)
  // When this device last visited, read once before anything updates it.
  const since = useRef<string | null | undefined>(undefined)
  if (since.current === undefined) since.current = lastVisit()

  const notify = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((list) => [...list.slice(-2), { ...toast, id }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), toast.linger)
  }, [])
  const dismiss = (id: string) => setToasts((list) => list.filter((t) => t.id !== id))

  useEffect(() => {
    let active = true

    const countUnread = async () => {
      const reads = await api.listChatReads(spaceId)
      const mine = reads.find((r) => r.user_id === me)?.last_read_at ?? null
      return api.countUnread(spaceId, mine)
    }

    const refresh = async () => {
      try {
        const count = await countUnread()
        if (active && !viewing.current) setUnread(count)
      } catch {
        // the badge simply stays as it is
      }
    }

    // Once per visit: a summary of what arrived while you were away.
    const welcome = async () => {
      if (greeted.current) return
      try {
        const [count, letters, notes] = await Promise.all([
          countUnread(),
          api.listLetters(spaceId),
          api.listQuickNotes(spaceId, 30),
        ])
        // Only the run that is still current gets to greet (and only once).
        if (!active || greeted.current) return
        greeted.current = true
        markVisit()
        const lastTime = since.current
        if (!viewing.current) setUnread(count)
        const sealed = letters.filter(
          (l) => l.status === 'sent' && l.author_id !== me && !l.opens.some((o) => o.user_id === me),
        ).length
        const newNotes = lastTime
          ? notes.filter((n) => n.author_id !== me && n.created_at > lastTime).length
          : 0
        const parts = [
          count > 0 && plural(count, 'new message', 'new messages'),
          sealed > 0 && plural(sealed, 'sealed letter', 'sealed letters'),
          newNotes > 0 && plural(newNotes, 'little note', 'little notes'),
        ].filter(Boolean) as string[]
        if (parts.length > 0) {
          notify({
            title: `While you were away, ${partnerName} left you…`,
            body: parts.join(' · '),
            to: count > 0 ? '/chat' : sealed > 0 ? '/letters' : '/letters?tab=notes',
            linger: 10_000,
          })
        }
      } catch {
        void refresh()
      }
    }

    void welcome()
    const unsubscribe = api.subscribeChat(spaceId, {
      onMessage: (message) => {
        if (message.sender_id === me || viewing.current) return
        setUnread((n) => n + 1)
        notify({
          title: `${partnerName} ♡`,
          body: message.body.length > 70 ? `${message.body.slice(0, 70)}…` : message.body,
          to: '/chat',
          linger: 6000,
        })
      },
      onRead: (read) => {
        if (read.user_id === me) setUnread(0)
      },
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        markVisit()
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, spaceId, me, partnerName, notify])

  const setViewing = useCallback((value: boolean) => {
    viewing.current = value
    if (value) {
      setUnread(0)
      setToasts((list) => list.filter((t) => t.to !== '/chat'))
    }
  }, [])

  const value = useMemo(() => ({ unread, setViewing }), [unread, setViewing])
  return (
    <ChatContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
        aria-live="polite"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-gold/30 bg-paper/95 py-3 pr-2 pl-4 shadow-polaroid backdrop-blur"
            >
              <button
                type="button"
                onClick={() => {
                  dismiss(toast.id)
                  navigate(toast.to)
                }}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Feather className="h-10 w-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-peacock-deep">{toast.title}</span>
                  {toast.body && <span className="block truncate text-sm text-ink-soft">{toast.body}</span>}
                </span>
              </button>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-blush/60"
              >
                <X className="size-4" aria-hidden />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ChatContext.Provider>
  )
}

export function useChatStatus(): ChatStatus {
  return useContext(ChatContext)
}
