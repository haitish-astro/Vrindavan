/**
 * The two big letter moments:
 *  - LetterOpening: full screen. The envelope floats in, glowing. She taps the seal,
 *    it bursts into petals and hearts, the flap lifts and the letter rises out.
 *  - SealAndSend: the letter slips into its envelope, the seal is pressed, and it
 *    flies away to the other person.
 * Both sit above everything else (z-60), lock page scroll, and are skipped for
 * people who prefer reduced motion.
 */
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Envelope } from './Envelope'
import { Petals, Sparkles } from './Decor'

function useScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])
}

/** Petals and hearts bursting outward from the seal. */
function SealBurst() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.2
        const distance = 90 + ((i * 37) % 90)
        return {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - 30,
          rotate: (i * 47) % 360,
          glyph: i % 3 === 0 ? '♥' : '',
          color: ['#cf8493', '#f1c9cf', '#c4a15a', '#ded6ec', '#e9b9c2'][i % 5],
          size: 10 + (i % 4) * 4,
        }
      }),
    [],
  )
  return (
    <div className="pointer-events-none absolute top-[56%] left-1/2 z-20" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ color: p.color, fontSize: p.size }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.3, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1, rotate: p.rotate }}
          transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {p.glyph || (
            <svg viewBox="0 0 20 24" width={p.size} height={p.size * 1.2}>
              <path d="M10 1 C17 7 18 16 10 23 C2 16 3 7 10 1 Z" fill={p.color} />
            </svg>
          )}
        </motion.span>
      ))}
    </div>
  )
}

export function LetterOpening({ from, title, onDone }: { from: string; title: string | null; onDone: () => void }) {
  useScrollLock()
  const [stage, setStage] = useState<'arrive' | 'waiting' | 'burst' | 'open' | 'rise' | 'leave'>('arrive')

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms))
    if (stage === 'arrive') at(1100, () => setStage('waiting'))
    if (stage === 'burst') at(550, () => setStage('open'))
    if (stage === 'open') at(800, () => setStage('rise'))
    if (stage === 'rise') at(1300, () => setStage('leave'))
    if (stage === 'leave') at(500, onDone)
    return () => timers.forEach(clearTimeout)
  }, [stage, onDone])

  const open = () => {
    if (stage === 'arrive' || stage === 'waiting') setStage('burst')
  }
  const sealed = stage === 'arrive' || stage === 'waiting'

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-ivory/95 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: stage === 'leave' ? 0 : 1 }}
      transition={{ duration: 0.5 }}
      role="dialog"
      aria-modal="true"
      aria-label={`A letter from ${from}`}
    >
      <Sparkles count={18} />
      <Petals count={10} />

      <motion.p
        className="eyebrow relative z-10 mb-2 text-rose-deep"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: stage === 'rise' || stage === 'leave' ? 0 : 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        A letter from {from}
      </motion.p>
      {title && (
        <motion.p
          className="hand relative z-10 mb-8 max-w-sm text-center text-[1.9rem] leading-tight text-peacock-deep"
          initial={{ opacity: 0 }}
          animate={{ opacity: stage === 'rise' || stage === 'leave' ? 0 : 1 }}
          transition={{ delay: 0.5 }}
        >
          “{title}”
        </motion.p>
      )}

      <motion.div
        className="relative z-10 w-full max-w-[22rem]"
        initial={{ y: 160, opacity: 0, rotate: -6, scale: 0.9 }}
        animate={{
          y: stage === 'rise' || stage === 'leave' ? 60 : 0,
          opacity: 1,
          rotate: sealed ? [0, -1.5, 1.5, 0] : 0,
          scale: 1,
        }}
        transition={{
          y: { duration: 1, ease: [0.22, 1, 0.36, 1] },
          opacity: { duration: 0.6 },
          rotate: sealed ? { duration: 3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 },
          scale: { duration: 1 },
        }}
      >
        {/* the glow behind the envelope */}
        <div className="glow-pulse absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(246_220_220/0.95),rgb(236_220_182/0.5),transparent)]" />
        <button
          type="button"
          onClick={open}
          className="block w-full cursor-pointer"
          aria-label="Break the seal and open the letter"
          disabled={!sealed}
        >
          <Envelope sealed={sealed} open={stage === 'open' || stage === 'rise' || stage === 'leave'} rise={stage === 'rise' || stage === 'leave' ? 62 : 0} />
        </button>
        <AnimatePresence>{stage === 'burst' && <SealBurst />}</AnimatePresence>
      </motion.div>

      <motion.p
        className="relative z-10 mt-10 text-sm font-semibold text-peacock-deep"
        animate={{ opacity: stage === 'waiting' ? [0.45, 1, 0.45] : 0 }}
        transition={{ duration: 2, repeat: stage === 'waiting' ? Infinity : 0 }}
      >
        Tap the seal to open ♡
      </motion.p>
      <button
        type="button"
        onClick={onDone}
        className="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 rounded-full px-3 py-2 text-xs font-semibold text-ink-soft hover:text-peacock-deep"
      >
        Skip
      </button>
    </motion.div>
  )
}

export function SealAndSend({ to, onDone }: { to: string; onDone: () => void }) {
  useScrollLock()
  const still = useReducedMotion()
  const [stage, setStage] = useState(0)

  useEffect(() => {
    if (still) {
      const t = setTimeout(onDone, 300)
      return () => clearTimeout(t)
    }
    const timers = [
      setTimeout(() => setStage(1), 650), // letter slips in
      setTimeout(() => setStage(2), 1450), // flap closes
      setTimeout(() => setStage(3), 2150), // seal pressed
      setTimeout(() => setStage(4), 2900), // away it flies
      setTimeout(onDone, 3800),
    ]
    return () => timers.forEach(clearTimeout)
  }, [still, onDone])

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center overflow-hidden bg-ivory/95 px-6 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="status"
      aria-live="polite"
    >
      <Sparkles count={14} />
      <motion.div
        className="relative w-full max-w-[20rem]"
        animate={
          stage >= 4
            ? { y: '-75vh', x: 80, rotate: 14, scale: 0.45, opacity: 0 }
            : { y: 0, x: 0, rotate: 0, scale: 1, opacity: 1 }
        }
        transition={{ duration: 0.95, ease: [0.55, 0, 0.75, 0.3] }}
      >
        <div className="glow-pulse absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(246_220_220/0.9),transparent)]" />
        <Envelope sealed={stage >= 3} open={stage < 2} rise={stage < 1 ? 62 : 0} />
      </motion.div>
      <motion.p
        className="hand mt-12 text-center text-[1.8rem] text-rose-deep"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {stage >= 4 ? `On its way to ${to} ♡` : stage >= 3 ? 'Sealed with love' : 'Folding your letter…'}
      </motion.p>
    </motion.div>
  )
}
