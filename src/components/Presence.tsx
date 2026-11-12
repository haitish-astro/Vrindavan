import { motion } from 'motion/react'
import { presenceLabel } from '../lib/live'

/** "♡ Name is here with you" — a soft live pill. */
export function PresencePill({
  name,
  here,
  status,
  className = '',
}: {
  name: string
  here: boolean
  status: 'connecting' | 'live' | 'offline'
  className?: string
}) {
  const { text, tone } = presenceLabel(name, here, status)
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        tone === 'live' ? 'bg-sage/25 text-sage-deep' : 'bg-parchment text-ink-soft'
      } ${className}`}
    >
      <span className="relative flex size-2">
        {tone === 'live' && (
          <motion.span
            className="absolute inset-0 rounded-full bg-sage-deep"
            animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}
        <span className={`relative size-2 rounded-full ${tone === 'live' ? 'bg-sage-deep' : 'bg-ink-soft/40'}`} />
      </span>
      {text}
    </span>
  )
}
