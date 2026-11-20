import { useState } from 'react'
import { motion } from 'motion/react'
import { LUDO_DONE, LUDO_SAFE, LUDO_TRACK, ludoApply, ludoLegal, ludoPlace, rollDie, type LudoKey } from '../lib/games'
import { Button } from '../components/ui'
import { Die, GameFrame, useGame } from './useGame'

type Dice = { by: LudoKey; value: number; pending: boolean }
const COLOUR: Record<LudoKey, { token: string; base: string; lane: string; name: string }> = {
  p1: { token: 'bg-rose-deep', base: 'bg-rose-deep/80', lane: 'bg-rose-deep/45', name: 'rose' },
  p2: { token: 'bg-gold', base: 'bg-gold/85', lane: 'bg-gold/50', name: 'gold' },
}
const trackIndex = new Map(LUDO_TRACK.map(([r, c], i) => [r * 15 + c, i]))
const START_CELL = { p1: 0, p2: 26 }

function cellClass(r: number, c: number): string {
  if (r < 6 && c < 6) return COLOUR.p1.base
  if (r > 8 && c > 8) return COLOUR.p2.base
  if (r < 6 && c > 8) return 'bg-peacock/55'
  if (r > 8 && c < 6) return 'bg-sage/60'
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return 'bg-transparent'
  if (r === 7 && c >= 1 && c <= 5) return COLOUR.p1.lane
  if (r === 7 && c >= 9 && c <= 13) return COLOUR.p2.lane
  const t = trackIndex.get(r * 15 + c)
  if (t === START_CELL.p1) return COLOUR.p1.lane
  if (t === START_CELL.p2) return COLOUR.p2.lane
  if (t !== undefined) return 'bg-paper'
  return 'bg-parchment/70' // the two unused home lanes
}

