import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Eraser, Lightbulb, Play, Plus, RefreshCw, Shuffle, Trash2, Undo2, X } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { useLiveRoom, useThrottle } from '../lib/live'
import { LEVEL_LABEL, drawerPoints, guesserPoints, pickChoices, type WordChoice } from '../lib/pictionary'
import type { PictStroke, PictWord } from '../lib/types'
import { Button, ConfirmDialog } from '../components/ui'
import { GameFrame, useGame } from './useGame'

type Key = 'p1' | 'p2'
type Ink = { color: string; width: number; points: number[] }
type LocalStroke = PictStroke & { pending?: boolean }
interface LiveInk extends Ink {
  seen: number
  savedId?: string
}
interface HistoryEntry {
  round: number
  drawer: Key
  word: string
  how: 'guessed' | 'gave_up'
  wrong: number
  hints: number
  guesser_points: number
  drawer_points: number
}

const ASPECT = 0.8 // height = width × 0.8, the same on every screen
const PAPER = '#fffdf8'
const COLORS = [
  { value: '#33333f', name: 'Ink' },
  { value: '#1f6f7a', name: 'Peacock blue' },
  { value: '#cf8493', name: 'Rose' },
  { value: '#d9534f', name: 'Red' },
  { value: '#c4a15a', name: 'Gold' },
  { value: '#e8a33d', name: 'Orange' },
  { value: '#6f8463', name: 'Green' },
  { value: '#7d6c9e', name: 'Lavender' },
  { value: '#8a5a3c', name: 'Brown' },
]
const SIZES = [
  { value: 0.006, name: 'Fine' },
  { value: 0.012, name: 'Medium' },
  { value: 0.028, name: 'Bold' },
]
const MAX_NUMBERS = 4000
const MIN_STEP = 0.0025
const LIVE_FLUSH_MS = 40
const round4 = (n: number) => Math.round(n * 10000) / 10000
const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Draws a line; `limit` (number of coordinates) draws only the start of it, for the replay. */
function drawInk(ctx: CanvasRenderingContext2D, s: Ink, w: number, h: number, limit = Infinity) {
  const p = limit < s.points.length ? s.points.slice(0, Math.max(2, limit - (limit % 2))) : s.points
  if (p.length < 2) return
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = Math.max(1, s.width * w)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (p.length === 2) {
    ctx.beginPath()
    ctx.arc(p[0]! * w, p[1]! * h, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.beginPath()
  ctx.moveTo(p[0]! * w, p[1]! * h)
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = ((p[i]! + p[i + 2]!) / 2) * w
    const my = ((p[i + 1]! + p[i + 3]!) / 2) * h
    ctx.quadraticCurveTo(p[i]! * w, p[i + 1]! * h, mx, my)
  }
  ctx.lineTo(p[p.length - 2]! * w, p[p.length - 1]! * h)
  ctx.stroke()
}

export default function Pictionary() {
  const g = useGame('pictionary')
  const game = g.game
  const st = game?.state ?? {}
  const round: number = st.round ?? 1
  const rounds: number = st.rounds ?? 6
  const phase: 'choosing' | 'drawing' | 'done' | undefined = st.phase
  const drawerKey: Key | undefined = st.drawer
  const iDraw = Boolean(g.key && drawerKey === g.key && game?.status === 'active')
  const iGuess = Boolean(g.key && drawerKey && drawerKey !== g.key && game?.status === 'active')
  const guesses: string[] = st.guesses ?? []
  const hints: number = st.hints ?? 0
  const scores: Record<Key, number> = st.scores ?? { p1: 0, p2: 0 }
  const history: HistoryEntry[] = st.history ?? []
  const last = st.last as { round: number; word: string; how: string; guesser_points: number; drawer_points: number } | undefined
  const who = (k: Key | undefined) => (k === g.key ? 'You' : g.partnerName)

  // ── the drawing (every round of this match) ──
  const [strokes, setStrokes] = useState<LocalStroke[]>([])
  const strokesRef = useRef<LocalStroke[]>([])
  strokesRef.current = strokes
  const [myWord, setMyWord] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null)
  const [words, setWords] = useState<PictWord[]>([])

  useEffect(() => {
    if (!game?.id) return
    let active = true
    setStrokes([])
    g.api
      .pictStrokes(game.id)
      .then((list) => active && setStrokes(list))
      .catch((e) => active && g.setNotice(friendlyError(e)))
    const unsubscribe = g.api.subscribePictStrokes(game.id, {
      onStroke: (stroke) =>
        setStrokes((list) => {
          if (list.some((s) => s.id === stroke.id)) return list
          if (stroke.author_id === g.me && list.some((s) => s.pending)) return list // our own echo; the save places it
          return [...list, stroke]
        }),
      onDelete: (id) => setStrokes((list) => list.filter((s) => s.id !== id)),
    })
    return () => {
      active = false
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, g.api, g.me])

  // our shared word list
  useEffect(() => {
    g.api.pictWords(g.world.space.id).then(setWords).catch(() => {})
  }, [g.api, g.world.space.id])

  // the drawer's own secret word for this round
  useEffect(() => {
    setMyWord(null)
    if (!game || !iDraw || phase !== 'drawing') return
    let gone = false
    g.api
      .mySecret(game.id)
      .then((s) => !gone && s?.round === round && setMyWord(String(s.word)))
      .catch(() => {})
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, iDraw, phase, round])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [flash])

  // When a round ends, say how it went (to both of you).
  const lastSeen = useRef<string | null>(null)
  useEffect(() => {
    if (!game) return
    const id = `${game.id}:${last?.round ?? 0}`
    // the first time we see this match, remember where it was — don't announce old news
    if (lastSeen.current === null || !lastSeen.current.startsWith(`${game.id}:`)) {
      lastSeen.current = id
      return
    }
    if (!last || lastSeen.current === id) return
    lastSeen.current = id
    if (last.how === 'guessed') {
      setFlash({ text: `“${last.word}” — guessed! +${last.guesser_points} to the guesser, +${last.drawer_points} to the artist ♡`, tone: 'good' })
    } else {
      setFlash({ text: `It was “${last.word}”. On to the next one!`, tone: 'bad' })
    }
  }, [last, game])

  const roundStrokes = useMemo(() => strokes.filter((s) => s.round === round), [strokes, round])

  // ── status line ──
  let status = ''
  if (game?.status === 'active') {
    if (phase === 'choosing') status = iDraw ? 'Your turn to draw — pick a word ✏️' : `${g.partnerName} is picking a word…`
    else if (phase === 'drawing') status = iDraw ? `Draw it! ${g.partnerName} is guessing` : `Guess what ${g.partnerName} is drawing 🎨`
  }

  const newMatch = () =>
    void g.run(async () => {
      await g.api.pictNew(6)
      await g.reload()
    })

  return (
    <GameFrame
      kind="pictionary"
      g={g}
      status={status}
      emptyText={`Take turns: one draws a secret word, the other guesses — live together, or whenever ${g.partnerName} opens it later. Six rounds, three drawings each.`}
      onNewGame={newMatch}
    >
      {game && (
        <div className="mx-auto max-w-2xl">
          {/* scores */}
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-sm">
            {(['p1', 'p2'] as const).map((k) => (
              <span
                key={k}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold ${
                  k === g.key ? 'bg-blush/70 text-rose-deep' : 'bg-peacock/15 text-peacock-deep'
                }`}
              >
                {who(k)} · {scores[k] ?? 0} pts
                {game.status === 'active' && drawerKey === k && <span aria-label="drawing this round">✏️</span>}
              </span>
            ))}
            {game.status === 'active' && (
              <span className="rounded-full bg-parchment px-3 py-1 text-xs text-ink-soft">
                Round {round} of {rounds}
              </span>
            )}
          </div>

          <AnimatePresence>
            {flash && (
              <motion.p
                key={flash.text}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                role="status"
                className={`mb-3 rounded-xl px-4 py-2 text-center text-sm font-semibold ${
                  flash.tone === 'good' ? 'bg-sage/30 text-sage-deep' : 'bg-blush/60 text-rose-deep'
                }`}
              >
                {flash.text}
              </motion.p>
            )}
          </AnimatePresence>

          {game.status === 'active' && phase === 'choosing' && iDraw && (
            <ChooseWord
              key={`choose-${game.id}-${round}`}
              ours={words.map((w) => w.word)}
              avoid={history.map((h) => h.word)}
              busy={g.busy}
              onPick={(word) =>
                void g.run(async () => {
                  await g.api.pictChoose(game.id, word)
                  setMyWord(word)
                  await g.reload()
                })
              }
            />
          )}
          {game.status === 'active' && phase === 'choosing' && !iDraw && (
            <div className="paper flex flex-col items-center gap-2 px-6 py-10 text-center">
              <motion.span className="text-5xl" animate={{ rotate: [0, -10, 10, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
                🎨
              </motion.span>
              <p className="text-ink-soft">{g.partnerName} is choosing what to draw. You can stay here — the drawing will appear as it happens.</p>
            </div>
          )}

          {game.status === 'active' && phase === 'drawing' && (
            <Board
              key={`board-${game.id}-${round}`}
              gameId={game.id}
              round={round}
              strokes={roundStrokes}
              setStrokes={setStrokes}
              canDraw={iDraw}
              me={g.me}
              onError={(m) => g.setNotice(m)}
              header={
                iDraw ? (
                  <DrawerHeader
                    word={myWord}
                    guesses={guesses}
                    hints={hints}
                    partnerName={g.partnerName}
                    canChange={guesses.length === 0 && hints === 0}
                    busy={g.busy}
                    onChange={() =>
                      void g.run(async () => {
                        await g.api.pictRechoose(game.id)
                        await g.reload()
                      })
                    }
                  />
                ) : (
                  <WordPattern mask={st.mask ?? ''} />
                )
              }
            />
          )}

          {game.status === 'active' && phase === 'drawing' && iGuess && (
            <GuessPanel
              key={`guess-${game.id}-${round}`}
              guesses={guesses}
              hints={hints}
              busy={g.busy}
              partnerName={g.partnerName}
              onGuess={async (text) => {
                let right = false
                const done = await g.run(async () => {
                  const r = await g.api.pictGuess(game.id, text)
                  right = r.right
                  if (!r.right) setFlash({ text: `Not “${text}” — keep going!`, tone: 'bad' })
                  await g.reload()
                })
                return done && right ? 'right' : done ? 'wrong' : 'error'
              }}
              onHint={() =>
                void g.run(async () => {
                  await g.api.pictHint(game.id)
                  await g.reload()
                })
              }
              onGiveUp={() =>
                void g.run(async () => {
                  await g.api.pictGiveUp(game.id)
                  await g.reload()
                })
              }
            />
          )}

          {(game.status === 'finished' || history.length > 0) && (
            <Gallery history={history} strokes={strokes} who={who} finished={game.status === 'finished'} />
          )}

          {game.status === 'active' && (
            <OurWords
              words={words}
              onAdd={async (word) => {
                const saved = await g.api.pictAddWord(g.world.space.id, word)
                setWords((list) => [...list, saved])
              }}
              onRemove={async (id) => {
                await g.api.pictRemoveWord(id)
                setWords((list) => list.filter((w) => w.id !== id))
              }}
            />
          )}
        </div>
      )}
    </GameFrame>
  )
}

// ── picking the word ──
function ChooseWord({ ours, avoid, busy, onPick }: { ours: string[]; avoid: string[]; busy: boolean; onPick: (word: string) => void }) {
  const [choices, setChoices] = useState<WordChoice[]>(() => pickChoices(ours, avoid))
  const tone: Record<WordChoice['level'], string> = {
    easy: 'bg-sage/25 text-sage-deep',
    medium: 'bg-gold/20 text-[#8a6d2c]',
    hard: 'bg-blush/70 text-rose-deep',
    ours: 'bg-lavender/60 text-plum',
  }
  return (
    <div className="paper flex flex-col items-center gap-4 px-5 py-6">
      <p className="text-center text-ink-soft">Pick one to draw. Only you can see it.</p>
      <div className="grid w-full gap-2 sm:grid-cols-3">
        {choices.map((c) => (
          <motion.button
            key={c.word}
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
            disabled={busy}
            onClick={() => onPick(c.word)}
            className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-gold/30 bg-paper px-3 py-3 shadow-soft transition hover:border-peacock/40 disabled:opacity-60"
          >
            <span className="font-serif text-xl text-peacock-deep first-letter:uppercase">{c.word}</span>
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${tone[c.level]}`}>
              {c.level === 'ours' ? 'Our word ♡' : LEVEL_LABEL[c.level]}
            </span>
          </motion.button>
        ))}
      </div>
      <Button variant="ghost" onClick={() => setChoices(pickChoices(ours, avoid))} disabled={busy}>
        <Shuffle className="size-4" aria-hidden /> Other words
      </Button>
    </div>
  )
}

// ── what each side sees above the board ──
function DrawerHeader({
  word,
  guesses,
  hints,
  partnerName,
  canChange,
  busy,
  onChange,
}: {
  word: string | null
  guesses: string[]
  hints: number
  partnerName: string
  canChange: boolean
  busy: boolean
  onChange: () => void
}) {
  return (
    <div className="mb-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          You’re drawing{' '}
          <strong className="rounded-lg bg-gold/20 px-2 py-0.5 font-serif text-lg text-peacock-deep first-letter:uppercase">{word ?? '…'}</strong>
        </p>
        {canChange && (
          <button type="button" onClick={onChange} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-peacock-deep">
            <RefreshCw className="size-3.5" aria-hidden /> Pick another word
          </button>
        )}
      </div>
      {(guesses.length > 0 || hints > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-live="polite">
          <span className="text-ink-soft">{partnerName}’s guesses:</span>
          {guesses.map((x, i) => (
            <span key={`${x}-${i}`} className="rounded-full bg-parchment px-2 py-0.5 text-ink line-through decoration-rose/60">
              {x}
            </span>
          ))}
          {hints > 0 && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[#8a6d2c]">{hints} hint{hints > 1 ? 's' : ''}</span>}
        </div>
      )}
    </div>
  )
}

function WordPattern({ mask }: { mask: string }) {
  const letters = mask.replace(/[^_]/g, '').length + mask.replace(/[_\s]/g, '').length
  return (
    <div className="mb-2 flex flex-col items-center gap-1">
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1" aria-label={`The word: ${mask.replace(/_/g, 'blank ')}`}>
        {mask.split(' ').map((part, i) => (
          <span key={i} className="flex gap-1">
            {[...part].map((ch, j) => (
              <span
                key={j}
                className={`flex h-8 w-6 items-end justify-center border-b-2 font-serif text-xl uppercase ${
                  ch === '_' ? 'border-ink/40' : /[\p{L}\p{N}]/u.test(ch) ? 'border-peacock text-peacock-deep' : 'border-transparent text-ink'
                }`}
              >
                {ch === '_' ? '' : ch}
              </span>
            ))}
          </span>
        ))}
      </div>
      <p className="text-[0.7rem] text-ink-soft">
        {letters} letter{letters === 1 ? '' : 's'}
        {mask.includes(' ') ? `, ${mask.split(' ').length} words` : ''}
      </p>
    </div>
  )
}

// ── guessing ──
function GuessPanel({
  guesses,
  hints,
  busy,
  partnerName,
  onGuess,
  onHint,
  onGiveUp,
}: {
  guesses: string[]
  hints: number
  busy: boolean
  partnerName: string
  onGuess: (text: string) => Promise<'right' | 'wrong' | 'error'>
  onHint: () => void
  onGiveUp: () => void
}) {
  const [text, setText] = useState('')
  const [shake, setShake] = useState(0)
  const [confirmGiveUp, setConfirmGiveUp] = useState(false)
  const worth = guesserPoints(guesses.length, hints)
  const input = useRef<HTMLInputElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const t = text.trim()
    if (!t || busy) return
    const result = await onGuess(t)
    if (result !== 'error') setText('')
    if (result === 'wrong') setShake((n) => n + 1)
    input.current?.focus()
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <motion.form
        key={shake}
        onSubmit={submit}
        className="flex gap-2"
        animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
        transition={{ duration: 0.35 }}
      >
        <label htmlFor="pict-guess" className="sr-only">
          Your guess
        </label>
        <input
          id="pict-guess"
          ref={input}
          className="field min-w-0 flex-1"
          placeholder="Type your guess…"
          autoComplete="off"
          autoCapitalize="off"
          maxLength={60}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" busy={busy} disabled={!text.trim()}>
          Guess
        </Button>
      </motion.form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
        <span>
          Worth <strong className="text-rose-deep">{worth}</strong> points now · {partnerName} gets {drawerPoints(worth)}
        </span>
        <span className="flex gap-1">
          <Button variant="ghost" className="!min-h-9 !px-3 text-xs" onClick={onHint} disabled={busy || hints >= 3}>
            <Lightbulb className="size-3.5" aria-hidden /> Hint (−3)
          </Button>
          <Button variant="ghost" className="!min-h-9 !px-3 text-xs text-rose-deep" onClick={() => setConfirmGiveUp(true)} disabled={busy}>
            Give up
          </Button>
        </span>
      </div>
      {guesses.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {guesses.map((x, i) => (
            <span key={`${x}-${i}`} className="rounded-full bg-parchment px-2 py-0.5 text-ink-soft line-through decoration-rose/60">
              {x}
            </span>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmGiveUp}
        title="Give up on this one?"
        message="The word will be revealed and nobody scores this round."
        confirmLabel="Show me the word"
        onConfirm={() => {
          setConfirmGiveUp(false)
          onGiveUp()
        }}
        onCancel={() => setConfirmGiveUp(false)}
      />
    </div>
  )
}

// ── the board: draw (drawer) or watch live / replay (guesser) ──
function Board({
  gameId,
  round,
  strokes,
  setStrokes,
  canDraw,
  me,
  onError,
  header,
}: {
  gameId: string
  round: number
  strokes: LocalStroke[]
  setStrokes: React.Dispatch<React.SetStateAction<LocalStroke[]>>
  canDraw: boolean
  me: string
  onError: (message: string) => void
  header: React.ReactNode
}) {
  const { api } = useApp()
  const [color, setColor] = useState(COLORS[0]!.value)
  const [size, setSize] = useState(SIZES[1]!.value)
  const [erasing, setErasing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const current = useRef<(Ink & { key: string; sent: number }) | null>(null)
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes
  const liveInks = useRef<Map<string, LiveInk>>(new Map())
  const frame = useRef<number | null>(null)
  // replay: how many coordinates of the saved drawing to show (Infinity = all)
  const replayBudget = useRef(Infinity)
  const [replaying, setReplaying] = useState(false)

  const paint = useCallback(() => {
    frame.current = null
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const w = el.width
    const h = el.height
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, w, h)
    let budget = replayBudget.current
    for (const s of strokesRef.current) {
      if (budget <= 0) break
      drawInk(ctx, s, w, h, budget)
      budget -= s.points.length
    }
    if (replayBudget.current === Infinity) {
      liveInks.current.forEach((ink) => drawInk(ctx, ink, w, h))
      if (current.current) drawInk(ctx, current.current, w, h)
    }
  }, [])

  const schedule = useCallback(() => {
    frame.current ??= requestAnimationFrame(paint)
  }, [paint])

  useEffect(() => schedule(), [strokes, schedule])

  // size the canvas to its box (sharp on high-density screens)
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const resize = () => {
      const width = el.clientWidth
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      el.width = Math.round(width * ratio)
      el.height = Math.round(width * ASPECT * ratio)
      paint()
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    return () => observer.disconnect()
  }, [paint])

  // ── replay: watch the drawing being made, stroke by stroke ──
  const replay = useCallback(() => {
    const total = strokesRef.current.reduce((n, s) => n + s.points.length, 0)
    if (total === 0) return
    const duration = Math.min(6000, Math.max(1500, total * 2))
    const start = performance.now()
    setReplaying(true)
    const step = (t: number) => {
      const f = Math.min(1, (t - start) / duration)
      replayBudget.current = f >= 1 ? Infinity : Math.floor(total * f)
      paint()
      if (f < 1) requestAnimationFrame(step)
      else setReplaying(false)
    }
    replayBudget.current = 0
    requestAnimationFrame(step)
  }, [paint])

  // The guesser arriving to a drawing already under way: play it back once.
  const replayedOnce = useRef(false)
  useEffect(() => {
    if (canDraw || replayedOnce.current || strokes.length === 0) return
    replayedOnce.current = true
    if (strokes.length >= 2) replay()
  }, [canDraw, strokes.length, replay])

  // ── live: their line as it is drawn ──
  const { send } = useLiveRoom('pictionary', (event, payload) => {
    if (payload.gid !== gameId || payload.round !== round) return
    if (event === 'ink') {
      const key = typeof payload.key === 'string' ? payload.key : null
      const pts = Array.isArray(payload.pts) ? payload.pts.filter(isNum) : []
      if (!key || pts.length < 2) return
      const inkColor = typeof payload.color === 'string' && /^#[0-9a-f]{6}$/i.test(payload.color) ? payload.color : '#33333f'
      const width = isNum(payload.width) ? Math.min(0.05, Math.max(0.001, payload.width)) : 0.012
      const existing = liveInks.current.get(key)
      if (existing) {
        existing.points.push(...pts.slice(0, MAX_NUMBERS - existing.points.length))
        existing.seen = Date.now()
      } else {
        liveInks.current.set(key, { color: inkColor, width, points: pts.slice(0, MAX_NUMBERS), seen: Date.now() })
      }
      schedule()
    } else if (event === 'ink-alive') {
      const ink = typeof payload.key === 'string' ? liveInks.current.get(payload.key) : undefined
      if (ink) ink.seen = Date.now()
    } else if (event === 'ink-end') {
      const key = typeof payload.key === 'string' ? payload.key : null
      const ink = key ? liveInks.current.get(key) : undefined
      if (!key || !ink) return
      const savedId = typeof payload.id === 'string' ? payload.id : undefined
      // keep showing it until the saved line arrives, so it never blinks
      if (!savedId || strokesRef.current.some((s) => s.id === savedId)) liveInks.current.delete(key)
      else ink.savedId = savedId
      schedule()
    } else if (event === 'clear') {
      liveInks.current.clear()
      schedule()
    }
  })

  // saved lines replace their live copies
  useEffect(() => {
    let changed = false
    liveInks.current.forEach((ink, key) => {
      if (ink.savedId && strokes.some((s) => s.id === ink.savedId)) {
        liveInks.current.delete(key)
        changed = true
      }
    })
    if (changed) schedule()
  }, [strokes, schedule])

  useEffect(() => {
    const beat = setInterval(() => {
      if (current.current) send('ink-alive', { gid: gameId, round, key: current.current.key })
    }, 2000)
    const sweep = setInterval(() => {
      const stale = Date.now() - 8000
      let changed = false
      liveInks.current.forEach((ink, key) => {
        if (ink.seen < stale) {
          liveInks.current.delete(key)
          changed = true
        }
      })
      if (changed) schedule()
    }, 2000)
    return () => {
      clearInterval(beat)
      clearInterval(sweep)
    }
  }, [send, gameId, round, schedule])

  const flushInk = useCallback(() => {
    const ink = current.current
    if (!ink || ink.sent >= ink.points.length) return
    const from = Math.max(0, ink.sent - 2) // overlap so the pieces join up seamlessly
    send('ink', { gid: gameId, round, key: ink.key, color: ink.color, width: ink.width, pts: ink.points.slice(from) })
    ink.sent = ink.points.length
  }, [send, gameId, round])
  const flushInkSoon = useThrottle(flushInk, LIVE_FLUSH_MS)

  const pointFrom = (clientX: number, clientY: number, rect: DOMRect) =>
    [round4(clamp01((clientX - rect.left) / rect.width)), round4(clamp01((clientY - rect.top) / rect.height))] as const

  const finish = () => {
    const ink = current.current
    current.current = null
    if (!ink || ink.points.length < 2) return
    flushInk()
    const localId = `local-${crypto.randomUUID()}`
    const stroke = { color: ink.color, width: ink.width, points: ink.points }
    setStrokes((list) => [
      ...list,
      { ...stroke, id: localId, game_id: gameId, round, author_id: me, created_at: new Date().toISOString(), pending: true },
    ])
    api
      .pictAddStroke(gameId, round, stroke)
      .then((saved) => {
        setStrokes((list) => [...list.filter((s) => s.id !== localId && s.id !== saved.id), saved])
        send('ink-end', { gid: gameId, round, key: ink.key, id: saved.id })
      })
      .catch((e) => {
        setStrokes((list) => list.filter((s) => s.id !== localId))
        send('ink-end', { gid: gameId, round, key: ink.key })
        onError(friendlyError(e))
      })
  }

  const onDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || replaying) return
    if (event.button !== 0 && event.pointerType === 'mouse') return
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // some pens/browsers refuse capture; drawing still works without it
    }
    const [x, y] = pointFrom(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect())
    current.current = { key: crypto.randomUUID(), color: erasing ? PAPER : color, width: erasing ? SIZES[2]!.value * 1.4 : size, points: [x, y], sent: 0 }
    flushInkSoon()
    schedule()
  }

  const onMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const ink = current.current
    if (!ink) return
    const rect = event.currentTarget.getBoundingClientRect()
    const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
    const events = coalesced.length > 0 ? coalesced : [event.nativeEvent]
    for (const e of events) {
      const [x, y] = pointFrom(e.clientX, e.clientY, rect)
      const lx = ink.points[ink.points.length - 2]!
      const ly = ink.points[ink.points.length - 1]!
      if (Math.hypot(x - lx, y - ly) < MIN_STEP) continue
      ink.points.push(x, y)
      if (ink.points.length >= MAX_NUMBERS) {
        finish()
        current.current = { key: crypto.randomUUID(), color: ink.color, width: ink.width, points: [x, y], sent: 0 }
        break
      }
    }
    flushInkSoon()
    schedule()
  }

  const undo = async () => {
    const lastStroke = [...strokesRef.current].reverse().find((s) => s.author_id === me && !s.pending)
    if (!lastStroke) return
    setStrokes((list) => list.filter((s) => s.id !== lastStroke.id))
    try {
      await api.pictDeleteStroke(lastStroke.id)
    } catch (e) {
      setStrokes((list) => [...list, lastStroke].sort((a, b) => a.created_at.localeCompare(b.created_at)))
      onError(friendlyError(e))
    }
  }

  const clear = async () => {
    setConfirmClear(false)
    const mine = strokesRef.current.filter((s) => s.author_id === me && !s.pending)
    setStrokes((list) => list.filter((s) => !mine.some((m) => m.id === s.id)))
    liveInks.current.clear()
    send('clear', { gid: gameId, round })
    try {
      await Promise.all(mine.map((s) => api.pictDeleteStroke(s.id)))
    } catch (e) {
      onError(friendlyError(e))
    }
  }

  return (
    <div>
      {header}
      <div className="relative">
        <canvas
          ref={canvas}
          className={`block w-full rounded-2xl border border-gold/30 shadow-polaroid ${canDraw ? 'cursor-crosshair touch-none' : ''}`}
          style={{ aspectRatio: `${1 / ASPECT}` }}
          aria-label={canDraw ? 'Drawing board — draw your word here' : 'The drawing'}
          role="img"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={() => current.current && finish()}
        />
        {!canDraw && strokes.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-soft">
            The drawing will appear here as it’s drawn…
          </p>
        )}
        {!canDraw && strokes.length > 0 && !replaying && (
          <button
            type="button"
            onClick={replay}
            className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-paper/90 px-3 py-1.5 text-xs font-semibold text-peacock-deep shadow-soft"
          >
            <Play className="size-3.5" aria-hidden /> Replay
          </button>
        )}
      </div>

      {canDraw && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Colour">
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={!erasing && color === c.value}
                aria-label={c.name}
                onClick={() => {
                  setColor(c.value)
                  setErasing(false)
                }}
                className={`size-7 rounded-full border-2 transition ${!erasing && color === c.value ? 'scale-110 border-ink' : 'border-white'} shadow-soft`}
                style={{ background: c.value }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Pen size">
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={!erasing && size === s.value}
                aria-label={s.name}
                onClick={() => {
                  setSize(s.value)
                  setErasing(false)
                }}
                className={`flex size-8 items-center justify-center rounded-full ${!erasing && size === s.value ? 'bg-peacock/15' : ''}`}
              >
                <span className="rounded-full bg-ink" style={{ width: 4 + s.value * 300, height: 4 + s.value * 300 }} />
              </button>
            ))}
            <button
              type="button"
              aria-pressed={erasing}
              aria-label="Eraser"
              onClick={() => setErasing((e) => !e)}
              className={`flex size-8 items-center justify-center rounded-full ${erasing ? 'bg-peacock/15 text-peacock-deep' : 'text-ink-soft'}`}
            >
              <Eraser className="size-4" aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" className="!min-h-9 !px-3 text-xs" onClick={() => void undo()} disabled={!strokes.some((s) => s.author_id === me && !s.pending)}>
              <Undo2 className="size-3.5" aria-hidden /> Undo
            </Button>
            <Button variant="ghost" className="!min-h-9 !px-3 text-xs" onClick={() => setConfirmClear(true)} disabled={strokes.length === 0}>
              <Trash2 className="size-3.5" aria-hidden /> Clear
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmClear}
        title="Clear your drawing?"
        message="Everything you drew this round will be wiped so you can start fresh."
        confirmLabel="Clear"
        onConfirm={() => void clear()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}

