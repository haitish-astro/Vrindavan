import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { Chess as ChessRules, type Move, type Square } from 'chess.js'
import { ArrowLeft, Flag, Handshake, RotateCcw } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useLiveRoom } from '../lib/live'
import type { ChessGame } from '../lib/types'
import { HeartShower } from '../components/Hearts'
import { PresencePill } from '../components/Presence'
import { Button, ConfirmDialog, EmptyState, ErrorNote, Modal, Page, Spinner } from '../components/ui'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const PIECE_NAME: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }
const PIECE_FONT = '"Segoe UI Symbol", "Apple Symbols", "Noto Sans Symbols 2", "DejaVu Sans", serif'
const SQUARE_RE = /^[a-h][1-8]$/

function Piece({ type, color }: { type: string; color: 'w' | 'b' }) {
  return (
    <span
      className="pointer-events-none flex size-full items-center justify-center text-[min(9vw,2.85rem)] leading-none select-none"
      style={{
        fontFamily: PIECE_FONT,
        color: color === 'w' ? '#fffdf8' : '#2c2a35',
        WebkitTextStroke: color === 'w' ? '2px #2c2a35' : '0.6px #2c2a35',
        // outline drawn behind the fill, so white pieces stay white even when small
        paintOrder: 'stroke fill',
        textShadow: color === 'w' ? '0 2px 3px rgb(0 0 0 / 0.25)' : '0 2px 3px rgb(0 0 0 / 0.2)',
      }}
      aria-hidden
    >
      {GLYPH[type]}
      {'︎'}
    </span>
  )
}

