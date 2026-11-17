import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ImagePlus, Lock, RotateCcw, Send, X } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { useChatStatus } from '../app/ChatContext'
import { friendlyError } from '../data/api'
import { dayLabel, formatTime, localDay } from '../lib/dates'
import { prepareImage } from '../lib/images'
import { MESSAGE_REACTIONS, type ChatMessage, type ChatRead, type MessageReaction } from '../lib/types'
import { Feather } from '../components/Decor'
import { PresencePill } from '../components/Presence'
import { useLiveRoom } from '../lib/live'
import { ConfirmDialog, ErrorNote, PrivatePhoto, Spinner } from '../components/ui'

type Shown = ChatMessage & {
  pending?: 'sending' | 'failed'
  localKey?: string
  /** a photo still on this device (while sending) */
  localFile?: File
  localPreview?: string
  progress?: number
}

const PAGE = 60
const GROUP_GAP_MS = 10 * 60_000
const thumbOf = (path: string) => path.replace(/\.jpg$/, '_thumb.jpg')

/** Keep the newest page from the server, plus anything older we already had, plus unsent ones. */
function mergeLatest(current: Shown[], latest: ChatMessage[]): Shown[] {
  const pending = current.filter((m) => m.pending)
  if (latest.length === 0) return pending
  const from = latest[0]!.created_at
  const older = current.filter((m) => !m.pending && m.created_at < from)
  const keys = new Map(current.map((m) => [m.id, m.localKey]))
  return [...older, ...latest.map((m) => ({ ...m, localKey: keys.get(m.id) })), ...pending]
}

