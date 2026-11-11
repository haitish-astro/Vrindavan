/** Hand-drawn-style decorations: morpankh, lotus, floating petals, golden dust. */
import { useMemo, type CSSProperties } from 'react'

/** A peacock feather (morpankh). Purely decorative unless given a title. */
export function Feather({ className = '', title }: { className?: string; title?: string }) {
  const barbs = useMemo(() => {
    const lines: { d: string; tone: number }[] = []
    const count = 40
    for (let i = 0; i <= count; i++) {
      const t = i / count
      const y = 262 - t * 214 // from low on the shaft up to the crown
      // widest around the eye, wispy towards the quill
      const reach = 9 + 45 * Math.sin(Math.PI * Math.pow(t, 1.45))
      const lift = 16 + reach * 0.7
      for (const side of [-1, 1]) {
        const x = 60 + side * reach
        lines.push({
          d: `M60 ${y.toFixed(1)} Q ${(60 + side * reach * 0.62).toFixed(1)} ${(y - 3).toFixed(1)} ${x.toFixed(1)} ${(y - lift).toFixed(1)}`,
          tone: i % 3,
        })
      }
    }
    return lines
  }, [])
  const tones = ['#6f8463', '#2a8a96', '#a9b89a']

  return (
    <svg
      viewBox="0 0 120 300"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      <g strokeLinecap="round">
        {barbs.map((barb, i) => (
          <path key={i} d={barb.d} stroke={tones[barb.tone]} strokeWidth="0.8" opacity="0.55" />
        ))}
        <path d="M60 298 C57 240 58 170 60 92" stroke="#b79a5e" strokeWidth="1.6" />
      </g>
      {/* the eye */}
      <ellipse cx="60" cy="84" rx="31" ry="41" fill="#a9b89a" opacity="0.55" />
      <ellipse cx="60" cy="85" rx="25" ry="33" fill="#c4a15a" opacity="0.9" />
      <ellipse cx="60" cy="87" rx="19" ry="25" fill="#2a8a96" />
      <path d="M60 72 C72 74 76 92 60 108 C44 92 48 74 60 72 Z" fill="#1b3f6b" />
      <ellipse cx="60" cy="88" rx="5.5" ry="7" fill="#12284a" opacity="0.7" />
    </svg>
  )
}

/** A small lotus, used as a divider and on empty pages. */
export function Lotus({ className = '' }: { className?: string }) {
  const petal = 'M60 10 C71 26 71 44 60 58 C49 44 49 26 60 10 Z'
  return (
    <svg viewBox="0 0 120 72" className={className} aria-hidden fill="none">
      <path d="M22 60 C40 66 80 66 98 60" stroke="#a9b89a" strokeWidth="1.5" strokeLinecap="round" />
      {[-56, -30, 30, 56].map((angle) => (
        <path
          key={angle}
          d={petal}
          transform={`rotate(${angle} 60 58)`}
          fill={Math.abs(angle) > 40 ? '#f6dcdc' : '#f1c9cf'}
          stroke="#cf8493"
          strokeWidth="0.9"
          opacity="0.95"
        />
      ))}
      <path d={petal} fill="#f8e4e2" stroke="#cf8493" strokeWidth="0.9" />
      <circle cx="60" cy="52" r="2.2" fill="#c4a15a" />
    </svg>
  )
}

/** A thin golden rule with a lotus in the middle. */
export function LotusDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 ${className}`} aria-hidden>
      <span className="h-px w-14 bg-gradient-to-r from-transparent to-gold/60" />
      <Lotus className="h-6 w-10" />
      <span className="h-px w-14 bg-gradient-to-l from-transparent to-gold/60" />
    </div>
  )
}

// Deterministic "random" so petals look scattered but never jump between renders.
function scatter(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

const PETAL_COLORS = ['#f1c9cf', '#f6dcdc', '#ded6ec', '#ecdcb6', '#e9b9c2']

/** Flower petals drifting down the screen. Hidden for people who prefer reduced motion. */
export function Petals({ count = 14 }: { count?: number }) {
  const petals = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: scatter(i + 1) * 100,
        size: 10 + scatter(i + 11) * 12,
        duration: 13 + scatter(i + 21) * 12,
        delay: -scatter(i + 31) * 22,
        sway: (scatter(i + 41) - 0.5) * 22,
        opacity: 0.45 + scatter(i + 51) * 0.4,
        color: PETAL_COLORS[i % PETAL_COLORS.length],
      })),
    [count],
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {petals.map((p, i) => (
        <svg
          key={i}
          className="petal"
          viewBox="0 0 20 24"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 1.2,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              '--petal-sway': `${p.sway}vw`,
              '--petal-opacity': p.opacity,
            } as CSSProperties
          }
        >
          <path d="M10 1 C17 7 18 16 10 23 C2 16 3 7 10 1 Z" fill={p.color} />
        </svg>
      ))}
    </div>
  )
}

/** Faint golden dust. */
export function Sparkles({ count = 16 }: { count?: number }) {
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: scatter(i + 101) * 100,
        top: scatter(i + 111) * 100,
        size: 2 + scatter(i + 121) * 3,
        duration: 3 + scatter(i + 131) * 4,
        delay: -scatter(i + 141) * 6,
      })),
    [count],
  )
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      {dots.map((d, i) => (
        <span
          key={i}
          className="sparkle"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            width: d.size,
            height: d.size,
            animationDuration: `${d.duration}s`,
            animationDelay: `${d.delay}s`,
          }}
        />
      ))}
    </div>
  )
}
