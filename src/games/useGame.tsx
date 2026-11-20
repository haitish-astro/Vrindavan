/** Shared plumbing for every game: load, live updates, actions, and the page frame. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Flag, RotateCcw } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { useTogether } from '../app/TogetherContext'
import { friendlyError } from '../data/api'
import { GAME_INFO } from '../lib/games'
import type { Game, GameKind } from '../lib/types'
import { HeartShower } from '../components/Hearts'
import { Button, ConfirmDialog, ErrorNote, Page, Spinner } from '../components/ui'

export function useGame(kind: GameKind) {
  const { api } = useApp()
  const world = useWorld()
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)
  const partnerName = partner ? nameOf(world, partner.id) : 'Your love'
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const current = useRef<Game | null>(null)
  current.current = game

  const accept = useCallback(
    (incoming: Game | null) => {
      if (!incoming) {
        setGame(null)
        return
      }
      if (incoming.kind !== kind) return
      const now = current.current
      if (now && incoming.id === now.id && incoming.version < now.version) return // older news
      if (now && incoming.id !== now.id && incoming.created_at < now.created_at) return
      const justFinished = now && now.id === incoming.id && now.status !== 'finished' && incoming.status === 'finished'
      if (justFinished) setCelebrate(true)
      setGame(incoming)
    },
    [kind],
  )

  const reload = useCallback(async () => {
    try {
      accept(await api.latestGame(world.space.id, kind))
      setError(null)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setLoading(false)
    }
  }, [api, world.space.id, kind, accept])

  useEffect(() => {
    void reload()
    const unsubscribe = api.subscribeGames(world.space.id, accept)
    const onVisible = () => document.visibilityState === 'visible' && void reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [api, world.space.id, accept, reload])

  /** Run an action; on failure show why and fetch the latest board. */
  const run = useCallback(
    async (action: () => Promise<unknown>, optimistic?: Game) => {
      const before = current.current
      if (optimistic) setGame(optimistic)
      setBusy(true)
      try {
        await action()
        setNotice(null)
        return true
      } catch (e) {
        if (optimistic) setGame(before)
        setNotice(friendlyError(e))
        await reload()
        return false
      } finally {
        setBusy(false)
      }
    },
    [reload],
  )

  const key = game ? (game.p1_id === me ? 'p1' : 'p2') : null
  const otherKey = key === 'p1' ? 'p2' : 'p1'
  const live = game && (game.status === 'active' || game.status === 'setup')
  const myTurn = Boolean(game && game.status === 'active' && game.turn_id === me)

  return {
    api,
    world,
    me,
    partner,
    partnerName,
    game,
    setGame,
    loading,
    error,
    notice,
    setNotice,
    busy,
    celebrate,
    setCelebrate,
    reload,
    run,
    key: key as 'p1' | 'p2' | null,
    otherKey: otherKey as 'p1' | 'p2',
    live: Boolean(live),
    myTurn,
    newGame: (initial: Record<string, unknown>) =>
      run(async () => {
        await api.newGame(kind, initial)
        await reload()
      }),
    resign: () => (game ? run(() => api.gameResign(game.id)) : Promise.resolve(false)),
  }
}

export type GameHandle = ReturnType<typeof useGame>