// ── every drawing of the match, with how it went ──
function Gallery({ history, strokes, who, finished }: { history: HistoryEntry[]; strokes: PictStroke[]; who: (k: Key) => string; finished: boolean }) {
  if (history.length === 0) return null
  return (
    <section className="mt-6" aria-label="Our drawings">
      <h2 className="mb-2 text-center font-display text-xl text-peacock-deep">{finished ? 'Our gallery ♡' : 'So far'}</h2>
      <ul className={`grid gap-3 ${finished ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`}>
        {[...history].reverse().map((h) => (
          <li key={h.round} className="overflow-hidden rounded-xl bg-paper shadow-soft">
            <Thumb strokes={strokes.filter((s) => s.round === h.round)} />
            <div className="px-2 py-1.5 text-center">
              <p className="truncate font-serif text-sm text-peacock-deep first-letter:uppercase">{h.word}</p>
              <p className="text-[0.65rem] text-ink-soft">
                by {who(h.drawer)} · {h.how === 'guessed' ? `+${h.guesser_points}/+${h.drawer_points}` : 'not guessed'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Thumb({ strokes }: { strokes: PictStroke[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const width = el.clientWidth || 160
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(width * ratio)
    el.height = Math.round(width * ASPECT * ratio)
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, el.width, el.height)
    strokes.forEach((s) => drawInk(ctx, s, el.width, el.height))
  }, [strokes])
  return <canvas ref={ref} className="block w-full border-b border-gold/20" style={{ aspectRatio: `${1 / ASPECT}` }} aria-hidden />
}

// ── our own words ──
function OurWords({ words, onAdd, onRemove }: { words: PictWord[]; onAdd: (word: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const add = async (event: FormEvent) => {
    event.preventDefault()
    const w = text.trim()
    if (!w) return
    setBusy(true)
    try {
      await onAdd(w)
      setText('')
      setError(null)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mt-6 rounded-2xl border border-gold/25 bg-paper/60 px-4 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
        <span className="font-semibold text-peacock-deep">Our own words {words.length > 0 && <span className="text-ink-soft">({words.length})</span>}</span>
        <Plus className={`size-4 text-ink-soft transition ${open ? 'rotate-45' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-xs text-ink-soft">
            Inside jokes, places, little things only you two know. They’ll turn up as choices when it’s someone’s turn to draw. (You can both see this list.)
          </p>
          <form onSubmit={add} className="flex gap-2">
            <input
              className="field min-w-0 flex-1"
              placeholder="e.g. our first chai"
              maxLength={40}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-label="A word of our own"
            />
            <Button type="submit" busy={busy} disabled={!text.trim()}>
              Add
            </Button>
          </form>
          {error && <p className="text-xs text-rose-deep">{error}</p>}
          {words.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {words.map((w) => (
                <li key={w.id} className="inline-flex items-center gap-1 rounded-full bg-lavender/50 py-0.5 pr-1 pl-2.5 text-sm text-plum">
                  {w.word}
                  <button
                    type="button"
                    onClick={() => void onRemove(w.id).catch((e) => setError(friendlyError(e)))}
                    aria-label={`Remove ${w.word}`}
                    className="flex size-6 items-center justify-center rounded-full hover:bg-white/60"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
