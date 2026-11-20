import { motion } from 'motion/react'
import { C4_COLS, C4_ROWS, c4Drop, c4Winner } from '../lib/games'
import { GameFrame, useGame } from './useGame'

const DISC = { 1: 'bg-rose-deep', 2: 'bg-gold' } as const

export default function ConnectFour() {
  const g = useGame('connect4')
  const game = g.game
  const board: number[] = game?.state.board ?? Array(C4_COLS * C4_ROWS).fill(0)
  const last: number | undefined = game?.state.last
  const myDisc = g.key === 'p1' ? 1 : 2
  const win = c4Winner(board)

  const drop = (col: number) => {
    if (!game || !g.myTurn || g.busy) return
    const idx = c4Drop(board, col)
    if (idx < 0) return
    const next = [...board]
    next[idx] = myDisc
    const won = c4Winner(next).who === myDisc
    const full = next.every(Boolean)
    const outcome = won ? 'win' : full ? 'draw' : 'continue'
    const other = game.p1_id === g.me ? game.p2_id : game.p1_id
    const state = { ...game.state, board: next, last: idx }
    void g.run(
      () => g.api.gameMove(game, state, other, outcome),
      {
        ...game,
        state,
        version: game.version + 1,
        turn_id: outcome === 'continue' ? other : null,
        status: outcome === 'continue' ? 'active' : 'finished',
        winner_id: won ? g.me : null,
      },
    )
  }

  const status = g.myTurn ? `Your turn — drop a ${myDisc === 1 ? 'rose' : 'gold'} disc` : `${g.partnerName} is thinking…`

  return (
    <GameFrame
      kind="connect4"
      g={g}
      status={status}
      emptyText={`Drop discs in turn — the first to line up four wins. Play ${g.partnerName}!`}
      onNewGame={() => void g.newGame({ board: Array(C4_COLS * C4_ROWS).fill(0) })}
    >
      <div className="mx-auto max-w-md">
        <div className="mb-2 flex justify-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className={`size-4 rounded-full ${DISC[myDisc]}`} /> You
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className={`size-4 rounded-full ${DISC[myDisc === 1 ? 2 : 1]}`} /> {g.partnerName}
          </span>
        </div>
        <div
          className="relative grid gap-1.5 rounded-2xl bg-peacock p-2 shadow-polaroid sm:gap-2 sm:p-3"
          style={{ gridTemplateColumns: `repeat(${C4_COLS}, minmax(0, 1fr))` }}
          role="grid"
          aria-label="Connect four board"
        >
          {Array.from({ length: C4_COLS * C4_ROWS }, (_, i) => {
            const col = i % C4_COLS
            const row = Math.floor(i / C4_COLS)
            const who = board[i] as 0 | 1 | 2
            const winning = win.cells.includes(i)
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                onClick={() => drop(col)}
                disabled={!g.myTurn || g.busy}
                aria-label={`Column ${col + 1}, row ${row + 1}${who ? (who === myDisc ? ', your disc' : `, ${g.partnerName}'s disc`) : ''}`}
                className="relative aspect-square overflow-visible rounded-full bg-peacock-deep/60 shadow-inner disabled:cursor-default"
              >
                {who !== 0 && (
                  <motion.span
                    key={`${game?.id}-${i}-${who}`}
                    className={`absolute inset-0.5 rounded-full ${DISC[who]} shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)] ${
                      winning ? 'ring-4 ring-paper' : ''
                    }`}
                    initial={i === last ? { y: `${-(row + 1) * 115}%` } : false}
                    animate={winning ? { y: 0, scale: [1, 1.12, 1] } : { y: 0 }}
                    transition={
                      winning
                        ? { scale: { duration: 0.9, repeat: Infinity }, y: { type: 'spring', stiffness: 300, damping: 18 } }
                        : { type: 'spring', stiffness: 300, damping: 18 }
                    }
                  />
                )}
              </button>
            )
          })}
        </div>
        {g.myTurn && <p className="mt-2 text-center text-xs text-ink-soft">Tap any column to drop your disc.</p>}
      </div>
    </GameFrame>
  )
}
