import { Navigate, useParams } from 'react-router'
import type { GameKind } from '../lib/types'
import ConnectFour from './ConnectFour'
import Ludo from './Ludo'
import Quiz from './Quiz'
import SeaBattle from './SeaBattle'
import Snakes from './Snakes'

const KINDS: GameKind[] = ['sea_battle', 'ludo', 'snakes', 'connect4', 'quiz']

export default function GameRoom() {
  const { kind } = useParams()
  if (!kind || !KINDS.includes(kind as GameKind)) return <Navigate to="/games" replace />
  switch (kind as GameKind) {
    case 'connect4':
      return <ConnectFour />
    case 'snakes':
      return <Snakes />
    case 'sea_battle':
      return <SeaBattle />
    case 'ludo':
      return <Ludo />
    case 'quiz':
      return <Quiz />
  }
}
