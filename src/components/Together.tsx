/** Little signs that your love is here: their avatar, where they are, "join them". */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { nameOf, useWorld } from '../app/AppContext'
import { placeOf, useTogether } from '../app/TogetherContext'
import { timeAgo } from '../lib/dates'

export function usePartnerName() {
  const world = useWorld()
  const partner = world.members.find((m) => m.id !== world.me.id)
  return { partner, name: partner ? nameOf(world, partner.id) : 'Your love' }
}

/** One line about where they are, e.g. "Priya is reading letters ✉️". */
export function useTogetherLine() {
  const t = useTogether()
  const { partner, name } = usePartnerName()
  if (!partner) return null
  if (t.partnerOnline && t.partnerPath) {
    const place = placeOf(t.partnerPath)
    if (t.sameRoom) return { online: true, text: `You're both here ♡`, emoji: '💞', path: null as string | null }
    return {
      online: true,
      text: `${name} is ${t.partnerActive ? '' : 'around — last '}${place.doing}`,
      emoji: place.emoji,
      path: place.path,
    }
  }
  return {
    online: false,
    text: t.partnerLastSeen ? `${name} was here ${timeAgo(t.partnerLastSeen)}` : `${name} isn't here right now`,
    emoji: '🌙',
    path: null as string | null,
  }
}

/** A round avatar with their initial — glowing when they are here. */
export function PartnerAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const t = useTogether()
  const { partner, name } = usePartnerName()
  const line = useTogetherLine()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!partner || !line) return null
  const initial = name === 'Your love' ? '♡' : name.trim().charAt(0).toUpperCase()
  const dim = size === 'sm' ? 'size-9 text-sm' : 'size-10 text-base'

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={line.text}
        className={`relative flex ${dim} items-center justify-center rounded-full font-serif font-semibold text-white shadow-soft transition active:scale-95 ${
          t.partnerOnline ? 'bg-gradient-to-br from-rose to-rose-deep' : 'bg-ink-soft/40'
        }`}
      >
        {/* the glow when they're here */}
        {t.partnerOnline && (
          <motion.span
            className="absolute -inset-1 rounded-full border-2 border-sage-deep"
            animate={{ scale: [1, 1.18, 1], opacity: [0.9, 0.3, 0.9] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            aria-hidden
          />
        )}
        <span className="relative">{initial}</span>
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-paper ${
            t.partnerOnline ? (t.partnerActive ? 'bg-sage-deep' : 'bg-gold') : 'bg-ink-soft/50'
          }`}
          aria-hidden
        />
        {/* a sparkle when they arrive */}
        <AnimatePresence>
          {t.justArrived && (
            <motion.span className="pointer-events-none absolute inset-0" exit={{ opacity: 0 }} aria-hidden>
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2
                return (
                  <motion.span
                    key={i}
                    className="absolute top-1/2 left-1/2 text-[0.7rem] text-gold"
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
                    animate={{ x: Math.cos(a) * 26, y: Math.sin(a) * 26, opacity: 0, scale: 1 }}
                    transition={{ duration: 1.2, repeat: 2, repeatDelay: 0.4 }}
                  >
                    ✦
                  </motion.span>
                )
              })}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {(open || t.justArrived) && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            className="absolute top-full right-0 z-50 mt-2 w-60 rounded-2xl border border-gold/30 bg-paper p-3 text-left shadow-polaroid"
            role="status"
          >
            <p className="text-sm font-semibold text-ink">
              {t.justArrived && !open ? `${name} just arrived ✨` : `${line.emoji} ${line.text}`}
            </p>
            {line.path && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  navigate(line.path!)
                }}
                className="mt-2 rounded-full bg-peacock px-3 py-1.5 text-xs font-semibold text-white"
              >
                Join {name === 'Your love' ? 'them' : name} ♡
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** A soft card for Home: where they are right now (or when they were last here). */
export function TogetherCard() {
  const t = useTogether()
  const line = useTogetherLine()
  const { name } = usePartnerName()
  const navigate = useNavigate()
  if (!line) return null
  return (
    <motion.div
      layout
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
        line.online ? 'border border-sage/50 bg-gradient-to-r from-sage/20 via-paper to-blush/40' : 'paper'
      }`}
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-paper text-xl shadow-soft">
        {line.emoji}
        {line.online && (
          <motion.span
            className="absolute -inset-1 rounded-full border-2 border-sage-deep/60"
            animate={{ scale: [1, 1.15, 1], opacity: [0.8, 0.2, 0.8] }}
            transition={{ duration: 2.2, repeat: Infinity }}
            aria-hidden
          />
        )}
      </span>
      <p className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold text-ink">{t.justArrived ? `${name} just arrived ✨` : line.online ? 'Here with you now' : 'Away for now'}</span>
        <span className="block truncate text-ink-soft">{line.text}</span>
      </p>
      {line.path && (
        <button
          type="button"
          onClick={() => navigate(line.path!)}
          className="shrink-0 rounded-full bg-peacock px-3 py-2 text-xs font-semibold text-white shadow-soft transition active:scale-95"
        >
          Join ♡
        </button>
      )}
    </motion.div>
  )
}
