import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Download, Eraser, Undo2 } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import type { DoodleStroke } from '../lib/types'
import { Button, ConfirmDialog, ErrorNote, Page, Spinner } from '../components/ui'

type Stroke = DoodleStroke & { pending?: boolean }

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

function drawStroke(ctx: CanvasRenderingContext2D, s: Pick<Stroke, 'color' | 'width' | 'points'>, w: number, h: number) {
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

/** A shared sheet of paper. Every stroke either of you draws appears for the other, live. */
export default function Doodle() {
  const { api } = useApp()
  const world = useWorld()
  const spaceId = world.space.id
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)

  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [color, setColor] = useState(COLORS[0]!.value)
  const [size, setSize] = useState(SIZES[1]!.value)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const canvas = useRef<HTMLCanvasElement>(null)
  const current = useRef<{ color: string; width: number; points: number[] } | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const frame = useRef<number | null>(null)
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
    strokesRef.current.forEach((s) => drawStroke(ctx, s, w, h))
    if (current.current) drawStroke(ctx, current.current, w, h)
  }, [])

  const schedule = useCallback(() => {
    frame.current ??= requestAnimationFrame(paint)
  }, [paint])

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

  // Load the board and listen for the other person's strokes.
  useEffect(() => {
    let active = true
    api
      .listStrokes(spaceId)
      .then((list) => active && setStrokes(list))
      .catch((e) => active && setError(friendlyError(e)))
      .finally(() => active && setLoading(false))
    const unsubscribe = api.subscribeDoodles(spaceId, {
      onStroke: (stroke) =>
        setStrokes((list) => {
          if (list.some((s) => s.id === stroke.id)) return list
          if (stroke.author_id === me && list.some((s) => s.pending)) return list // our own echo; the save places it
          return [...list, stroke]
        }),
      onDelete: (id) => setStrokes((list) => list.filter((s) => s.id !== id)),
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [api, spaceId, me])

  const pointAt = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    return [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000] as const
  }

  const finish = () => {
    const stroke = current.current
    current.current = null
    if (!stroke || stroke.points.length < 2) return
    const localId = `local-${crypto.randomUUID()}`
    const optimistic: Stroke = {
      ...stroke,
      id: localId,
      space_id: spaceId,
      author_id: me,
      created_at: new Date().toISOString(),
      pending: true,
    }
    setStrokes((list) => [...list, optimistic])
    api
      .addStroke(spaceId, stroke)
      .then((saved) =>
        setStrokes((list) => [...list.filter((s) => s.id !== localId && s.id !== saved.id), saved]),
      )
      .catch((e) => {
        setStrokes((list) => list.filter((s) => s.id !== localId))
        setNotice(friendlyError(e))
      })
  }

  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const [x, y] = pointAt(event)
    current.current = { color, width: size, points: [x, y] }
    schedule()
  }

  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = current.current
    if (!stroke) return
    // Coalesced events give smoother lines on fast devices; some browsers return none.
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
    const events = coalesced.length > 0 ? coalesced : [event.nativeEvent]
    const rect = event.currentTarget.getBoundingClientRect()
    for (const e of events) {
      const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
      const lx = stroke.points[stroke.points.length - 2]!
      const ly = stroke.points[stroke.points.length - 1]!
      if (Math.hypot(x - lx, y - ly) < MIN_STEP) continue
      stroke.points.push(Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000)
      if (stroke.points.length >= MAX_NUMBERS) {
        // Very long line: save this part and carry on seamlessly.
        finish()
        current.current = { color: stroke.color, width: stroke.width, points: [x, y] }
        break
      }
    }
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
        <p className="mt-1 text-ink-soft">
          {partner
            ? `Whatever you draw appears on ${nameOf(world, partner.id)}’s screen too, live.`
            : 'A shared sheet of paper. Your love will see it once they join.'}
        </p>
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
                  className={`size-9 rounded-full border-2 transition ${
                    color === c.value ? 'scale-110 border-ink' : 'border-white'
                  } shadow-soft`}
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
          />

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
            <Button variant="ghost" onClick={() => setConfirmClear(true)} disabled={strokes.length === 0} className="text-rose-deep">
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
