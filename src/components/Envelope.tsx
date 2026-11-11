import { useEffect, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'

const FRONT = 'polygon(0 0, 50% 54%, 100% 0, 100% 100%, 0 100%)'
const FLAP = 'polygon(0 0, 100% 0, 50% 100%)'
const PAPER_LINES = 'repeating-linear-gradient(transparent 0 13px, rgb(196 161 90 / 0.2) 13px 14px)'

/**
 * A paper envelope, seen from the back.
 *  - sealed: the wax heart seal is on
 *  - open:   the flap folds back
 *  - rise:   how far (in % of its height) the letter slides out
 */
export function Envelope({
  sealed = true,
  open = false,
  rise = 0,
  note,
  className = '',
}: {
  sealed?: boolean
  open?: boolean
  rise?: number
  note?: ReactNode
  className?: string
}) {
  // While the flap swings open it sits in front; once open it tucks behind the letter.
  const [flapBehind, setFlapBehind] = useState(open)
  useEffect(() => {
    if (!open) setFlapBehind(false)
  }, [open])

  return (
    <div className={`relative aspect-[3/2] w-full [perspective:900px] ${className}`} aria-hidden>
      <div className="absolute inset-0 rounded-md bg-[#e6d2b5] shadow-polaroid" />

      <motion.div
        className="absolute inset-x-[7%] top-[5%] h-[88%] rounded-sm bg-paper shadow-sm"
        style={{ zIndex: 2, backgroundImage: PAPER_LINES }}
        initial={false}
        animate={{ y: `${-rise}%` }}
        transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
      />

      <div className="absolute inset-0 rounded-md bg-[#f6ebdb]" style={{ clipPath: FRONT, zIndex: 3 }} />
      <svg
        className="absolute inset-0 size-full"
        style={{ zIndex: 3 }}
        viewBox="0 0 300 200"
        preserveAspectRatio="none"
      >
        <path d="M2 198 L150 110 L298 198" stroke="#c4a15a" strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
      </svg>
      {note && <div className="absolute inset-x-0 bottom-[8%] text-center" style={{ zIndex: 4 }}>{note}</div>}

      <motion.div
        className="absolute inset-x-0 top-0 h-[56%] rounded-t-md bg-[#eedfc8]"
        style={{ clipPath: FLAP, transformOrigin: 'top', zIndex: flapBehind ? 1 : 5 }}
        initial={false}
        animate={{ rotateX: open ? 180 : 0 }}
        transition={{ duration: 0.8, ease: 'easeInOut' }}
        onAnimationComplete={() => setFlapBehind(open)}
      />

      <motion.svg
        viewBox="0 0 40 40"
        className="absolute top-[56%] left-1/2 w-[17%] max-w-16 -translate-x-1/2 -translate-y-1/2 drop-shadow"
        style={{ zIndex: 6 }}
        initial={false}
        animate={{ opacity: sealed ? 1 : 0, scale: sealed ? 1 : 1.5 }}
        transition={{ duration: 0.45 }}
      >
        <circle cx="20" cy="20" r="18" fill="#a85a6c" />
        <circle cx="20" cy="20" r="14" fill="none" stroke="#f6dcdc" strokeOpacity="0.45" strokeWidth="1" />
        <path
          d="M20 28 C11 22 11 14 16 13 C18 12.6 19.4 13.8 20 15.2 C20.6 13.8 22 12.6 24 13 C29 14 29 22 20 28 Z"
          fill="#f6dcdc"
        />
      </motion.svg>
    </div>
  )
}

/** The full opening: the seal breaks, the flap lifts, the letter rises. Tap to skip. */
export function EnvelopeOpening({ from, onDone }: { from: string; onDone: () => void }) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 500),
      setTimeout(() => setStage(2), 950),
      setTimeout(() => setStage(3), 1750),
      setTimeout(onDone, 2900),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <button
      type="button"
      onClick={onDone}
      className="mx-auto block w-full max-w-sm px-4 pt-28 pb-10"
      aria-label={`Open the letter from ${from}`}
    >
      <Envelope
        sealed={stage < 1}
        open={stage >= 2}
        rise={stage >= 3 ? 60 : 0}
        note={<span className="hand text-rose-deep">from {from}</span>}
      />
      <p className="mt-8 text-sm text-ink-soft">Tap to open</p>
    </button>
  )
}
