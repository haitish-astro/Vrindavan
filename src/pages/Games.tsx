import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { useTogether } from '../app/TogetherContext'
import { GAME_INFO } from '../lib/games'
import type { ChessGame, Game, GameKind } from '../lib/types'
import { Page, PageHeader } from '../components/ui'

const ORDER: (GameKind | 'chess')[] = ['sea_battle', 'ludo', 'snakes', 'connect4', 'quiz', 'chess']
const TINTS = ['from-peacock-soft', 'from-gold-soft', 'from-[#e6eddc]', 'from-blush', 'from-lavender', 'from-parchment']

/** The Games corner: every game, and whether it's waiting on you. */
export default function Games() {
  const { api } = useApp()
  const world = useWorld()
  const me = world.me.id
  const partner = world.members.find((m) => m.id !== me)
  const partnerName = partner ? nameOf(world, partner.id) : 'Your love'
  const together = useTogether()
  const [games, setGames] = useState<Game[]>([])
  const [chess, setChess] = useState<ChessGame | null>(null)

  useEffect(() => {
    let active = true
    const load = () => {
      api.listGames(world.space.id).then((g) => active && setGames(g)).catch(() => {})
      api.latestChessGame(world.space.id).then((c) => active && setChess(c)).catch(() => {})
    }
    load()
    const unsubscribe = api.subscribeGames(world.space.id, () => load())
    const tick = setInterval(load, 30_000)
    return () => {
      active = false
      unsubscribe()
      clearInterval(tick)
    }
  }, [api, world.space.id])

  const statusOf = (kind: GameKind | 'chess'): { text: string; tone: 'you' | 'them' | 'idle' | 'done' } => {
    if (kind === 'chess') {
      if (!chess || chess.status === 'abandoned') return { text: 'Start a game', tone: 'idle' }
      if (chess.status !== 'active') return { text: chess.winner_id === me ? 'You won the last one ♡' : 'Play again?', tone: 'done' }
      const turn = chess.moves.length % 2 === 0 ? chess.white_id : chess.black_id
      return turn === me ? { text: 'Your move ♡', tone: 'you' } : { text: `${partnerName}'s move`, tone: 'them' }
    }
    const g = games.filter((x) => x.kind === kind).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!g) return { text: 'Start a game', tone: 'idle' }
    const key = g.p1_id === me ? 'p1' : 'p2'
    if (g.status === 'finished') {
      return { text: g.winner_id ? (g.winner_id === me ? 'You won the last one ♡' : `${partnerName} won the last one`) : 'Last one was a tie', tone: 'done' }
    }
    if (g.kind === 'sea_battle' && g.status === 'setup') {
      return g.state.ready?.[key] ? { text: `Waiting for ${partnerName}'s fleet`, tone: 'them' } : { text: 'Place your fleet ♡', tone: 'you' }
    }
    if (g.kind === 'quiz') {
      return g.state.submitted?.[key] ? { text: `Waiting for ${partnerName}`, tone: 'them' } : { text: 'Your answers ♡', tone: 'you' }
    }
    return g.turn_id === me ? { text: 'Your turn ♡', tone: 'you' } : { text: `${partnerName}'s turn`, tone: 'them' }
  }

  return (
    <Page>
      <PageHeader eyebrow="Play together" title="Games corner" subtitle="Little games for two — every move shows up on both screens, live." />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ORDER.map((kind, i) => {
          const info = GAME_INFO[kind]
          const status = statusOf(kind)
          const herePlaying = together.partnerOnline && together.partnerPath === info.path
          return (
            <motion.li key={kind} className="min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link
                to={info.path}
                className={`relative flex items-center gap-4 overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br ${TINTS[i % TINTS.length]} to-paper px-4 py-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-polaroid`}
              >
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-paper text-3xl shadow-soft">{info.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-xl leading-tight text-peacock-deep">{info.title}</span>
                  <span className="block truncate text-sm text-ink-soft">{info.blurb}</span>
                  <span
                    className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      status.tone === 'you'
                        ? 'bg-rose-deep text-white'
                        : status.tone === 'them'
                          ? 'bg-paper/80 text-ink-soft'
                          : 'bg-paper/60 text-peacock-deep'
                    }`}
                  >
                    {status.text}
                  </span>
                  {herePlaying && <span className="ml-2 text-xs font-semibold text-sage-deep">● {partnerName} is here</span>}
                </span>
                <ChevronRight className="size-5 shrink-0 text-ink-soft" aria-hidden />
              </Link>
            </motion.li>
          )
        })}
      </ul>
    </Page>
  )
}
