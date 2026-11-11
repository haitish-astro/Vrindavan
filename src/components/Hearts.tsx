import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Heart } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import type { Reaction, ReactionTarget } from '../lib/types'

/** Loads hearts for a set of things, and lets each HeartButton update its own. */
export function useReactions(type: ReactionTarget, ids: string[]) {
  const { api } = useApp()
  const key = ids.join(',')
  const [list, setList] = useState<Reaction[]>([])

  useEffect(() => {
    let active = true
    const targets = key ? key.split(',') : []
    if (targets.length === 0) {
      setList([])
      return
    }
    api
      .listReactions(type, targets)
      .then((loaded) => active && setList(loaded))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [api, type, key])

  const forTarget = useCallback((id: string) => list.filter((r) => r.target_id === id), [list])
  const replace = useCallback(
    (id: string, next: Reaction[]) => setList((current) => [...current.filter((r) => r.target_id !== id), ...next]),
    [],
  )
  return { forTarget, replace }
}

/** A heart either of you can give. Optimistic, with rollback if it fails. */
export function HeartButton({
  type,
  targetId,
  reactions,
  onChange,
  showCaption = true,
}: {
  type: ReactionTarget
  targetId: string
  reactions: Reaction[]
  onChange: (next: Reaction[]) => void
  showCaption?: boolean
}) {
  const { api } = useApp()
  const world = useWorld()
  const mine = reactions.some((r) => r.user_id === world.me.id)
  const theirs = reactions.find((r) => r.user_id !== world.me.id)
  const [burst, setBurst] = useState(0)
  const busy = useRef(false)

  const toggle = async () => {
    if (busy.current) return
    busy.current = true
    const before = reactions
    const on = !mine
    onChange(
      on
        ? [...reactions, { id: 'pending', target_type: type, target_id: targetId, user_id: world.me.id }]
        : reactions.filter((r) => r.user_id !== world.me.id),
    )
    if (on) setBurst((n) => n + 1)
    try {
      await api.setHeart(world.space.id, type, targetId, on)
    } catch {
      onChange(before)
    } finally {
      busy.current = false
    }
  }

  const caption = mine && theirs
    ? 'Loved by you both'
    : theirs
      ? `Loved by ${nameOf(world, theirs.user_id)}`
      : mine
        ? 'Loved by you'
        : null

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={mine}
        aria-label={mine ? 'Take back your heart' : 'Send a heart'}
        className="relative flex size-11 items-center justify-center rounded-full transition hover:bg-blush/60 active:scale-90"
      >
        <motion.span
          key={mine ? 'on' : 'off'}
          initial={{ scale: mine ? 0.5 : 1 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 14 }}
          className="flex"
        >
          <Heart
            className={`size-6 ${mine ? 'fill-rose text-rose' : theirs ? 'text-rose' : 'text-ink-soft'}`}
            aria-hidden
          />
        </motion.span>
        <AnimatePresence>{burst > 0 && <Burst key={burst} />}</AnimatePresence>
      </button>
      {showCaption && caption && <span className="text-sm text-ink-soft">{caption}</span>}
    </div>
  )
}

/** Tiny hearts that pop out of a heart button. */
function Burst() {
  const still = useReducedMotion()
  const hearts = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const angle = (-90 + (i - 3) * 26) * (Math.PI / 180)
        const distance = 30 + (i % 3) * 8
        return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, delay: i * 0.02 }
      }),
    [],
  )
  if (still) return null
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      {hearts.map((h, i) => (
        <motion.span
          key={i}
          className="absolute top-1/2 left-1/2 -mt-1.5 -ml-1.5 text-xs text-rose"
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: h.x, y: h.y, opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.8, delay: h.delay, ease: 'easeOut' }}
        >
          ♥
        </motion.span>
      ))}
    </span>
  )
}

/** A gentle rain of hearts rising up the screen — for sent letters and other big moments. */
export function HeartShower({ onDone }: { onDone?: () => void }) {
  const still = useReducedMotion()
  const hearts = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: (i * 37) % 100,
        size: 14 + ((i * 7) % 14),
        delay: (i % 6) * 0.18,
        drift: ((i % 5) - 2) * 18,
        color: ['#cf8493', '#e9b9c2', '#c4a15a', '#7d6c9e'][i % 4],
      })),
    [],
  )
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), 3200)
    return () => clearTimeout(timer)
  }, [onDone])
  if (still) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden>
      {hearts.map((h, i) => (
        <motion.span
          key={i}
          className="absolute bottom-0"
          style={{ left: `${h.left}%`, fontSize: h.size, color: h.color }}
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: '-105vh', x: h.drift, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.6, delay: h.delay, ease: 'easeOut' }}
        >
          ♥
        </motion.span>
      ))}
    </div>
  )
}