/** The frame every game sits in: back link, title, who's here, status, and the buttons at the bottom. */
export function GameFrame({
  kind,
  g,
  status,
  onNewGame,
  children,
  emptyText,
}: {
  kind: GameKind
  g: GameHandle
  status: ReactNode
  onNewGame: () => void
  children: ReactNode
  emptyText: string
}) {
  const info = GAME_INFO[kind]
  const together = useTogether()
  const theyreHere = together.partnerOnline && together.partnerPath === info.path
  const [confirmNew, setConfirmNew] = useState(false)
  const [confirmResign, setConfirmResign] = useState(false)
  const winner = g.game?.winner_id

  return (
    <Page>
      {g.celebrate && <HeartShower onDone={() => g.setCelebrate(false)} />}
      <Link to="/games" className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep">
        <ArrowLeft className="size-4" aria-hidden /> Games
      </Link>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow mb-1">Play together</p>
          <h1 className="text-[2rem] leading-tight text-peacock-deep sm:text-4xl">
            {info.emoji} {info.title}
          </h1>
        </div>
        {g.partner && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              theyreHere ? 'bg-sage/25 text-sage-deep' : 'bg-parchment text-ink-soft'
            }`}
          >
            <span className={`size-2 rounded-full ${theyreHere ? 'bg-sage-deep' : 'bg-ink-soft/40'}`} />
            {theyreHere ? `${g.partnerName} is at the table` : `${g.partnerName} isn't here`}
          </span>
        )}
      </header>

      {g.loading && <Spinner label="Setting up…" />}
      {g.error && <ErrorNote message={g.error} onRetry={() => void g.reload()} />}

      {!g.loading && !g.error && (!g.game || g.game.status === 'abandoned') && (
        <div className="paper flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span className="text-5xl">{info.emoji}</span>
          <p className="max-w-sm text-ink-soft">{g.partner ? emptyText : 'Games need two — they open once your love has joined.'}</p>
          <Button onClick={onNewGame} busy={g.busy} disabled={!g.partner}>
            Start a game ♡
          </Button>
        </div>
      )}

      {!g.loading && !g.error && g.game && g.game.status !== 'abandoned' && (
        <>
          <AnimatePresence mode="wait">
            <motion.p
              key={typeof status === 'string' ? status : 'status'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="hand mb-3 text-center text-[1.6rem] leading-tight text-rose-deep"
              role="status"
            >
              {g.game.status === 'finished'
                ? winner
                  ? winner === g.me
                    ? 'You won! ♡'
                    : `${g.partnerName} won ♡`
                  : "It's a tie — perfectly matched ♡"
                : status}
            </motion.p>
          </AnimatePresence>
          {g.notice && (
            <p role="alert" className="mb-3 rounded-xl bg-blush/60 px-4 py-2 text-center text-sm text-rose-deep">
              {g.notice}
            </p>
          )}
          {children}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {g.live ? (
              <>
                <Button variant="ghost" className="text-rose-deep" onClick={() => setConfirmResign(true)}>
                  <Flag className="size-4" aria-hidden /> Give up
                </Button>
                <Button variant="ghost" onClick={() => setConfirmNew(true)}>
                  <RotateCcw className="size-4" aria-hidden /> New game
                </Button>
              </>
            ) : (
              <Button onClick={onNewGame} busy={g.busy}>
                <RotateCcw className="size-4" aria-hidden /> Play again
              </Button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmNew}
        title="Start a new game?"
        message="This game will be set aside for both of you."
        confirmLabel="New game"
        onConfirm={() => {
          setConfirmNew(false)
          onNewGame()
        }}
        onCancel={() => setConfirmNew(false)}
      />
      <ConfirmDialog
        open={confirmResign}
        title="Give up this game?"
        message={`${g.partnerName} will win this one. You can start a new game straight after.`}
        confirmLabel="Give up"
        onConfirm={() => {
          setConfirmResign(false)
          void g.resign()
        }}
        onCancel={() => setConfirmResign(false)}
      />
    </Page>
  )
}

/** A die that tumbles when rolled. */
export function Die({ value, rolling, className = '' }: { value: number | null; rolling?: boolean; className?: string }) {
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
  return (
    <motion.div
      key={`${value}-${rolling}`}
      initial={rolling ? { rotate: -200, scale: 0.6 } : false}
      animate={{ rotate: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      className={`grid size-14 grid-cols-3 grid-rows-3 gap-0.5 rounded-xl border border-gold/40 bg-paper p-2 shadow-polaroid ${className}`}
      aria-label={value ? `Die shows ${value}` : 'Die'}
      role="img"
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`m-auto size-2 rounded-full ${value && pips[value]!.includes(i) ? 'bg-ink' : ''}`} />
      ))}
    </motion.div>
  )
}
