import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Lock, RotateCcw, Send } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { useChatStatus } from '../app/ChatContext'
import { friendlyError } from '../data/api'
import { dayLabel, formatTime, localDay } from '../lib/dates'
import type { ChatMessage, ChatRead } from '../lib/types'
import { Feather } from '../components/Decor'
import { PresencePill } from '../components/Presence'
import { useLiveRoom } from '../lib/live'
import { ConfirmDialog, ErrorNote, Spinner } from '../components/ui'

type Shown = ChatMessage & { pending?: 'sending' | 'failed'; localKey?: string }

const PAGE = 60
const GROUP_GAP_MS = 10 * 60_000

/** Keep the newest page from the server, plus anything older we already had, plus unsent ones. */
function mergeLatest(current: Shown[], latest: ChatMessage[]): Shown[] {
  const pending = current.filter((m) => m.pending)
  if (latest.length === 0) return pending
  const from = latest[0]!.created_at
  const older = current.filter((m) => !m.pending && m.created_at < from)
  const keys = new Map(current.map((m) => [m.id, m.localKey]))
  return [...older, ...latest.map((m) => ({ ...m, localKey: keys.get(m.id) })), ...pending]
}

/** A private chat for two. Updates live; only the two of you can ever read it. */
export default function Chat() {
  const { api } = useApp()
  const world = useWorld()
  const { setViewing } = useChatStatus()
  const spaceId = world.space.id
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)
  const partnerName = partner ? nameOf(world, partner.id) : 'your love'

  const [messages, setMessages] = useState<Shown[]>([])
  const [reads, setReads] = useState<ChatRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [unsending, setUnsending] = useState<Shown | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [partnerTyping, setPartnerTyping] = useState(false)
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSent = useRef(0)
  const seen = useRef<Set<string>>(new Set()) // messages that should not animate in

  // Live: are they here, and are they writing?
  const { send: sendLive, partnerHere, status: liveStatus } = useLiveRoom('chat', (event, payload) => {
    if (event !== 'typing') return
    if (typingTimer.current) clearTimeout(typingTimer.current)
    if (payload.on === true) {
      setPartnerTyping(true)
      typingTimer.current = setTimeout(() => setPartnerTyping(false), 4000)
    } else {
      setPartnerTyping(false)
    }
  })
  useEffect(() => {
    if (!partnerHere) setPartnerTyping(false)
  }, [partnerHere])
  const announceTyping = (on: boolean) => {
    const now = Date.now()
    if (on && now - lastTypingSent.current < 1500) return
    lastTypingSent.current = on ? now : 0
    sendLive('typing', { on })
  }
  const bottom = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const firstScroll = useRef(false)

  const nearBottom = () =>
    window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 200
  const scrollDown = (smooth = true) =>
    requestAnimationFrame(() => bottom.current?.scrollIntoView({ block: 'end', behavior: smooth ? 'smooth' : 'auto' }))

  const markRead = useCallback(() => {
    if (document.visibilityState === 'visible') void api.markChatRead()
  }, [api])

  const refresh = useCallback(async () => {
    try {
      const [latest, readList] = await Promise.all([api.listMessages(spaceId, undefined, PAGE), api.listChatReads(spaceId)])
      latest.forEach((m) => seen.current.add(m.id))
      setMessages((current) => mergeLatest(current, latest))
      setReads(readList)
      setHasMore((has) => has || latest.length === PAGE)
      setError(null)
    } catch (e) {
      setError(friendlyError(e, 'We could not load your messages.'))
    } finally {
      setLoading(false)
    }
  }, [api, spaceId])

  useEffect(() => {
    setViewing(true)
    void refresh().then(markRead)
    const unsubscribe = api.subscribeChat(spaceId, {
      onMessage: (message) => {
        const atBottom = nearBottom()
        setMessages((current) => {
          if (current.some((m) => m.id === message.id)) return current
          // Our own message arriving live before the send finished — the send will place it.
          if (message.sender_id === me && current.some((m) => m.pending === 'sending' && m.body === message.body)) {
            return current
          }
          return [...current, message]
        })
        if (message.sender_id !== me) {
          setPartnerTyping(false)
          markRead()
          if (atBottom) scrollDown()
        }
      },
      onDelete: (id) => setMessages((current) => current.filter((m) => m.id !== id)),
      onRead: (read) =>
        setReads((current) => [...current.filter((r) => r.user_id !== read.user_id), read]),
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh().then(markRead)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      setViewing(false)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, spaceId, me, refresh, markRead, setViewing])

  // Land at the newest message the first time.
  useLayoutEffect(() => {
    if (!loading && !firstScroll.current) {
      firstScroll.current = true
      bottom.current?.scrollIntoView({ block: 'end' })
    }
  }, [loading])

  const ordered = useMemo(() => {
    const done = messages.filter((m) => !m.pending).sort((a, b) => a.created_at.localeCompare(b.created_at))
    return [...done, ...messages.filter((m) => m.pending)]
  }, [messages])

  const lastMine = [...ordered].reverse().find((m) => m.sender_id === me && !m.pending)
  const partnerRead = reads.find((r) => r.user_id !== me)
  const seenByThem = Boolean(lastMine && partnerRead && partnerRead.last_read_at >= lastMine.created_at)

  const deliver = async (body: string, localKey: string) => {
    try {
      const real = await api.sendMessage(spaceId, body)
      seen.current.add(real.id)
      setMessages((current) => {
        const rest = current.filter((m) => m.id !== localKey && m.id !== real.id)
        return [...rest, { ...real, localKey }]
      })
    } catch {
      setMessages((current) => current.map((m) => (m.id === localKey ? { ...m, pending: 'failed' } : m)))
    }
  }

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const body = text.trim()
    if (!body) return
    const localKey = `local-${crypto.randomUUID()}`
    announceTyping(false)
    setText('')
    if (input.current) input.current.style.height = ''
    setMessages((current) => [
      ...current,
      { id: localKey, localKey, space_id: spaceId, sender_id: me, body, created_at: new Date().toISOString(), pending: 'sending' },
    ])
    scrollDown()
    void deliver(body, localKey)
  }

  const retry = (message: Shown) => {
    setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, pending: 'sending' } : m)))
    void deliver(message.body, message.id)
  }

  const loadEarlier = async () => {
    const oldest = ordered.find((m) => !m.pending)
    if (!oldest) return
    setLoadingMore(true)
    const before = document.documentElement.scrollHeight
    try {
      const older = await api.listMessages(spaceId, oldest.created_at, PAGE)
      older.forEach((m) => seen.current.add(m.id))
      setMessages((current) => [...older.filter((m) => !current.some((c) => c.id === m.id)), ...current])
      setHasMore(older.length === PAGE)
      requestAnimationFrame(() => window.scrollBy(0, document.documentElement.scrollHeight - before))
    } catch (e) {
      setNotice(friendlyError(e))
    } finally {
      setLoadingMore(false)
    }
  }

  const unsend = async () => {
    if (!unsending) return
    const target = unsending
    setUnsending(null)
    setSelected(null)
    if (target.pending) {
      setMessages((current) => current.filter((m) => m.id !== target.id))
      return
    }
    try {
      await api.deleteMessage(target.id)
      setMessages((current) => current.filter((m) => m.id !== target.id))
    } catch (e) {
      setNotice(friendlyError(e))
    }
  }

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`
  }

  return (
    <div className="-mt-2">
      <header className="paper mb-4 flex items-center gap-3 px-4 py-3">
        <Link
          to="/"
          aria-label="Back home"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-peacock-soft/60 hover:text-peacock-deep sm:hidden"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <Feather className="h-11 w-5 shrink-0" />
        <div className="min-w-0">
          <h1 className="truncate font-serif text-2xl leading-tight text-peacock-deep">{partnerName}</h1>
          <p className="flex items-center gap-1 text-xs text-ink-soft">
            <Lock className="size-3" aria-hidden /> Only the two of you can read this
          </p>
          {partner && <PresencePill name={partnerName} here={partnerHere} status={liveStatus} className="mt-1" />}
        </div>
      </header>

      {loading && <Spinner label="Opening our little chat…" />}
      {error && <ErrorNote message={error} onRetry={() => void refresh()} />}

      {!loading && !error && (
        <div className="min-h-[50dvh]" role="log" aria-live="polite" aria-label={`Chat with ${partnerName}`}>
          {hasMore && (
            <div className="mb-4 text-center">
              <button
                type="button"
                onClick={() => void loadEarlier()}
                disabled={loadingMore}
                className="rounded-full bg-paper/80 px-4 py-2 text-sm font-semibold text-peacock-deep shadow-soft disabled:opacity-60"
              >
                {loadingMore ? 'Loading…' : 'Earlier messages'}
              </button>
            </div>
          )}

          {ordered.length === 0 && (
            <div className="py-16 text-center">
              <p className="hand text-[1.6rem] text-rose-deep">Say hello ♡</p>
              <p className="mt-1 text-sm text-ink-soft">
                {partner
                  ? 'This little chat is only for the two of you.'
                  : 'Your love has not joined yet — your messages will be waiting.'}
              </p>
            </div>
          )}

          <ol className="space-y-1">
            {ordered.map((message, i) => {
              const prev = ordered[i - 1]
              const next = ordered[i + 1]
              const mine = message.sender_id === me
              const newDay = !prev || localDay(prev.created_at) !== localDay(message.created_at)
              const lastOfRun =
                !next ||
                next.sender_id !== message.sender_id ||
                new Date(next.created_at).getTime() - new Date(message.created_at).getTime() > GROUP_GAP_MS
              const isSelected = selected === message.id
              const animateIn = !seen.current.has(message.id)
              return (
                <Fragment key={message.localKey ?? message.id}>
                  {newDay && (
                    <li className="py-3 text-center">
                      <span className="rounded-full bg-paper/80 px-3 py-1 text-xs font-semibold text-ink-soft">
                        {dayLabel(message.created_at)}
                      </span>
                    </li>
                  )}
                  <motion.li
                    initial={animateIn ? { opacity: 0, y: 12, scale: 0.94 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                    className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${lastOfRun ? 'pb-2' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(isSelected ? null : message.id)}
                      aria-expanded={isSelected}
                      className={`max-w-[82%] rounded-3xl px-4 py-2.5 text-left text-[1rem] leading-snug break-words whitespace-pre-wrap shadow-soft transition ${
                        mine
                          ? `${lastOfRun ? 'rounded-br-md' : ''} bg-peacock text-white ${message.pending === 'sending' ? 'opacity-70' : ''} ${message.pending === 'failed' ? 'bg-rose-deep' : ''}`
                          : `${lastOfRun ? 'rounded-bl-md' : ''} border border-gold/20 bg-paper text-ink`
                      }`}
                    >
                      {message.body}
                    </button>
                    {message.pending === 'failed' && (
                      <span className="mt-1 flex items-center gap-3 text-xs text-rose-deep">
                        Not sent
                        <button type="button" onClick={() => retry(message)} className="inline-flex items-center gap-1 font-semibold">
                          <RotateCcw className="size-3" aria-hidden /> Try again
                        </button>
                        <button type="button" onClick={() => setUnsending(message)} className="font-semibold">
                          Remove
                        </button>
                      </span>
                    )}
                    {(lastOfRun || isSelected) && !message.pending && (
                      <span className="mt-1 flex items-center gap-2 px-2 text-[0.7rem] text-ink-soft">
                        {formatTime(message.created_at)}
                        {mine && message.id === lastMine?.id && seenByThem && <span className="text-rose-deep">· Seen ♡</span>}
                        {mine && isSelected && (
                          <button
                            type="button"
                            onClick={() => setUnsending(message)}
                            className="font-semibold text-rose-deep"
                          >
                            Unsend
                          </button>
                        )}
                      </span>
                    )}
                  </motion.li>
                </Fragment>
              )
            })}
          </ol>
          <AnimatePresence>
            {partnerTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="mt-2 flex items-center gap-2"
                aria-live="polite"
              >
                <span className="flex items-center gap-1 rounded-3xl rounded-bl-md border border-gold/20 bg-paper px-4 py-3 shadow-soft">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="size-2 rounded-full bg-rose"
                      animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </span>
                <span className="text-xs text-ink-soft">{partnerName} is writing…</span>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottom} className="h-2" />
        </div>
      )}

      {notice && (
        <p role="alert" className="my-2 rounded-xl bg-blush/60 px-4 py-2 text-sm text-rose-deep">
          {notice}
        </p>
      )}

      <form
        onSubmit={send}
        className="sticky bottom-0 z-30 -mx-5 mt-3 border-t border-gold/20 bg-ivory/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:mx-0 sm:rounded-3xl sm:border sm:bg-paper/90"
      >
        <div className="flex items-end gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message {partnerName}
          </label>
          <textarea
            id="chat-input"
            ref={input}
            rows={1}
            maxLength={4000}
            enterKeyHint="send"
            className="field max-h-[150px] flex-1 resize-none rounded-3xl py-2.5"
            placeholder={`Message ${partnerName}…`}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              grow(e.target)
              announceTyping(e.target.value.trim().length > 0)
            }}
            onBlur={() => announceTyping(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-peacock text-white shadow-soft transition active:scale-90 disabled:opacity-40"
          >
            <Send className="size-5" aria-hidden />
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={unsending !== null}
        title="Unsend this message?"
        message={`It will disappear for both of you${unsending?.pending ? '' : `, even if ${partnerName} has already read it`}.`}
        confirmLabel="Unsend"
        onConfirm={() => void unsend()}
        onCancel={() => setUnsending(null)}
      />
    </div>
  )
}
