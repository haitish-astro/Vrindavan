import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Shuffle } from 'lucide-react'
import { FLEET, SHIP_NAMES, randomFleet } from '../lib/games'
import { Button } from '../components/ui'
import { GameFrame, useGame } from './useGame'

type Shot = { c: number; h: boolean }
const COLS = 'ABCDEFGHIJ'

export default function SeaBattle() {
  const g = useGame('sea_battle')
  const game = g.game
  const ready: Record<string, boolean> = game?.state.ready ?? {}
  const shots: Record<string, Shot[]> = game?.state.shots ?? {}
  const sunk: Record<string, number[][]> = game?.state.sunk ?? {}
  const last = game?.state.last as { by: 'p1' | 'p2'; c: number; h: boolean; sunk: boolean } | undefined
  const iAmReady = Boolean(g.key && ready[g.key])

  const [draft, setDraft] = useState<number[][]>(() => randomFleet())
  const [fleet, setFleet] = useState<number[][] | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  // my own hidden fleet, read back from my private secret
  useEffect(() => {
    setFleet(null)
    if (!game || !iAmReady) return
    let gone = false
    g.api
      .mySecret(game.id)
      .then((s) => !gone && setFleet((s?.ships as number[][]) ?? null))
      .catch(() => {})
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, iAmReady])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2200)
    return () => clearTimeout(t)
  }, [flash])

  const myShots = g.key ? shots[g.key] ?? [] : []
  const theirShots = shots[g.otherKey] ?? []
  const mySunk = g.key ? sunk[g.key] ?? [] : [] // their ships I have sunk
  const theirSunk = sunk[g.otherKey] ?? [] // my ships they sunk

  const fire = (cell: number) => {
    if (!game || !g.myTurn || g.busy || myShots.some((s) => s.c === cell)) return
    void g.run(async () => {
      const r = await g.api.seaFire(game.id, game.version, cell)
      setFlash(r.won ? 'You sank the whole fleet! ♡' : r.sunk ? 'Hit — and sunk! 💥' : r.hit ? 'Hit! 🔥' : 'Splash — a miss 🌊')
      await g.reload()
    })
  }

  const place = () => {
    if (!game) return
    void g.run(async () => {
      await g.api.seaPlace(game.id, draft)
      await g.reload()
    })
  }

  let status: string
  if (game?.status === 'setup') status = iAmReady ? `Waiting for ${g.partnerName} to hide their fleet…` : 'Hide your fleet'
  else status = g.myTurn ? 'Your shot — pick a square in their sea' : `${g.partnerName} is aiming…`

  const lastLine =
    last && game?.status !== 'setup'
      ? `${last.by === g.key ? 'You' : g.partnerName} fired at ${label(last.c)} — ${last.sunk ? 'sunk a ship!' : last.h ? 'hit!' : 'miss.'}`
      : null

  return (
    <GameFrame
      kind="sea_battle"
      g={g}
      status={status}
      emptyText={`Hide five ships, then take turns firing. Sink all of ${g.partnerName}'s fleet first to win.`}
      onNewGame={() => {
        setDraft(randomFleet())
        void g.newGame({ ready: { p1: false, p2: false } })
      }}
    >
      {game?.status === 'setup' && !iAmReady && (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <Sea ships={draft} label="Your fleet" />
          <p className="text-center text-sm text-ink-soft">
            {FLEET.map((n) => SHIP_NAMES[n]).join(', ')} — shuffle until you like it. {g.partnerName} never sees where they are.
          </p>
          <div className="flex gap-2">
            <Button variant="soft" onClick={() => setDraft(randomFleet())} disabled={g.busy}>
              <Shuffle className="size-4" aria-hidden /> Shuffle
            </Button>
            <Button onClick={place} busy={g.busy}>
              Ready ⚓
            </Button>
          </div>
        </div>
      )}

      {game?.status === 'setup' && iAmReady && (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          {fleet && <Sea ships={fleet} label="Your fleet" />}
          <p className="text-center text-sm text-ink-soft">Your fleet is hidden. The battle starts as soon as {g.partnerName} is ready.</p>
        </div>
      )}

      {game && game.status !== 'setup' && (
        <>
          <div className="mb-3 min-h-6 text-center text-sm">
            {flash ? (
              <motion.span key={flash} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-semibold text-rose-deep">
                {flash}
              </motion.span>
            ) : (
              lastLine && <span className="text-ink-soft">{lastLine}</span>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Sea
              label={`${g.partnerName}'s sea`}
              shots={myShots}
              sunkShips={mySunk}
              onFire={g.myTurn && !g.busy ? fire : undefined}
              highlight={last && last.by === g.key ? last.c : undefined}
              note={`${mySunk.length} of 5 ships sunk`}
            />
            <Sea
              label="Your sea"
              ships={fleet ?? []}
              shots={theirShots}
              sunkShips={theirSunk}
              highlight={last && last.by !== g.key ? last.c : undefined}
              note={`${theirSunk.length} of 5 lost`}
              small
            />
          </div>
        </>
      )}
    </GameFrame>
  )
}

function label(c: number) {
  return `${COLS[c % 10]}${Math.floor(c / 10) + 1}`
}

function Sea({
  label: title,
  ships = [],
  shots = [],
  sunkShips = [],
  onFire,
  highlight,
  note,
  small,
}: {
  label: string
  ships?: number[][]
  shots?: Shot[]
  sunkShips?: number[][]
  onFire?: (cell: number) => void
  highlight?: number
  note?: string
  small?: boolean
}) {
  const shipCells = new Set(ships.flat())
  const sunkCells = new Set(sunkShips.flat())
  const shotAt = new Map(shots.map((s) => [s.c, s.h]))
  // draw every ship we know about once: our own fleet, plus any of theirs we have sunk
  const drawn = [...ships, ...sunkShips.filter((s) => !s.every((c) => shipCells.has(c)))]
  return (
    <section className={`mx-auto w-full ${small ? 'max-w-xs md:max-w-sm' : 'max-w-sm'}`}>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-display text-lg text-peacock-deep">{title}</h2>
        {note && <span className="text-xs text-ink-soft">{note}</span>}
      </div>
      <div className="relative rounded-xl bg-peacock-deep/80 p-1 shadow-polaroid">
      {/* the ships, drawn underneath the clickable squares */}
      <div className="pointer-events-none absolute inset-1 grid grid-cols-10 grid-rows-10 gap-[2px]" aria-hidden>
        {drawn.map((ship) => (
          <ShipShape key={ship.join('-')} cells={ship} sunk={ship.every((c) => sunkCells.has(c))} />
        ))}
      </div>
      <div className="relative grid grid-cols-10 gap-[2px]" role="grid" aria-label={title}>
        {Array.from({ length: 100 }, (_, c) => {
          const shot = shotAt.get(c)
          const isShip = shipCells.has(c)
          const isSunk = sunkCells.has(c)
          const canFire = onFire && shot === undefined
          return (
            <button
              key={c}
              type="button"
              role="gridcell"
              disabled={!canFire}
              onClick={() => canFire && onFire(c)}
              aria-label={`${label(c)}${isShip ? ', ship' : ''}${shot === undefined ? '' : shot ? (isSunk ? ', sunk' : ', hit') : ', miss'}`}
              className={`relative flex aspect-square items-center justify-center rounded-[3px] text-[0.7rem] transition ${
                isShip || isSunk ? 'bg-transparent' : 'bg-[#cfe6ea]'
              } ${canFire ? 'cursor-crosshair hover:bg-gold/60' : 'cursor-default'} ${highlight === c ? 'ring-2 ring-gold ring-offset-1 ring-offset-peacock-deep' : ''}`}
            >
              {shot === true && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-[0.75rem] leading-none" aria-hidden>
                  {isSunk ? '✖' : '🔥'}
                </motion.span>
              )}
              {shot === false && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="size-1.5 rounded-full bg-peacock-deep/60" aria-hidden />}
            </button>
          )
        })}
      </div>
      </div>
    </section>
  )
}

