import { useState } from 'react'
import { motion } from 'motion/react'
import { LADDERS, SNAKES, rollDie, snakesMove, squareAt } from '../lib/games'
import { Button } from '../components/ui'
import { Die, GameFrame, useGame } from './useGame'

const TOKEN = { p1: 'bg-rose-deep', p2: 'bg-peacock' } as const
/** centre of square n in % of the board */
const centre = (n: number) => {
  const { row, col } = squareAt(n)
  return { x: (col + 0.5) * 10, y: (row + 0.5) * 10 }
}

export default function Snakes() {
  const g = useGame('snakes')
  const game = g.game
  const pos: { p1: number; p2: number } = game?.state.pos ?? { p1: 0, p2: 0 }
  const last = game?.state.last as { by: 'p1' | 'p2'; roll: number; landed: number; to: number; via: 'ladder' | 'snake' | null } | undefined
  const [rolling, setRolling] = useState(false)

  const roll = () => {
    if (!game || !g.myTurn || g.busy || !g.key) return
    setRolling(true)
    setTimeout(() => setRolling(false), 500)
    const value = rollDie()
    const from = pos[g.key]
    const move = snakesMove(from, value)
    const won = move.to === 100
    const other = game.p1_id === g.me ? game.p2_id : game.p1_id
    const state = { ...game.state, pos: { ...pos, [g.key]: move.to }, last: { by: g.key, roll: value, from, landed: move.landed, to: move.to, via: move.via } }
    void g.run(() => g.api.gameMove(game, state, other, won ? 'win' : 'continue'), {
      ...game,
      state,
      version: game.version + 1,
      turn_id: won ? null : other,
      status: won ? 'finished' : 'active',
      winner_id: won ? g.me : null,
    })
  }

  const who = (k: 'p1' | 'p2') => (k === g.key ? 'You' : g.partnerName)
  const lastLine = last
    ? `${who(last.by)} rolled ${last.roll}${
        last.via === 'ladder' ? ` — up a ladder to ${last.to}! 🪜` : last.via === 'snake' ? ` — a snake! Down to ${last.to} 🐍` : last.to === last.landed ? ` → ${last.to}` : ' — too far, stays put'
      }`
    : null

  return (
    <GameFrame
      kind="snakes"
      g={g}
      status={g.myTurn ? 'Your roll ♡' : `${g.partnerName}'s roll…`}
      emptyText={`Roll, climb the ladders, dodge the snakes — first to 100 wins. Race ${g.partnerName}!`}
      onNewGame={() => void g.newGame({ pos: { p1: 0, p2: 0 } })}
    >
      <div className="mx-auto max-w-lg">
        <div className="relative aspect-square overflow-hidden rounded-2xl border-4 border-[#e9d7bd] shadow-polaroid">
          <div className="grid size-full grid-cols-10 grid-rows-10">
            {Array.from({ length: 100 }, (_, i) => {
              const row = Math.floor(i / 10)
              const col = i % 10
              const fromBottom = 9 - row
              const n = fromBottom * 10 + (fromBottom % 2 === 0 ? col + 1 : 10 - col)
              return (
                <div
                  key={n}
                  className={`relative ${(row + col) % 2 ? 'bg-[#f4ead8]' : 'bg-[#fbf3e6]'} ${LADDERS[n] ? '!bg-sage/30' : ''} ${SNAKES[n] ? '!bg-blush' : ''}`}
                >
                  <span className="absolute top-0.5 left-1 text-[0.55rem] font-semibold text-ink-soft sm:text-[0.65rem]">{n}</span>
                  {n === 100 && <span className="absolute inset-0 flex items-center justify-center text-lg">🏁</span>}
                </div>
              )
            })}
          </div>
          {/* ladders and snakes */}
          <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 100 100" aria-hidden>
            {Object.entries(LADDERS).map(([a, b]) => {
              const p = centre(Number(a))
              const q = centre(b)
              const dx = q.x - p.x
              const dy = q.y - p.y
              const len = Math.hypot(dx, dy)
              const nx = (-dy / len) * 1.4
              const ny = (dx / len) * 1.4
              return (
                <g key={a} stroke="#6f8463" strokeWidth="0.7" strokeLinecap="round" opacity="0.9">
                  <line x1={p.x + nx} y1={p.y + ny} x2={q.x + nx} y2={q.y + ny} />
                  <line x1={p.x - nx} y1={p.y - ny} x2={q.x - nx} y2={q.y - ny} />
                  {Array.from({ length: Math.max(2, Math.round(len / 4)) }, (_, k) => {
                    const t = (k + 0.5) / Math.max(2, Math.round(len / 4))
                    const cx = p.x + dx * t
                    const cy = p.y + dy * t
                    return <line key={k} x1={cx + nx} y1={cy + ny} x2={cx - nx} y2={cy - ny} />
                  })}
                </g>
              )
            })}
            {Object.entries(SNAKES).map(([a, b]) => {
              const p = centre(Number(a))
              const q = centre(b)
              // an S-shaped body: two control points pushed to opposite sides
              const dx = q.x - p.x
              const dy = q.y - p.y
              const len = Math.hypot(dx, dy) || 1
              const w = Math.min(6, len * 0.22)
              const nx = (-dy / len) * w
              const ny = (dx / len) * w
              const c1 = `${p.x + dx / 3 + nx} ${p.y + dy / 3 + ny}`
              const c2 = `${p.x + (2 * dx) / 3 - nx} ${p.y + (2 * dy) / 3 - ny}`
              return (
                <g key={a}>
                  <path d={`M ${p.x} ${p.y} C ${c1} ${c2} ${q.x} ${q.y}`} stroke="#a85a6c" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.85" />
                  <circle cx={p.x} cy={p.y} r="1.6" fill="#a85a6c" />
                </g>
              )
            })}
          </svg>
          {/* the two tokens */}
          {(['p1', 'p2'] as const).map((k, i) =>
            pos[k] > 0 ? (
              <motion.span
                key={k}
                className={`absolute size-[6%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-polaroid ${TOKEN[k]}`}
                initial={false}
                animate={{ left: `${centre(pos[k]).x + (i ? 1.8 : -1.8)}%`, top: `${centre(pos[k]).y + (i ? 1.8 : -1.8)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 16 }}
                aria-label={`${who(k)} on square ${pos[k]}`}
              />
            ) : null,
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
          {(['p1', 'p2'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-sm">
              <span className={`size-4 rounded-full ${TOKEN[k]}`} /> {who(k)}: {pos[k] === 0 ? 'start' : pos[k]}
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-col items-center gap-3">
          <Die value={last?.roll ?? null} rolling={rolling} />
          {lastLine && <p className="text-center text-sm text-ink">{lastLine}</p>}
          {g.live && (
            <Button onClick={roll} disabled={!g.myTurn} busy={g.busy}>
              🎲 {g.myTurn ? 'Roll the die' : `Waiting for ${g.partnerName}`}
            </Button>
          )}
        </div>
      </div>
    </GameFrame>
  )
}