/** A private chat for two: words, photos, reactions. Updates live; only the two of you can read it. */
export default function Chat() {
  const { api } = useApp()
  const world = useWorld()
  const { setViewing } = useChatStatus()
  const spaceId = world.space.id
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)
  const partnerName = partner ? nameOf(world, partner.id) : 'Your love'

  const [messages, setMessages] = useState<Shown[]>([])
  const [reads, setReads] = useState<ChatRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [unsending, setUnsending] = useState<Shown | null>(null)
  const [viewing, setViewingPhoto] = useState<Shown | null>(null)
  const [hearted, setHearted] = useState<string | null>(null) // message that just got a double-tap heart
  const [menuBelow, setMenuBelow] = useState(false)

  // A tap anywhere else closes the little menu.
  useEffect(() => {
    if (!selected) return
    const close = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target?.closest?.(`[data-msg-id="${CSS.escape(selected)}"]`)) setSelected(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [selected])
  const [notice, setNotice] = useState<string | null>(null)
  const [partnerTyping, setPartnerTyping] = useState(false)

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTypingSent = useRef(0)
  const seen = useRef<Set<string>>(new Set()) // messages that should not animate in
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const firstScroll = useRef(false)
  const lastTap = useRef<{ id: string; at: number } | null>(null)

  // ── live: are they here, and are they writing? ──
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

  // ── scrolling (inside the chat panel, never the whole page) ──
  const nearBottom = () => {
    const el = scroller.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160
  }
  const scrollDown = (smooth = true) =>
    requestAnimationFrame(() => {
      const el = scroller.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    })

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

  const applyReaction = (reaction: MessageReaction) =>
    setMessages((current) =>
      current.map((m) =>
        m.id === reaction.message_id
          ? { ...m, reactions: [...(m.reactions ?? []).filter((r) => r.user_id !== reaction.user_id), reaction] }
          : m,
      ),
    )

  useEffect(() => {
    setViewing(true)
    void refresh().then(markRead)
    const unsubscribe = api.subscribeChat(spaceId, {
      onMessage: (message) => {
        const atBottom = nearBottom()
        setMessages((current) => {
          if (current.some((m) => m.id === message.id)) return current
          // Our own message arriving live before the send finished — the send will place it.
          if (
            message.sender_id === me &&
            current.some((m) => m.pending === 'sending' && (m.body ?? '') === (message.body ?? ''))
          ) {
            return current
          }
          return [...current, { ...message, reactions: message.reactions ?? [] }]
        })
        if (message.sender_id !== me) {
          setPartnerTyping(false)
          markRead()
          if (atBottom) scrollDown()
        }
      },
      onDelete: (id) => setMessages((current) => current.filter((m) => m.id !== id)),
      onRead: (read) => setReads((current) => [...current.filter((r) => r.user_id !== read.user_id), read]),
      onReaction: applyReaction,
      onReactionRemoved: (reactionId) =>
        setMessages((current) =>
          current.map((m) =>
            m.reactions?.some((r) => r.id === reactionId) ? { ...m, reactions: m.reactions.filter((r) => r.id !== reactionId) } : m,
          ),
        ),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, spaceId, me, refresh, markRead, setViewing])

  // Land at the newest message the first time.
  useLayoutEffect(() => {
    if (!loading && !firstScroll.current && scroller.current) {
      firstScroll.current = true
      scroller.current.scrollTop = scroller.current.scrollHeight
    }
  }, [loading])

  const ordered = useMemo(() => {
    const done = messages.filter((m) => !m.pending).sort((a, b) => a.created_at.localeCompare(b.created_at))
    return [...done, ...messages.filter((m) => m.pending)]
  }, [messages])

  const lastMine = [...ordered].reverse().find((m) => m.sender_id === me && !m.pending)
  const partnerRead = reads.find((r) => r.user_id !== me)
  const seenByThem = Boolean(lastMine && partnerRead && partnerRead.last_read_at >= lastMine.created_at)

  // ── sending ──
  const deliver = async (localKey: string, body: string | null, file?: File) => {
    try {
      const image = file ? await prepareImage(file) : undefined
      const real = await api.sendMessage(spaceId, body, image, (f) =>
        setMessages((current) => current.map((m) => (m.id === localKey ? { ...m, progress: f } : m))),
      )
      seen.current.add(real.id)
      setMessages((current) => {
        const local = current.find((m) => m.id === localKey)
        if (local?.localPreview) setTimeout(() => URL.revokeObjectURL(local.localPreview!), 5000)
        const rest = current.filter((m) => m.id !== localKey && m.id !== real.id)
        return [...rest, { ...real, reactions: [], localKey }]
      })
    } catch (e) {
      setNotice(friendlyError(e, 'A message could not be sent.'))
      setMessages((current) => current.map((m) => (m.id === localKey ? { ...m, pending: 'failed' } : m)))
    }
  }

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const body = text.trim() || null
    if (!body && !photo) return
    const localKey = `local-${crypto.randomUUID()}`
    announceTyping(false)
    setText('')
    setNotice(null)
    if (input.current) input.current.style.height = ''
    const attached = photo
    setPhoto(null)
    setMessages((current) => [
      ...current,
      {
        id: localKey,
        localKey,
        space_id: spaceId,
        sender_id: me,
        body,
        created_at: new Date().toISOString(),
        pending: 'sending',
        localFile: attached?.file,
        localPreview: attached?.preview,
        progress: 0,
      },
    ])
    scrollDown()
    void deliver(localKey, body, attached?.file)
  }

  const retry = (message: Shown) => {
    setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, pending: 'sending', progress: 0 } : m)))
    void deliver(message.id, message.body, message.localFile)
  }

  const pickPhoto = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setNotice('Only photos can be sent here (videos belong in Memories).')
      return
    }
    if (photo) URL.revokeObjectURL(photo.preview)
    setPhoto({ file, preview: URL.createObjectURL(file) })
    input.current?.focus()
  }

  // ── reactions (one per person; tap the same one again to take it back) ──
  const react = async (message: Shown, emoji: string) => {
    if (message.pending) return
    const before = message.reactions ?? []
    const current = before.find((r) => r.user_id === me)
    const next = current?.emoji === emoji ? null : emoji
    setMessages((list) =>
      list.map((m) =>
        m.id === message.id
          ? {
              ...m,
              reactions: [
                ...before.filter((r) => r.user_id !== me),
                ...(next ? [{ id: current?.id ?? `local-${emoji}`, message_id: m.id, user_id: me, emoji: next }] : []),
              ],
            }
          : m,
      ),
    )
    if (next === '❤️') {
      setHearted(message.id)
      setTimeout(() => setHearted((h) => (h === message.id ? null : h)), 900)
    }
    try {
      await api.reactToMessage(message.id, next)
    } catch (e) {
      setMessages((list) => list.map((m) => (m.id === message.id ? { ...m, reactions: before } : m)))
      setNotice(friendlyError(e))
    }
  }

  /** Tap: show the little menu. Double-tap: send a heart. */
  const tapBubble = (message: Shown, bubble?: HTMLElement) => {
    // near the top of the chat, the menu opens below the message so it isn't cut off
    if (bubble && scroller.current) {
      const top = bubble.getBoundingClientRect().top - scroller.current.getBoundingClientRect().top
      setMenuBelow(top < 110)
    }
    const now = Date.now()
    const last = lastTap.current
    if (last && last.id === message.id && now - last.at < 320) {
      lastTap.current = null
      setSelected(null)
      void react(message, '❤️')
      return
    }
    lastTap.current = { id: message.id, at: now }
    setSelected((s) => (s === message.id ? null : message.id))
  }

  const loadEarlier = async () => {
    const oldest = ordered.find((m) => !m.pending)
    const el = scroller.current
    if (!oldest || !el) return
    setLoadingMore(true)
    const before = el.scrollHeight
    try {
      const older = await api.listMessages(spaceId, oldest.created_at, PAGE)
      older.forEach((m) => seen.current.add(m.id))
      setMessages((current) => [...older.filter((m) => !current.some((c) => c.id === m.id)), ...current])
      setHasMore(older.length === PAGE)
      requestAnimationFrame(() => {
        el.scrollTop += el.scrollHeight - before
      })
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
      await api.deleteMessage(target)
      setMessages((current) => current.filter((m) => m.id !== target.id))
    } catch (e) {
      setNotice(friendlyError(e))
    }
  }

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  return (
    // One steady panel: header, messages (scrolling inside), and the message box — the same
    // margins on a phone and a laptop, and the box never jumps around.
    <div className="paper flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-gold/20 px-3 py-2.5 sm:px-5">
        <Link
          to="/"
          aria-label="Back home"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-peacock-soft/60 hover:text-peacock-deep sm:hidden"
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <Feather className="h-10 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-serif text-xl leading-tight text-peacock-deep sm:text-2xl">{partnerName}</h1>
          <p className="flex items-center gap-1 text-[0.7rem] text-ink-soft">
            <Lock className="size-3" aria-hidden /> Only the two of you can read this
          </p>
        </div>
        {partner && (
          <span className="hidden shrink-0 sm:block">
            <PresencePill name={partnerName} here={partnerHere} status={liveStatus} />
          </span>
        )}
        {partner && (
          <span
            className={`size-2.5 shrink-0 rounded-full sm:hidden ${partnerHere ? 'bg-sage-deep' : 'bg-ink-soft/30'}`}
            aria-label={partnerHere ? `${partnerName} is here` : `${partnerName} is away`}
          />
        )}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5">
        {loading && <Spinner label="Opening our little chat…" />}
        {error && <ErrorNote message={error} onRetry={() => void refresh()} />}

        {!loading && !error && (
          <div role="log" aria-live="polite" aria-label={`Chat with ${partnerName}`}>
            {hasMore && (
              <div className="mb-3 text-center">
                <button
                  type="button"
                  onClick={() => void loadEarlier()}
                  disabled={loadingMore}
                  className="rounded-full bg-parchment px-4 py-2 text-sm font-semibold text-peacock-deep disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Earlier messages'}
                </button>
              </div>
            )}

            {ordered.length === 0 && (
              <div className="py-16 text-center">
                <p className="hand text-[1.6rem] text-rose-deep">Say hello ♡</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {partner ? 'Words, photos, little reactions — just for the two of you.' : 'Your love has not joined yet — your messages will be waiting.'}
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
                const reactions = message.reactions ?? []
                const myReaction = reactions.find((r) => r.user_id === me)?.emoji
                const imageSrc = message.localPreview ?? null
                const ratio =
                  message.image_width && message.image_height
                    ? Math.min(1.6, Math.max(0.6, message.image_height / message.image_width))
                    : 1
                return (
                  <Fragment key={message.localKey ?? message.id}>
                    {newDay && (
                      <li className="py-3 text-center">
                        <span className="rounded-full bg-parchment px-3 py-1 text-xs font-semibold text-ink-soft">
                          {dayLabel(message.created_at)}
                        </span>
                      </li>
                    )}
                    <motion.li
                      data-msg-id={message.id}
                      layout="position"
                      initial={animateIn ? { opacity: 0, y: 12, scale: 0.94 } : false}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 30, layout: { duration: 0.22, ease: 'easeOut' } }}
                      className={`relative flex flex-col ${mine ? 'items-end' : 'items-start'} ${
                        lastOfRun ? 'pb-2' : reactions.length ? 'pb-4' : ''
                      } ${isSelected ? 'z-20' : ''}`}
                    >
                      <div className={`relative max-w-[82%] sm:max-w-[70%] ${mine ? 'ml-8' : 'mr-8'}`}>
                        {/* the little menu floats over the chat — it never pushes messages around */}
                        <AnimatePresence>
                          {isSelected && !message.pending && (
                            <motion.div
                              initial={{ opacity: 0, y: menuBelow ? -6 : 6, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                              className={`absolute z-30 w-max max-w-[18rem] rounded-2xl border border-gold/25 bg-paper p-1 shadow-polaroid ${
                                menuBelow ? 'top-full mt-2' : 'bottom-full mb-2'
                              } ${mine ? 'right-0' : 'left-0'}`}
                              role="toolbar"
                              aria-label="React to this message"
                            >
                              <div className="flex flex-wrap items-center gap-0.5">
                                {MESSAGE_REACTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => {
                                      setSelected(null)
                                      void react(message, emoji)
                                    }}
                                    aria-pressed={myReaction === emoji}
                                    aria-label={`React ${emoji}`}
                                    className={`flex size-8 items-center justify-center rounded-full text-lg transition hover:scale-125 ${
                                      myReaction === emoji ? 'bg-peacock-soft' : ''
                                    }`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                              <div className="mt-1 flex items-center justify-between gap-3 border-t border-gold/15 px-2 pt-1 text-[0.7rem] text-ink-soft">
                                <span>{formatTime(message.created_at)}</span>
                                {mine && (
                                  <button type="button" onClick={() => setUnsending(message)} className="font-semibold text-rose-deep">
                                    Unsend
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <button
                          type="button"
                          onClick={(e) => tapBubble(message, e.currentTarget)}
                          onDoubleClick={(e) => e.preventDefault()}
                          aria-expanded={isSelected}
                          aria-label={`${mine ? 'You' : partnerName}${message.image_path || imageSrc ? ', a photo' : ''}${message.body ? `: ${message.body}` : ''}. Tap for reactions, double-tap to heart.`}
                          className={`block overflow-hidden text-left text-[1rem] leading-snug break-words whitespace-pre-wrap shadow-soft transition select-text ${
                            mine
                              ? `${lastOfRun ? 'rounded-br-md' : ''} rounded-3xl bg-peacock text-white ${message.pending === 'sending' ? 'opacity-80' : ''} ${message.pending === 'failed' ? '!bg-rose-deep' : ''}`
                              : `${lastOfRun ? 'rounded-bl-md' : ''} rounded-3xl border border-gold/20 bg-paper text-ink`
                          } ${isSelected ? 'ring-2 ring-gold/60' : ''}`}
                        >
                          {(message.image_path || imageSrc) && (
                            <span className="relative block w-64 max-w-full" style={{ aspectRatio: `1 / ${ratio}` }}>
                              {imageSrc ? (
                                <img src={imageSrc} alt="" className="size-full object-cover" />
                              ) : (
                                <PrivatePhoto path={thumbOf(message.image_path!)} fullPath={message.image_path} alt="" className="size-full" />
                              )}
                              {message.pending === 'sending' && (
                                <span className="absolute inset-x-3 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/40">
                                  <span
                                    className="block h-full rounded-full bg-white transition-[width]"
                                    style={{ width: `${Math.round((message.progress ?? 0) * 100)}%` }}
                                  />
                                </span>
                              )}
                            </span>
                          )}
                          {message.body && <span className="block px-4 py-2.5">{message.body}</span>}
                        </button>

                        {/* open a photo full size */}
                        {message.image_path && !message.pending && (
                          <button
                            type="button"
                            onClick={() => setViewingPhoto(message)}
                            className="absolute top-2 right-2 rounded-full bg-ink/45 px-2 py-0.5 text-[0.65rem] font-semibold text-white backdrop-blur-sm"
                          >
                            View
                          </button>
                        )}

                        {/* double-tap heart */}
                        <AnimatePresence>
                          {hearted === message.id && (
                            <motion.span
                              className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl"
                              initial={{ opacity: 0, scale: 0.3 }}
                              animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.25, 1, 1.1] }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.85 }}
                              aria-hidden
                            >
                              ❤️
                            </motion.span>
                          )}
                        </AnimatePresence>

                        {/* reactions sit on the bubble's edge */}
                        {reactions.length > 0 && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                            className={`absolute -bottom-4 z-10 flex items-center gap-0.5 rounded-full border border-gold/30 bg-paper px-1.5 py-0.5 text-sm leading-none shadow-soft ${
                              mine ? 'left-2' : 'right-2'
                            }`}
                            aria-label={reactions
                              .map((r) => `${r.user_id === me ? 'You' : partnerName} reacted ${r.emoji}`)
                              .join(', ')}
                          >
                            {reactions.map((r) => (
                              <span key={r.user_id}>{r.emoji}</span>
                            ))}
                          </motion.span>
                        )}
                      </div>

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
                      {lastOfRun && !message.pending && (
                        <span className={`flex items-center gap-2 px-2 text-[0.7rem] text-ink-soft ${reactions.length ? 'mt-5' : 'mt-1'}`}>
                          {formatTime(message.created_at)}
                          {mine && message.id === lastMine?.id && seenByThem && <span className="text-rose-deep">· Seen ♡</span>}
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
                    {[0, 1, 2].map((d) => (
                      <motion.span
                        key={d}
                        className="size-2 rounded-full bg-rose"
                        animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }}
                      />
                    ))}
                  </span>
                  <span className="text-xs text-ink-soft">{partnerName} is writing…</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* the message box */}
      <form onSubmit={send} className="shrink-0 border-t border-gold/20 bg-paper/95 px-3 pt-2.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] sm:px-5">
        {notice && (
          <p role="alert" className="mb-2 flex items-start justify-between gap-2 rounded-xl bg-blush/60 px-3 py-1.5 text-xs text-rose-deep">
            {notice}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="shrink-0">
              <X className="size-3.5" aria-hidden />
            </button>
          </p>
        )}
        <AnimatePresence>
          {photo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-2 overflow-hidden"
            >
              <div className="relative inline-block">
                <img src={photo.preview} alt="Photo to send" className="h-20 w-20 rounded-xl object-cover shadow-soft" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(photo.preview)
                    setPhoto(null)
                  }}
                  aria-label="Remove photo"
                  className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full bg-ink/75 text-white"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label="Add a photo"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-peacock-deep transition hover:bg-peacock-soft/60 active:scale-90"
          >
            <ImagePlus className="size-5" aria-hidden />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              pickPhoto(e.target.files)
              e.target.value = ''
            }}
          />
          <label htmlFor="chat-input" className="sr-only">
            Message {partnerName}
          </label>
          <textarea
            id="chat-input"
            ref={input}
            rows={1}
            maxLength={4000}
            enterKeyHint="send"
            className="field max-h-[140px] min-w-0 flex-1 resize-none rounded-3xl py-2.5"
            placeholder={photo ? 'Add a caption…' : `Message ${partnerName}…`}
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
            disabled={!text.trim() && !photo}
            aria-label="Send"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-peacock text-white shadow-soft transition active:scale-90 disabled:opacity-40"
          >
            <Send className="size-5" aria-hidden />
          </button>
        </div>
      </form>

      {/* full-size photo */}
      <AnimatePresence>
        {viewing?.image_path && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-ink/95"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="Photo"
            onClick={() => setViewingPhoto(null)}
            onKeyDown={(e) => e.key === 'Escape' && setViewingPhoto(null)}
          >
            <div className="flex justify-end px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <button
                type="button"
                autoFocus
                aria-label="Close"
                onClick={() => setViewingPhoto(null)}
                className="flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15"
              >
                <X className="size-6" aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-3">
              <PrivatePhoto path={viewing.image_path} alt="Photo from the chat" className="size-full !bg-transparent" imgClassName="object-contain" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={unsending !== null}
        title="Unsend this message?"
        message={`It will disappear for both of you${unsending?.pending ? '' : `, even if ${partnerName} has already seen it`}.`}
        confirmLabel="Unsend"
        onConfirm={() => void unsend()}
        onCancel={() => setUnsending(null)}
      />
    </div>
  )
}
