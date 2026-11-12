export interface SessionUser {
  id: string
  email: string
}

export interface Profile {
  id: string
  display_name: string | null
  /** false until this person has chosen their own password */
  own_password?: boolean
}

export interface Space {
  id: string
  name: string
  first_met_on: string | null
  welcome_greeting: string | null
  featured_message: string | null
}

/** Everything about "our world" that the app needs once someone is signed in. */
export interface World {
  space: Space
  me: Profile
  members: Profile[]
}

export interface Photo {
  id: string
  memory_id: string
  space_id: string
  uploaded_by: string | null
  storage_path: string
  thumb_path: string | null
  width: number | null
  height: number | null
  sort_order: number
  created_at: string
}

export interface MemoryNote {
  id: string
  memory_id: string
  author_id: string
  note: string | null
  favorite_moment: string | null
  updated_at: string
}

export interface Memory {
  id: string
  space_id: string
  created_by: string | null
  title: string
  happened_on: string
  location: string | null
  description: string | null
  emoji: string | null
  created_at: string
  photos: Photo[]
  notes: MemoryNote[]
}

export interface MemoryInput {
  title: string
  happened_on: string
  location: string | null
  description: string | null
  emoji: string | null
}

export interface NoteInput {
  note: string | null
  favorite_moment: string | null
}

export interface Milestone {
  id: string
  space_id: string
  created_by: string | null
  title: string
  happened_on: string
  description: string | null
  location: string | null
  photo_path: string | null
  created_at: string
}

export interface MilestoneInput {
  title: string
  happened_on: string
  description: string | null
  location: string | null
}

export type ReactionTarget = 'memory' | 'letter' | 'quick_note'

export interface Reaction {
  id: string
  target_type: ReactionTarget
  target_id: string
  user_id: string
}

export interface LetterReply {
  id: string
  letter_id: string
  author_id: string
  body: string
  created_at: string
}

export interface LetterOpen {
  letter_id: string
  user_id: string
  opened_at: string
}

export interface Letter {
  id: string
  space_id: string
  author_id: string
  title: string | null
  body: string
  status: 'draft' | 'sent'
  sent_at: string | null
  created_at: string
  updated_at: string
  replies: LetterReply[]
  opens: LetterOpen[]
}

export interface LetterInput {
  title: string | null
  body: string
  status: 'draft' | 'sent'
}

export interface QuickNote {
  id: string
  space_id: string
  author_id: string
  body: string
  created_at: string
}

export interface ChatMessage {
  id: string
  space_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface ChatRead {
  user_id: string
  last_read_at: string
}

export interface ChatHandlers {
  onMessage?: (message: ChatMessage) => void
  onDelete?: (id: string) => void
  onRead?: (read: ChatRead) => void
}

export interface DoodleStroke {
  id: string
  space_id: string
  author_id: string
  color: string
  width: number
  /** [x1, y1, x2, y2, …], each between 0 and 1 */
  points: number[]
  created_at: string
}

export type DoodleInput = Pick<DoodleStroke, 'color' | 'width' | 'points'>

export interface DoodleHandlers {
  onStroke?: (stroke: DoodleStroke) => void
  onDelete?: (id: string) => void
}

// ── live presence ──
export type LiveRoomName = 'doodle' | 'chat' | 'chess'

export interface LiveHandlers {
  /** something the other person broadcast (cursor, typing, live stroke…) */
  onEvent?: (event: string, payload: Record<string, unknown>, from: string) => void
  /** who is in the room right now (user ids, including you) */
  onPresence?: (userIds: string[]) => void
  /** connection state, for a gentle "reconnecting…" */
  onStatus?: (status: 'connecting' | 'live' | 'offline') => void
}

export interface LiveRoom {
  send: (event: string, payload: Record<string, unknown>) => void
  leave: () => void
}

// ── chess ──
export type ChessStatus = 'active' | 'checkmate' | 'stalemate' | 'draw' | 'resigned' | 'abandoned'

export interface ChessGame {
  id: string
  space_id: string
  white_id: string
  black_id: string
  fen: string
  moves: string[]
  last_move: string | null
  status: ChessStatus
  winner_id: string | null
  draw_offered_by: string | null
  created_at: string
  updated_at: string
}

export interface ChessMoveInput {
  expectedPly: number
  san: string
  uci: string
  fen: string
  status: 'active' | 'checkmate' | 'stalemate' | 'draw'
}

export type SpaceSettings = Pick<Space, 'first_met_on' | 'welcome_greeting' | 'featured_message'>