export default function Ludo() {
  const g = useGame('ludo')
  const game = g.game
  const tokens: Record<LudoKey, number[]> = game?.state.tokens ?? { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }
  const dice = game?.state.dice as Dice | null | undefined
  const note = game?.state.note as string | undefined
  const [rolling, setRolling] = useState(false)
  const key = g.key
  const other = game ? (game.p1_id === g.me ? game.p2_id : game.p1_id) : ''
  const waitingToMove = Boolean(g.myTurn && dice?.pending && dice.by === key)
  const legal = waitingToMove && key ? ludoLegal(tokens[key], dice!.value) : []

  const commit = (state: Record<string, unknown>, nextTurn: string, outcome: 'continue' | 'win') => {
    if (!game) return
    void g.run(() => g.api.gameMove(game, state, nextTurn, outcome), {
      ...game,
      state,
      version: game.version + 1,
      turn_id: outcome === 'continue' ? nextTurn : null,
      status: outcome === 'continue' ? 'active' : 'finished',
      winner_id: outcome === 'win' ? g.me : null,
    })
  }

  const roll = () => {
    if (!game || !key || !g.myTurn || g.busy || waitingToMove) return
    setRolling(true)
    setTimeout(() => setRolling(false), 500)
    const value = rollDie()
    const moves = ludoLegal(tokens[key], value)
    if (moves.length === 0) {
      commit({ ...game.state, dice: { by: key, value, pending: false }, note: `${value} — no move, turn passes` }, other, 'continue')
    } else {
      commit({ ...game.state, dice: { by: key, value, pending: true }, note: null }, g.me, 'continue')
    }
  }

  const move = (token: number) => {
    if (!game || !key || !dice || !legal.includes(token) || g.busy) return
    const res = ludoApply(tokens, key, token, dice.value)
    const won = res.tokens[key].every((p) => p === LUDO_DONE)
    const again = !won && (dice.value === 6 || res.captured || res.finished)
    const text = won
      ? 'all four home!'
      : res.captured
        ? 'captured a token! Roll again'
        : res.finished
          ? 'a token reached home! Roll again'
          : dice.value === 6
            ? 'rolled a 6 — roll again'
            : null
    commit(
      { ...game.state, tokens: res.tokens, dice: { ...dice, pending: false }, note: text },
      again ? g.me : other,
      won ? 'win' : 'continue',
    )
  }

  const who = (k: LudoKey) => (k === key ? 'You' : g.partnerName)
  const done = (k: LudoKey) => tokens[k].filter((p) => p === LUDO_DONE).length
  let status = g.myTurn ? (waitingToMove ? 'Pick a token to move' : 'Your roll ♡') : `${g.partnerName}'s turn…`
  if (game?.status === 'active' && g.myTurn && !waitingToMove && dice?.by === key && dice.value === 6) status = 'A six — roll again!'

  // tokens sharing a square get nudged apart
  const placed: { k: LudoKey; i: number; r: number; c: number }[] = []
  ;(['p1', 'p2'] as const).forEach((k) =>
    tokens[k].forEach((p, i) => {
      const [r, c] = ludoPlace(k, p, i)
      placed.push({ k, i, r, c })
    }),
  )
  const stackCount = new Map<string, number>()

  return (
    <GameFrame
      kind="ludo"
      g={g}
      status={status}
      emptyText={`Roll a 6 to leave home, race all four tokens round the board and into the centre. Land on ${g.partnerName} to send them back!`}
      onNewGame={() => void g.newGame({ tokens: { p1: [-1, -1, -1, -1], p2: [-1, -1, -1, -1] }, dice: null })}
    >
      <div className="mx-auto max-w-lg">
        <div className="mb-3 flex flex-wrap justify-center gap-4 text-sm">
          {(['p1', 'p2'] as const).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`size-4 rounded-full border-2 border-white shadow ${COLOUR[k].token}`} /> {who(k)} · {done(k)}/4 home
            </span>
          ))}
        </div>
        <div className="relative aspect-square overflow-hidden rounded-2xl border-4 border-[#e9d7bd] bg-[#e9d7bd] shadow-polaroid">
          <div className="grid size-full grid-cols-[repeat(15,minmax(0,1fr))] grid-rows-[repeat(15,minmax(0,1fr))] gap-px">
            {Array.from({ length: 225 }, (_, i) => {
              const r = Math.floor(i / 15)
              const c = i % 15
              const t = trackIndex.get(i)
              const safe = t !== undefined && LUDO_SAFE.has(t) && t !== START_CELL.p1 && t !== START_CELL.p2
              return (
                <div key={i} className={`relative flex items-center justify-center ${cellClass(r, c)}`}>
                  {safe && <span className="text-[0.6rem] text-gold sm:text-xs" aria-hidden>★</span>}
                </div>
              )
            })}
          </div>
          {/* the bases' inner yards */}
          {[
            { top: 0, left: 0, k: 'p1' as const },
            { top: 9, left: 9, k: 'p2' as const },
          ].map(({ top, left, k }) => (
            <div
              key={k}
              className="pointer-events-none absolute rounded-xl bg-paper/90"
              style={{ top: `${((top + 0.8) / 15) * 100}%`, left: `${((left + 0.8) / 15) * 100}%`, width: `${(4.4 / 15) * 100}%`, height: `${(4.4 / 15) * 100}%` }}
            />
          ))}
          {/* the centre home */}
          <svg className="pointer-events-none absolute" style={{ top: '40%', left: '40%', width: '20%', height: '20%' }} viewBox="0 0 3 3" aria-hidden>
            <polygon points="0,0 1.5,1.5 0,3" fill="#b5536a" />
            <polygon points="3,0 1.5,1.5 3,3" fill="#d4a24a" />
            <polygon points="0,0 1.5,1.5 3,0" fill="#4f8f8b" opacity="0.7" />
            <polygon points="0,3 1.5,1.5 3,3" fill="#8fa682" opacity="0.8" />
          </svg>
          {/* tokens */}
          {placed.map(({ k, i, r, c }) => {
            const spot = `${r},${c}`
            const n = stackCount.get(spot) ?? 0
            stackCount.set(spot, n + 1)
            const progress = tokens[k][i]!
            const nudge = progress >= 0 && progress < LUDO_DONE ? n * 0.18 : 0
            const canMove = k === key && legal.includes(i)
            return (
              <motion.button
                key={`${k}${i}`}
                type="button"
                onClick={() => move(i)}
                disabled={!canMove}
                aria-label={`${who(k)} token ${i + 1}${progress < 0 ? ', at home' : progress >= LUDO_DONE ? ', finished' : ''}${canMove ? ' — tap to move' : ''}`}
                className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-white shadow-polaroid ${COLOUR[k].token} ${
                  progress >= LUDO_DONE ? 'flex size-[3.8%] items-center justify-center border-2' : 'size-[5.2%] border-2'
                } ${canMove ? 'z-20 cursor-pointer ring-4 ring-peacock/60' : 'cursor-default'}`}
                initial={false}
                animate={{
                  left: `${((c + 0.5 + nudge) / 15) * 100}%`,
                  top: `${((r + 0.5 - nudge) / 15) * 100}%`,
                  scale: canMove ? [1, 1.18, 1] : 1,
                }}
                transition={{
                  left: { type: 'spring', stiffness: 140, damping: 18 },
                  top: { type: 'spring', stiffness: 140, damping: 18 },
                  scale: canMove ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 },
                }}
              >
                {progress >= LUDO_DONE && (
                  <svg viewBox="0 0 10 10" className="size-[70%]" aria-hidden>
                    <path d="M2 5.3 L4.2 7.4 L8 2.8" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </motion.button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <Die value={dice?.value ?? null} rolling={rolling} />
          {dice && (note || !dice.pending) && (
            <p className="text-center text-sm text-ink">
              {who(dice.by)} rolled {dice.value}
              {note ? ` — ${note}` : ''}
            </p>
          )}
          {g.live &&
            (waitingToMove ? (
              <p className="text-sm font-semibold text-peacock-deep">Tap a glowing token ♡</p>
            ) : (
              <Button onClick={roll} disabled={!g.myTurn} busy={g.busy}>
                🎲 {g.myTurn ? 'Roll the die' : `Waiting for ${g.partnerName}`}
              </Button>
            ))}
        </div>
      </div>
    </GameFrame>
  )
}