/** A little ship spanning its squares: pointed bow, rounded stern, a cabin and portholes. */
function ShipShape({ cells, sunk }: { cells: number[]; sunk: boolean }) {
  const sorted = [...cells].sort((a, b) => a - b)
  const first = sorted[0]!
  const len = sorted.length
  const across = len > 1 && sorted[1]! - first === 1
  const row = Math.floor(first / 10)
  const col = first % 10
  const L = len * 10
  const hull = sunk ? '#b5536a' : '#5f7480'
  const deck = sunk ? '#d98c9c' : '#8fa3ad'
  const ship = (
    <>
      {/* hull: rounded stern on the left, pointed bow on the right */}
      <path d={`M 2 1.3 L ${L - 5.5} 1.3 Q ${L - 0.4} 5 ${L - 5.5} 8.7 L 2 8.7 Q 0.6 5 2 1.3 Z`} fill={hull} />
      {/* deck */}
      <path d={`M 3 2.6 L ${L - 6} 2.6 Q ${L - 2.4} 5 ${L - 6} 7.4 L 3 7.4 Q 2.2 5 3 2.6 Z`} fill={deck} />
      {/* the bridge with little windows */}
      <rect x={L * 0.38 - 3} y="3.3" width="6" height="3.4" rx="1" fill={sunk ? '#f3d4da' : '#eef2f3'} />
      <circle cx={L * 0.38 - 1.3} cy="5" r="0.55" fill={hull} />
      <circle cx={L * 0.38 + 1.3} cy="5" r="0.55" fill={hull} />
      {/* turrets / hatches along the deck */}
      {Array.from({ length: Math.max(0, len - 2) }, (_, i) => (
        <circle key={i} cx={L * 0.38 + 7 + i * 8} cy="5" r="1.2" fill={hull} opacity="0.75" />
      ))}
    </>
  )
  return (
    <div
      className="rounded-[3px] bg-[#cfe6ea]"
      style={{
        gridRow: across ? `${row + 1}` : `${row + 1} / span ${len}`,
        gridColumn: across ? `${col + 1} / span ${len}` : `${col + 1}`,
      }}
    >
      <svg className="size-full" viewBox={across ? `0 0 ${L} 10` : `0 0 10 ${L}`} preserveAspectRatio="none">
        {across ? ship : <g transform="translate(10 0) rotate(90)">{ship}</g>}
      </svg>
    </div>
  )
}
