import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Download, Eraser, Undo2 } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useLiveRoom, useThrottle } from '../lib/live'
import type { DoodleStroke } from '../lib/types'
import { PresencePill } from '../components/Presence'
import { Button, ConfirmDialog, ErrorNote, Page, Spinner } from '../components/ui'

type Stroke = DoodleStroke & { pending?: boolean }
type Ink = { color: string; width: number; points: number[] }
interface LiveInk extends Ink {
  seen: number
  savedId?: string
}

const ASPECT = 1.25 // height = width × 1.25, the same on every screen
const PAPER = '#fffdf8'
const COLORS = [
  { value: '#1f6f7a', name: 'Peacock blue' },
  { value: '#cf8493', name: 'Blush rose' },
  { value: '#c4a15a', name: 'Gold' },
  { value: '#6f8463', name: 'Sage' },
  { value: '#7d6c9e', name: 'Lavender' },
  { value: '#33333f', name: 'Ink' },
]
const SIZES = [
  { value: 0.005, name: 'Fine' },
  { value: 0.01, name: 'Medium' },
  { value: 0.022, name: 'Bold' },
]
const MAX_NUMBERS = 4000 // the database accepts up to 2000 points per stroke
const MIN_STEP = 0.0025
const LIVE_FLUSH_MS = 40
const CURSOR_MS = 50
const round = (n: number) => Math.round(n * 10000) / 10000
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function drawInk(ctx: CanvasRenderingContext2D, s: Ink, w: number, h: number) {
  const p = s.points
  if (p.length < 2) return
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = Math.max(1, s.width * w)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (p.length === 2) {
    ctx.beginPath()
    ctx.arc(p[0]! * w, p[1]! * h, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.beginPath()
  ctx.moveTo(p[0]! * w, p[1]! * h)
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = ((p[i]! + p[i + 2]!) / 2) * w
    const my = ((p[i + 1]! + p[i + 3]!) / 2) * h
    ctx.quadraticCurveTo(p[i]! * w, p[i + 1]! * h, mx, my)
  }
  ctx.lineTo(p[p.length - 2]! * w, p[p.length - 1]! * h)
  ctx.stroke()
}

/**
 * A shared sheet of paper. You see each other's cursor and every line as it is
 * being drawn; finished lines are saved so the board is still there tomorrow.
 */
export default function Doodle() {
  const { api } = useApp()
  const world = useWorld()
  const spaceId = world.space.id
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)
  const partnerName = partner ? nameOf(world, partner.id) : 'Your love'

  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [color, setColor] = useState(COLORS[0]!.value)
  const [size, setSize] = useState(SIZES[1]!.value)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [theirCursor, setTheirCursor] = useState<{ x: number; y: number; drawing: boolean; color: string } | null>(null)

  const canvas = useRef<HTMLCanvasElement>(null)
  const current = useRef<(Ink & { key: string; sent: number }) | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const liveInks = useRef<Map<string, LiveInk>>(new Map())
  const frame = useRef<number | null>(null)
  const cursorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  strokesRef.current = strokes

  const paint = useCallback(() => {
    frame.current = null
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const w = el.width
    const h = el.height
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, w, h)
    strokesRef.current.forEach((s) => drawInk(ctx, s, w, h))
    liveInks.current.forEach((ink) => drawInk(ctx, ink, w, h))
    if (current.current) drawInk(ctx, current.current, w, h)
  }, [])

  const schedule = useCallback(() => {
    frame.current ??= requestAnimationFrame(paint)
  }, [paint])

  // ── live: their cursor and their line, as it is drawn ──
  const showCursor = (x: number, y: number, drawing: boolean, inkColor: string) => {
    setTheirCursor({ x, y, drawing, color: inkColor })
    if (cursorTimer.current) clearTimeout(cursorTimer.current)
    cursorTimer.current = setTimeout(() => setTheirCursor(null), 3000)
  }

  const { send, partnerHere, status } = useLiveRoom('doodle', (event, payload) => {
    if (event === 'cursor') {
      if (isNum(payload.x) && isNum(payload.y)) {
        showCursor(clamp01(payload.x), clamp01(payload.y), false, typeof payload.color === 'string' ? payload.color : '#cf8493')
      }
    } else if (event === 'cursor-off') {
      setTheirCursor(null)
    } else if (event === 'ink') {
      const key = typeof payload.key === 'string' ? payload.key : null
      const pts = Array.isArray(payload.pts) ? payload.pts.filter(isNum) : []
      if (!key || pts.length < 2) return
      const inkColor = typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color) ? payload.color : '#33333f'
      const width = isNum(payload.width) ? Math.min(0.05, Math.max(0.001, payload.width)) : 0.01
      const existing = liveInks.current.get(key)
      if (existing) {
        existing.points.push(...pts.slice(0, MAX_NUMBERS - existing.points.length))
        existing.seen = Date.now()
      } else {
        liveInks.current.set(key, { color: inkColor, width, points: pts.slice(0, MAX_NUMBERS), seen: Date.now() })
      }
      showCursor(clamp01(pts[pts.length - 2]!), clamp01(pts[pts.length - 1]!), true, inkColor)
      schedule()
    } else if (event === 'ink-alive') {
      const ink = typeof payload.key === 'string' ? liveInks.current.get(payload.key) : undefined
      if (ink) ink.seen = Date.now()
    } else if (event === 'ink-end') {
      const key = typeof payload.key === 'string' ? payload.key : null
      const ink = key ? liveInks.current.get(key) : undefined
      if (!key || !ink) return
      const savedId = typeof payload.id === 'string' ? payload.id : undefined
      // Keep showing it until the saved line arrives, so it never blinks.
      if (!savedId || strokesRef.current.some((s) => s.id === savedId)) liveInks.current.delete(key)
      else ink.savedId = savedId
      schedule()
    } else if (event === 'clear') {
      liveInks.current.clear()
      schedule()
    }
  })

  // While our pen is down, a quiet heartbeat keeps our unfinished line alive on their screen.
  useEffect(() => {
    const beat = setInterval(() => {
      if (current.current) send('ink-alive', { key: current.current.key })
    }, 2000)
    return () => clearInterval(beat)
  }, [send])

  // Forget live lines that stopped arriving (closed tab, lost signal).
  useEffect(() => {
    const sweep = setInterval(() => {
      const stale = Date.now() - 8000
      let changed = false
      liveInks.current.forEach((ink, key) => {
        if (ink.seen < stale) {
          liveInks.current.delete(key)
          changed = true
        }
      })
      if (changed) schedule()
    }, 2000)
    return () => clearInterval(sweep)
  }, [schedule])

  const sendCursor = useThrottle((x: number, y: number) => send('cursor', { x, y, color }), CURSOR_MS)

  const flushInk = useCallback(() => {
    const ink = current.current
    if (!ink || ink.sent >= ink.points.length) return
    // overlap by one point so the pieces join up seamlessly on the other screen
    const from = Math.max(0, ink.sent - 2)
    send('ink', { key: ink.key, color: ink.color, width: ink.width, pts: ink.points.slice(from) })
    ink.sent = ink.points.length
  }, [send])
  const flushInkSoon = useThrottle(flushInk, LIVE_FLUSH_MS)

  // Size the canvas to its box (sharp on high-density screens).
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const resize = () => {
      const width = el.clientWidth
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      el.width = Math.round(width * ratio)
      el.height = Math.round(width * ASPECT * ratio)
      paint()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [paint, loading])

  useEffect(() => schedule(), [strokes, schedule])

  // Load the board and listen for saved strokes.
  useEffect(() => {
    let active = true
    api
      .listStrokes(spaceId)
      .then((list) => active && setStrokes(list))
      .catch((e) => active && setError(friendlyError(e)))
      .finally(() => active && setLoading(false))
    const unsubscribe = api.subscribeDoodles(spaceId, {
      onStroke: (stroke) => {
        liveInks.current.forEach((ink, key) => ink.savedId === stroke.id && liveInks.current.delete(key))
        setStrokes((list) => {
          if (list.some((s) => s.id === stroke.id)) return list
          if (stroke.author_id === me && list.some((s) => s.pending)) return list // our own echo; the save places it
          return [...list, stroke]
        })
      },
      onDelete: (id) => setStrokes((list) => list.filter((s) => s.id !== id)),
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [api, spaceId, me])

  const pointFrom = (clientX: number, clientY: number, rect: DOMRect) =>
    [round(clamp01((clientX - rect.left) / rect.width)), round(clamp01((clientY - rect.top) / rect.height))] as const

  const finish = () => {
    const ink = current.current
    current.current = null
    if (!ink || ink.points.length < 2) return
    flushInk()
    const localId = `local-${crypto.randomUUID()}`
    const stroke = { color: ink.color, width: ink.width, points: ink.points }
    setStrokes((list) => [
      ...list,
      { ...stroke, id: localId, space_id: spaceId, author_id: me, created_at: new Date().toISOString(), pending: true },
    ])
    api
      .addStroke(spaceId, stroke)
      .then((saved) => {
        setStrokes((list) => [...list.filter((s) => s.id !== localId && s.id !== saved.id), saved])
        send('ink-end', { key: ink.key, id: saved.id })
      })
      .catch((e) => {
        setStrokes((list) => list.filter((s) => s.id !== localId))
        send('ink-end', { key: ink.key })
        setNotice(friendlyError(e))
      })
  }

  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // some pens/browsers refuse capture; drawing still works without it
    }
    const [x, y] = pointFrom(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    current.current = { key: crypto.randomUUID(), color, width: size, points: [x, y], sent: 0 }
    flushInkSoon()
    schedule()
  }

  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ink = current.current
    if (!ink) {
      const [x, y] = pointFrom(event.clientX, event.clientY, rect)
      sendCursor(x, y)
      return
    }
    // Coalesced events give smoother lines on fast devices; some browsers return none.
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
    const events = coalesced.length > 0 ? coalesced : [event.nativeEvent]
    for (const e of events) {
      const [x, y] = pointFrom(e.clientX, e.clientY, rect)
      const lx = ink.points[ink.points.length - 2]!
      const ly = ink.points[ink.points.length - 1]!
      if (Math.hypot(x - lx, y - ly) < MIN_STEP) continue
      ink.points.push(x, y)
      if (ink.points.length >= MAX_NUMBERS) {
        // Very long line: save this part and carry on seamlessly.
        finish()
        current.current = { key: crypto.randomUUID(), color: ink.color, width: ink.width, points: [x, y], sent: 0 }
        break
      }
    }
    flushInkSoon()
    schedule()
  }

  const undo = async () => {
    const last = [...strokes].reverse().find((s) => s.author_id === me && !s.pending)
    if (!last) return
    setStrokes((list) => list.filter((s) => s.id !== last.id))
    try {
      await api.deleteStroke(last.id)
    } catch (e) {
      setStrokes((list) => [...list, last].sort((a, b) => a.created_at.localeCompare(b.created_at)))
      setNotice(friendlyError(e))
    }
  }

  const clear = async () => {
    setClearing(true)
    try {
      await api.clearBoard()
      setStrokes([])
      liveInks.current.clear()
      send('clear')
      setConfirmClear(false)
    } catch (e) {
      setNotice(friendlyError(e))
    } finally {
      setClearing(false)
    }
  }

  const download = () => {
    const el = canvas.current
    if (!el) return
    const link = document.createElement('a')
    link.download = `our-doodle-${new Date().toISOString().slice(0, 10)}.png`
    link.href = el.toDataURL('image/png')
    link.click()
  }

  const myStrokes = strokes.some((s) => s.author_id === me && !s.pending)

  return (
    <Page>
      <Link
        to="/world"
        className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
      >
        <ArrowLeft className="size-4" aria-hidden /> Our World
      </Link>
      <header className="mb-4">
        <p className="eyebrow mb-1">Draw together</p>
        <h1 className="text-[2rem] leading-tight text-peacock-deep sm:text-4xl">Our doodle board</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {partner ? (
            <PresencePill name={partnerName} here={partnerHere} status={status} />
          ) : (
            <span className="text-sm text-ink-soft">Your love will see this once they join.</span>
          )}
        </div>
      </header>

      {loading && <Spinner label="Unrolling the paper…" />}
      {error && <ErrorNote message={error} />}

      {!loading && !error && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="flex gap-1.5" role="radiogroup" aria-label="Colour">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={color === c.value}
                  aria-label={c.name}
                  onClick={() => setColor(c.value)}
                  className={`size-9 rounded-full border-2 shadow-soft transition ${
                    color === c.value ? 'scale-110 border-ink' : 'border-white'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label="Brush size">
              {SIZES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={size === s.value}
                  aria-label={s.name}
                  onClick={() => setSize(s.value)}
                  className={`flex size-9 items-center justify-center rounded-full transition ${
                    size === s.value ? 'bg-peacock-soft' : 'hover:bg-peacock-soft/50'
                  }`}
                >
                  <span
                    className="rounded-full"
                    style={{ backgroundColor: color, width: 4 + s.value * 600, height: 4 + s.value * 600 }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <canvas
              ref={canvas}
              className="block w-full cursor-crosshair touch-none rounded-2xl border border-gold/30 shadow-polaroid select-none"
              style={{ aspectRatio: `1 / ${ASPECT}` }}
              aria-label="Shared drawing board. Draw with your finger or mouse."
              role="img"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={finish}
              onPointerCancel={finish}
              onPointerLeave={() => send('cursor-off')}
            />
            {/* their cursor, live */}
            <AnimatePresence>
              {theirCursor && (
                <motion.div
                  key="their-cursor"
                  className="pointer-events-none absolute top-0 left-0 z-10"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    left: `${theirCursor.x * 100}%`,
                    top: `${theirCursor.y * 100}%`,
                  }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ left: { type: 'spring', stiffness: 700, damping: 45 }, top: { type: 'spring', stiffness: 700, damping: 45 } }}
                  aria-hidden
                >
                  <span
                    className="absolute -top-3 -left-3 size-6 rounded-full blur-[6px]"
                    style={{ backgroundColor: theirCursor.color, opacity: 0.45 }}
                  />
                  <svg viewBox="0 0 16 16" className="absolute -top-0.5 -left-0.5 size-4 drop-shadow" aria-hidden>
                    <path d="M1 1 L14 7 L8 8.5 L6 14 Z" fill={theirCursor.color} stroke="white" strokeWidth="1.2" />
                  </svg>
                  <span
                    className="absolute top-3.5 left-3 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap text-white shadow-soft"
                    style={{ backgroundColor: theirCursor.color }}
                  >
                    {partnerName}
                    {theirCursor.drawing ? ' ✎' : ''}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {notice && (
            <p role="alert" className="mt-3 rounded-xl bg-blush/60 px-4 py-2 text-sm text-rose-deep">
              {notice}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="soft" onClick={() => void undo()} disabled={!myStrokes}>
              <Undo2 className="size-4" aria-hidden /> Undo my last line
            </Button>
            <Button variant="soft" onClick={download} disabled={strokes.length === 0}>
              <Download className="size-4" aria-hidden /> Save as picture
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmClear(true)}
              disabled={strokes.length === 0}
              className="text-rose-deep"
            >
              <Eraser className="size-4" aria-hidden /> Fresh page
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Start a fresh page?"
        message="Everything on the board — both of your drawings — will be wiped for both of you. Save it as a picture first if you want to keep it."
        confirmLabel="Wipe the board"
        busy={clearing}
        onConfirm={() => void clear()}
        onCancel={() => setConfirmClear(false)}
      />
    </Page>
  )
}