/** Chess for two, live: every move appears on the other screen, and you can see which piece they are considering. */
export default function Chess() {
  const { api } = useApp()
  const world = useWorld()
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)
  const partnerName = partner ? nameOf(world, partner.id) : 'Your love'

  const [game, setGame] = useState<ChessGame | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [theirSelected, setTheirSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const [busy, setBusy] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const gameRef = useRef<ChessGame | null>(null)
  gameRef.current = game

  const { send, partnerHere, status: liveStatus } = useLiveRoom('chess', (event, payload) => {
    if (event === 'select') {
      const sq = payload.square
      setTheirSelected(typeof sq === 'string' && SQUARE_RE.test(sq) ? (sq as Square) : null)
    }
  })

  const accept = useCallback((incoming: ChessGame) => {
    const current = gameRef.current
    // Only move forward: ignore anything older than what we already show.
    if (current && incoming.id === current.id && incoming.moves.length < current.moves.length) return
    if (current && incoming.id !== current.id && incoming.created_at < current.created_at) return
    const finishedNow = incoming.status !== 'active' && (!current || current.id !== incoming.id || current.status === 'active')
    if (current && incoming.id === current.id && finishedNow && incoming.status !== 'abandoned') setCelebrate(true)
    if (!current || incoming.moves.length !== current.moves.length || incoming.id !== current.id) setTheirSelected(null)
    setGame(incoming)
  }, [])

  const reload = useCallback(async () => {
    try {
      const latest = await api.latestChessGame(world.space.id)
      setGame(latest)
      setError(null)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [api, world.space.id])

  useEffect(() => {
    void reload()
    const unsubscribe = api.subscribeChess(world.space.id, accept)
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, world.space.id, accept, reload])

  const rules = useMemo(() => {
    try {
      return game ? new ChessRules(game.fen) : null
    } catch {
      return null
    }
  }, [game])

  const myColor: 'w' | 'b' | null = game ? (game.white_id === me ? 'w' : game.black_id === me ? 'b' : null) : null
  const active = game?.status === 'active'
  const myTurn = Boolean(active && rules && myColor && rules.turn() === myColor)
  const flipped = myColor === 'b'
  const targets: Move[] = useMemo(
    () => (selected && rules && myTurn ? rules.moves({ square: selected, verbose: true }) : []),
    [selected, rules, myTurn],
  )

  const select = (square: Square | null) => {
    setSelected(square)
    send('select', { square })
  }

  const play = async (from: Square, to: Square, promo?: 'q' | 'r' | 'b' | 'n') => {
    if (!game || !rules) return
    const next = new ChessRules(game.fen)
    let move: Move
    try {
      move = next.move({ from, to, promotion: promo ?? 'q' })
    } catch {
      return
    }
    const status = next.isCheckmate() ? 'checkmate' : next.isStalemate() ? 'stalemate' : next.isDraw() ? 'draw' : 'active'
    const uci = `${from}${to}${move.promotion ?? ''}`
    const before = game
    select(null)
    setGame({
      ...game,
      fen: next.fen(),
      moves: [...game.moves, move.san],
      last_move: uci,
      status,
      winner_id: status === 'checkmate' ? me : null,
      draw_offered_by: null,
    })
    if (status !== 'active') setCelebrate(true)
    setBusy(true)
    try {
      await api.chessMove(game.id, { expectedPly: before.moves.length, san: move.san, uci, fen: next.fen(), status })
      setNotice(null)
    } catch (e) {
      setNotice(friendlyError(e))
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const tap = (square: Square) => {
    if (!rules || !myTurn || busy) return
    const target = targets.filter((m) => m.to === square)
    if (selected && target.length > 0) {
      if (target.some((m) => m.promotion)) setPromotion({ from: selected, to: square })
      else void play(selected, square)
      return
    }
    const piece = rules.get(square)
    if (piece && piece.color === myColor) select(selected === square ? null : square)
    else select(null)
  }

  const startGame = async (playAs: 'white' | 'black' | 'random') => {
    setChoosing(false)
    setBusy(true)
    try {
      await api.newChessGame(playAs)
      await reload()
      setNotice(null)
    } catch (e) {
      setNotice(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const resign = async () => {
    if (!game) return
    setConfirmResign(false)
    try {
      await api.chessResign(game.id)
      await reload()
    } catch (e) {
      setNotice(friendlyError(e))
    }
  }

  const draw = async () => {
    if (!game) return
    try {
      await api.chessDraw(game.id)
      await reload()
    } catch (e) {
      setNotice(friendlyError(e))
    }
  }

  // ── what to say above the board ──
  const headline = (() => {
    if (!game || !rules) return ''
    const name = (id: string | null) => (id === me ? 'you' : partnerName)
    switch (game.status) {
      case 'checkmate':
        return game.winner_id === me ? 'Checkmate — you win! ♡' : `Checkmate — ${partnerName} wins ♡`
      case 'resigned':
        return game.winner_id === me ? `${partnerName} resigned — you win ♡` : `You resigned — ${partnerName} wins ♡`
      case 'stalemate':
        return 'Stalemate — a draw, well played both of you ♡'
      case 'draw':
        return 'A draw — well played both of you ♡'
      case 'abandoned':
        return 'This game was set aside'
      default:
        if (!myColor) return `${name(game.white_id)} vs ${name(game.black_id)}`
        return `${myTurn ? 'Your move' : `${partnerName} is thinking…`}${rules.inCheck() ? ' — check!' : ''}`
    }
  })()

  const lastFrom = game?.last_move?.slice(0, 2)
  const lastTo = game?.last_move?.slice(2, 4)
  const checkSquare = (() => {
    if (!rules || !rules.inCheck()) return null
    for (const row of rules.board()) for (const cell of row) if (cell && cell.type === 'k' && cell.color === rules.turn()) return cell.square
    return null
  })()

  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]
  const files = flipped ? [...FILES].reverse() : [...FILES]
  const pos = (sq: string) => ({ col: files.indexOf(sq[0] as (typeof FILES)[number]), row: ranks.indexOf(Number(sq[1])) })

  const PlayerBar = ({ id, color }: { id: string; color: 'w' | 'b' }) => {
    const toMove = active && rules?.turn() === color
    return (
      <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${toMove ? 'bg-peacock-soft font-semibold text-peacock-deep' : 'text-ink-soft'}`}>
        <span className={`size-3 rounded-full border border-ink/40 ${color === 'w' ? 'bg-paper' : 'bg-ink'}`} />
        {id === me ? 'You' : partnerName}
        {toMove && (
          <motion.span className="text-rose" animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.4, repeat: Infinity }}>
            ♡
          </motion.span>
        )}
      </div>
    )
  }

  return (
    <Page>
      {celebrate && <HeartShower onDone={() => setCelebrate(false)} />}
      <Link
        to="/world"
        className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
      >
        <ArrowLeft className="size-4" aria-hidden /> Our World
      </Link>
      <header className="mb-4">
        <p className="eyebrow mb-1">Play together</p>
        <h1 className="text-[2rem] leading-tight text-peacock-deep sm:text-4xl">Chess</h1>
        {partner && <PresencePill name={partnerName} here={partnerHere} status={liveStatus} className="mt-2" />}
      </header>

      {loading && <Spinner label="Setting up the board…" />}
      {error && <ErrorNote message={error} onRetry={() => void reload()} />}

      {!loading && !error && !game && (
        <EmptyState
          title="A game for two"
          action={
            <Button onClick={() => setChoosing(true)} busy={busy} disabled={!partner}>
              Start our first game
            </Button>
          }
        >
          {partner
            ? `Play ${partnerName} — every move appears on both screens, live.`
            : 'Chess needs two — it opens once your love has joined.'}
        </EmptyState>
      )}

      {!loading && !error && game && rules && (
        <div className="mx-auto max-w-[30rem]">
          <motion.p
            key={headline}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="hand mb-3 text-center text-[1.7rem] leading-tight text-rose-deep"
            role="status"
          >
            {headline}
          </motion.p>

          {active && game.draw_offered_by && (
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-gold-soft/60 px-4 py-2 text-sm">
              {game.draw_offered_by === me ? (
                <span>You offered a draw — waiting for {partnerName}.</span>
              ) : (
                <>
                  <span>{partnerName} offers a draw.</span>
                  <Button variant="soft" className="min-h-9 px-3 py-1" onClick={() => void draw()}>
                    Accept
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="mb-2 flex justify-start">
            <PlayerBar id={flipped ? game.white_id : game.black_id} color={flipped ? 'w' : 'b'} />
          </div>

          <div
            className="relative grid aspect-square grid-cols-8 overflow-visible rounded-xl border-4 border-[#e9d7bd] shadow-polaroid"
            role="grid"
            aria-label="Chess board"
          >
            {ranks.map((rank) =>
              files.map((file) => {
                const square = `${file}${rank}` as Square
                const piece = rules.get(square)
                const light = (FILES.indexOf(file) + rank) % 2 === 1
                const target = targets.find((m) => m.to === square)
                const isSelected = selected === square
                const isTheirs = theirSelected === square
                const isLast = square === lastFrom || square === lastTo
                const movedHere = square === lastTo && lastFrom
                const offset = movedHere ? { x: (pos(lastFrom).col - pos(square).col) * 100, y: (pos(lastFrom).row - pos(square).row) * 100 } : null
                return (
                  <button
                    key={square}
                    type="button"
                    role="gridcell"
                    onClick={() => tap(square)}
                    aria-label={`${square}${piece ? `, ${piece.color === 'w' ? 'white' : 'black'} ${PIECE_NAME[piece.type]}` : ''}${target ? ', can move here' : ''}`}
                    aria-pressed={isSelected}
                    className={`relative aspect-square ${light ? 'bg-[#f4ead8]' : 'bg-[#a9b89a]'} ${
                      myTurn ? 'cursor-pointer' : 'cursor-default'
                    } focus-visible:z-20`}
                  >
                    {isLast && <span className="absolute inset-0 bg-gold/35" aria-hidden />}
                    {checkSquare === square && (
                      <span className="absolute inset-0 bg-[radial-gradient(circle,rgb(207_90_110/0.85),transparent_70%)]" aria-hidden />
                    )}
                    {isSelected && <span className="absolute inset-0 ring-4 ring-peacock ring-inset" aria-hidden />}
                    {isTheirs && !isSelected && (
                      <motion.span
                        className="absolute inset-0.5 rounded-md border-2 border-dashed border-rose-deep"
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                        aria-hidden
                      />
                    )}
                    {piece &&
                      (offset ? (
                        <motion.span
                          key={`${game.id}-${game.moves.length}`}
                          className="absolute inset-0 z-10"
                          initial={{ x: `${offset.x}%`, y: `${offset.y}%` }}
                          animate={{ x: 0, y: 0 }}
                          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                        >
                          <Piece type={piece.type} color={piece.color} />
                        </motion.span>
                      ) : (
                        <span className="absolute inset-0">
                          <Piece type={piece.type} color={piece.color} />
                        </span>
                      ))}
                    {target &&
                      (piece ? (
                        <span className="absolute inset-1 rounded-full border-4 border-peacock/45" aria-hidden />
                      ) : (
                        <span className="absolute top-1/2 left-1/2 size-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-peacock/40" aria-hidden />
                      ))}
                    {/* board coordinates */}
                    {file === files[0] && (
                      <span className={`absolute top-0.5 left-1 text-[0.6rem] font-bold ${light ? 'text-sage-deep' : 'text-paper'}`} aria-hidden>
                        {rank}
                      </span>
                    )}
                    {rank === ranks[7] && (
                      <span className={`absolute right-1 bottom-0.5 text-[0.6rem] font-bold ${light ? 'text-sage-deep' : 'text-paper'}`} aria-hidden>
                        {file}
                      </span>
                    )}
                  </button>
                )
              }),
            )}
          </div>

          <div className="mt-2 flex justify-end">
            <PlayerBar id={flipped ? game.black_id : game.white_id} color={flipped ? 'b' : 'w'} />
          </div>

          {theirSelected && active && !myTurn && (
            <p className="mt-2 text-center text-xs text-rose-deep">{partnerName} is considering the piece on {theirSelected}…</p>
          )}

          {notice && (
            <p role="alert" className="mt-3 rounded-xl bg-blush/60 px-4 py-2 text-sm text-rose-deep">
              {notice}
            </p>
          )}

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {active && myColor ? (
              <>
                <Button variant="soft" onClick={() => void draw()} disabled={game.draw_offered_by === me}>
                  <Handshake className="size-4" aria-hidden /> {game.draw_offered_by && game.draw_offered_by !== me ? 'Accept draw' : 'Offer a draw'}
                </Button>
                <Button variant="ghost" className="text-rose-deep" onClick={() => setConfirmResign(true)}>
                  <Flag className="size-4" aria-hidden /> Resign
                </Button>
                <Button variant="ghost" onClick={() => setChoosing(true)}>
                  <RotateCcw className="size-4" aria-hidden /> New game
                </Button>
              </>
            ) : (
              <Button onClick={() => setChoosing(true)} busy={busy}>
                <RotateCcw className="size-4" aria-hidden /> Play again
              </Button>
            )}
          </div>

          {game.moves.length > 0 && (
            <details className="paper mt-5 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-peacock-deep">
                Moves ({Math.ceil(game.moves.length / 2)})
              </summary>
              <ol className="mt-2 grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-0.5 font-mono text-sm text-ink">
                {Array.from({ length: Math.ceil(game.moves.length / 2) }, (_, i) => (
                  <li key={i} className="contents">
                    <span className="text-ink-soft">{i + 1}.</span>
                    <span>{game.moves[i * 2]}</span>
                    <span>{game.moves[i * 2 + 1] ?? ''}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      <Modal open={choosing} onClose={() => setChoosing(false)} title="A new game">
        <p className="mb-4 text-ink-soft">
          {active ? 'The current game will be set aside. ' : ''}Which side would you like?
        </p>
        <div className="grid gap-2">
          <Button variant="soft" onClick={() => void startGame('white')}>I’ll play white (I move first)</Button>
          <Button variant="soft" onClick={() => void startGame('black')}>I’ll play black</Button>
          <Button onClick={() => void startGame('random')}>Surprise me ♡</Button>
        </div>
      </Modal>

      <Modal open={promotion !== null} onClose={() => setPromotion(null)} title="Your pawn becomes…">
        <div className="grid grid-cols-4 gap-2">
          {(['q', 'r', 'b', 'n'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-label={PIECE_NAME[p]}
              onClick={() => {
                const move = promotion
                setPromotion(null)
                if (move) void play(move.from, move.to, p)
              }}
              className="aspect-square rounded-xl bg-parchment hover:bg-peacock-soft"
            >
              <Piece type={p} color={myColor ?? 'w'} />
            </button>
          ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmResign}
        title="Resign this game?"
        message={`${partnerName} will win this one. You can start a new game straight after.`}
        confirmLabel="Resign"
        onConfirm={() => void resign()}
        onCancel={() => setConfirmResign(false)}
      />
    </Page>
  )
}
