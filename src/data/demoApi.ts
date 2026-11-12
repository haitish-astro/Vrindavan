/**
 * PREVIEW MODE — local development only.
 *
 * An in-memory stand-in for Supabase so the app can be explored with
 * `npm run dev` before the Supabase keys are configured. Nothing is saved:
 * everything disappears on reload. This file is never included in a
 * production build (see loadApi in api.ts).
 */
import type {
  ChessGame,
  LiveHandlers,
  ChatHandlers,
  ChatMessage,
  ChatRead,
  DoodleHandlers,
  DoodleStroke,
  Letter,
  Memory,
  MemoryNote,
  Milestone,
  Photo,
  Profile,
  QuickNote,
  Reaction,
  SessionUser,
  Space,
} from '../lib/types'
import { FriendlyError, type Api } from './api'

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))
const now = () => new Date().toISOString()
const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

// Sample content so preview mode has something to open. Never shipped.
const PREVIEW_REPLIES = ['♡', 'Thinking of you too', 'This is a preview reply', 'Can’t wait to see you']

export function createDemoApi(): Api {
  let user: SessionUser | null = null
  const listeners = new Set<(user: SessionUser | null) => void>()
  // Open a second window with ?as=partner to be "the other person" — the two windows
  // talk to each other, so live features can be tried by one person at one computer.
  const asPartner = new URLSearchParams(window.location.search).get('as') === 'partner'
  const first: Profile = { id: 'demo-me', display_name: null, own_password: false }
  const second: Profile = { id: 'demo-partner', display_name: null, own_password: true }
  const me = asPartner ? second : first
  const partner = asPartner ? first : second
  let space: Space = {
    id: 'demo-space',
    name: 'Our Little Vrindavan',
    first_met_on: null,
    welcome_greeting: null,
    featured_message: null,
  }
  let memories: Memory[] = []
  let milestones: Milestone[] = []
  let letters: Letter[] = [
    {
      id: 'demo-letter-1',
      space_id: space.id,
      author_id: partner.id,
      title: 'A preview letter',
      body: 'This is a sample letter that only exists in preview mode.\n\nWhen the app is connected to Supabase, the real letters you write to each other appear here instead.',
      status: 'sent',
      sent_at: ago(90),
      created_at: ago(120),
      updated_at: ago(90),
      replies: [],
      opens: [],
    },
  ]
  let quickNotes: QuickNote[] = [
    { id: 'demo-note-1', space_id: space.id, author_id: partner.id, body: 'A sample little note (preview mode) ♡', created_at: ago(30) },
  ]
  let reactions: Reaction[] = []
  let messages: ChatMessage[] = []
  const reads: ChatRead[] = []
  let strokes: DoodleStroke[] = []
  const chatSubs = new Set<ChatHandlers>()
  const doodleSubs = new Set<DoodleHandlers>()
  const files = new Map<string, string>()

  const store = (path: string, blob: Blob) => files.set(path, URL.createObjectURL(blob))
  const emit = () => listeners.forEach((l) => l(user))
  const find = (id: string) => memories.find((m) => m.id === id)
  const copyLetter = (l: Letter): Letter => ({ ...l, replies: [...l.replies], opens: [...l.opens] })

  const setRead = (userId: string) => {
    const read = { user_id: userId, last_read_at: now() }
    const existing = reads.findIndex((r) => r.user_id === userId)
    if (existing >= 0) reads[existing] = read
    else reads.push(read)
    chatSubs.forEach((s) => s.onRead?.(read))
  }

  // ── cross-window bus (preview only) ──
  type BusMessage =
    | { kind: 'room'; topic: string; event: string; payload: Record<string, unknown>; from: string }
    | { kind: 'presence'; topic: string; userId: string; here: boolean }
    | { kind: 'message'; data: ChatMessage }
    | { kind: 'unsend'; id: string }
    | { kind: 'read'; data: ChatRead }
    | { kind: 'stroke'; data: DoodleStroke }
    | { kind: 'unstroke'; id: string }
    | { kind: 'chess'; data: ChessGame }
  const bus = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vrindavan-preview') : null
  let otherWindowSeen = 0
  const post = (message: BusMessage) => bus?.postMessage(message)

  interface DemoRoom {
    handlers: Set<LiveHandlers>
    peers: Map<string, number>
    heartbeat?: ReturnType<typeof setInterval>
  }
  const demoRooms = new Map<string, DemoRoom>()
  const announce = (topic: string) => {
    const room = demoRooms.get(topic)
    if (!room) return
    const cutoff = Date.now() - 4500
    room.peers.forEach((seen, id) => {
      if (seen < cutoff) room.peers.delete(id)
    })
    const ids = [me.id, ...room.peers.keys()]
    room.handlers.forEach((h) => h.onPresence?.(ids))
  }

  let chessGame: ChessGame | null = null
  const chessSubs = new Set<(game: ChessGame) => void>()

  bus?.addEventListener('message', (event: MessageEvent<BusMessage>) => {
    const m = event.data
    otherWindowSeen = Date.now()
    if (m.kind === 'room') {
      demoRooms.get(m.topic)?.handlers.forEach((h) => h.onEvent?.(m.event, m.payload, m.from))
    } else if (m.kind === 'presence') {
      const room = demoRooms.get(m.topic)
      if (!room) return
      if (m.here) {
        const isNew = !room.peers.has(m.userId)
        room.peers.set(m.userId, Date.now())
        if (isNew) post({ kind: 'presence', topic: m.topic, userId: me.id, here: true })
      } else room.peers.delete(m.userId)
      announce(m.topic)
    } else if (m.kind === 'message') {
      if (!messages.some((x) => x.id === m.data.id)) messages.push(m.data)
      chatSubs.forEach((sub) => sub.onMessage?.(m.data))
    } else if (m.kind === 'unsend') {
      messages = messages.filter((x) => x.id !== m.id)
      chatSubs.forEach((sub) => sub.onDelete?.(m.id))
    } else if (m.kind === 'read') {
      const i = reads.findIndex((r) => r.user_id === m.data.user_id)
      if (i >= 0) reads[i] = m.data
      else reads.push(m.data)
      chatSubs.forEach((sub) => sub.onRead?.(m.data))
    } else if (m.kind === 'stroke') {
      if (!strokes.some((x) => x.id === m.data.id)) strokes.push(m.data)
      doodleSubs.forEach((sub) => sub.onStroke?.(m.data))
    } else if (m.kind === 'unstroke') {
      strokes = strokes.filter((x) => x.id !== m.id)
      doodleSubs.forEach((sub) => sub.onDelete?.(m.id))
    } else if (m.kind === 'chess') {
      chessGame = m.data
      chessSubs.forEach((fn) => fn(m.data))
    }
  })

  const saveChess = (game: ChessGame) => {
    chessGame = game
    chessSubs.forEach((fn) => fn(game))
    post({ kind: 'chess', data: game })
  }

  /** In preview (single window), "they" read your message and send a little reply. */
  const partnerResponds = () => {
    if (Date.now() - otherWindowSeen < 8000) return // a real second window is answering instead
    setTimeout(() => setRead(partner.id), 900)
    setTimeout(() => {
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        space_id: space.id,
        sender_id: partner.id,
        body: PREVIEW_REPLIES[Math.floor(Math.random() * PREVIEW_REPLIES.length)]!,
        created_at: now(),
      }
      messages.push(reply)
      chatSubs.forEach((s) => s.onMessage?.(reply))
    }, 2200)
  }

  return {
    mode: 'preview',

    async getUser() {
      return user
    },
    onAuthChange(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    async signInWithPassword(email) {
      await wait()
      user = { id: me.id, email }
      emit()
    },
    async changePassword() {
      await wait()
      me.own_password = true
    },
    async sendCode() {
      await wait()
    },
    async verifyCode(email) {
      await wait()
      user = { id: me.id, email }
      emit()
    },
    async signOut() {
      user = null
      emit()
    },

    async loadWorld() {
      await wait()
      return { space, me: { ...me }, members: [{ ...me }, partner] }
    },
    async updateSettings(_spaceId, patch) {
      await wait()
      space = { ...space, ...patch }
      return space
    },
    async updateMyName(name) {
      await wait()
      me.display_name = name
      return { ...me }
    },

    async listMemories() {
      await wait()
      return [...memories].sort((a, b) => b.happened_on.localeCompare(a.happened_on))
    },
    async getMemory(id) {
      await wait(150)
      const memory = find(id)
      return memory ? { ...memory, photos: [...memory.photos], notes: [...memory.notes] } : null
    },
    async createMemory(spaceId, input) {
      await wait()
      const memory: Memory = {
        ...input,
        id: crypto.randomUUID(),
        space_id: spaceId,
        created_by: me.id,
        created_at: now(),
        photos: [],
        notes: [],
      }
      memories.push(memory)
      return memory
    },
    async updateMemory(id, input) {
      await wait()
      const memory = find(id)
      if (memory) Object.assign(memory, input)
    },
    async deleteMemory(memory) {
      await wait()
      memories = memories.filter((m) => m.id !== memory.id)
    },
    async addPhoto(memory, image, sortOrder, onProgress) {
      for (const step of [0.2, 0.5, 0.8, 1]) {
        await wait(120)
        onProgress(step)
      }
      const id = crypto.randomUUID()
      const photo: Photo = {
        id,
        memory_id: memory.id,
        space_id: memory.space_id,
        uploaded_by: me.id,
        storage_path: `${memory.space_id}/${memory.id}/${id}.jpg`,
        thumb_path: `${memory.space_id}/${memory.id}/${id}_thumb.jpg`,
        width: image.width,
        height: image.height,
        sort_order: sortOrder,
        created_at: now(),
      }
      store(photo.storage_path, image.full)
      store(photo.thumb_path!, image.thumb)
      find(memory.id)?.photos.push(photo)
      return photo
    },
    async deletePhoto(photo) {
      await wait()
      const memory = find(photo.memory_id)
      if (memory) memory.photos = memory.photos.filter((p) => p.id !== photo.id)
    },
    async saveNote(memory, existing, input) {
      await wait()
      const target = find(memory.id)
      const note: MemoryNote = {
        id: existing?.id ?? crypto.randomUUID(),
        memory_id: memory.id,
        author_id: me.id,
        ...input,
        updated_at: now(),
      }
      if (target) target.notes = [...target.notes.filter((n) => n.id !== note.id), note]
      return note
    },

    async listMilestones() {
      await wait()
      return [...milestones].sort((a, b) => a.happened_on.localeCompare(b.happened_on))
    },
    async createMilestone(spaceId, input, image) {
      await wait()
      const id = crypto.randomUUID()
      let photoPath: string | null = null
      if (image) {
        photoPath = `${spaceId}/milestones/${id}.jpg`
        store(photoPath, image.full)
      }
      const milestone: Milestone = {
        ...input,
        id,
        space_id: spaceId,
        created_by: me.id,
        photo_path: photoPath,
        created_at: now(),
      }
      milestones.push(milestone)
      return milestone
    },
    async updateMilestone(milestone, input, image) {
      await wait()
      let photoPath = milestone.photo_path
      if (image) {
        photoPath = `${milestone.space_id}/milestones/${crypto.randomUUID()}.jpg`
        store(photoPath, image.full)
      } else if (image === null) {
        photoPath = null
      }
      const updated = { ...milestone, ...input, photo_path: photoPath }
      milestones = milestones.map((m) => (m.id === milestone.id ? updated : m))
      return updated
    },
    async deleteMilestone(milestone) {
      await wait()
      milestones = milestones.filter((m) => m.id !== milestone.id)
    },

    // ── letters ──
    async listLetters() {
      await wait()
      return letters
        .filter((l) => l.status === 'sent' || l.author_id === me.id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map(copyLetter)
    },
    async getLetter(id) {
      await wait(150)
      const letter = letters.find((l) => l.id === id && (l.status === 'sent' || l.author_id === me.id))
      return letter ? copyLetter(letter) : null
    },
    async saveLetter(spaceId, existing, input) {
      await wait()
      if (existing) {
        const current = letters.find((l) => l.id === existing.id)!
        const sentNow = current.status === 'draft' && input.status === 'sent'
        Object.assign(current, input, { updated_at: now(), sent_at: sentNow ? now() : current.sent_at })
        return copyLetter(current)
      }
      const letter: Letter = {
        ...input,
        id: crypto.randomUUID(),
        space_id: spaceId,
        author_id: me.id,
        sent_at: input.status === 'sent' ? now() : null,
        created_at: now(),
        updated_at: now(),
        replies: [],
        opens: [],
      }
      letters.push(letter)
      return copyLetter(letter)
    },
    async deleteLetter(id) {
      await wait()
      letters = letters.filter((l) => l.id !== id)
    },
    async markLetterOpened(letter) {
      const target = letters.find((l) => l.id === letter.id)
      if (target && !target.opens.some((o) => o.user_id === me.id)) {
        target.opens.push({ letter_id: letter.id, user_id: me.id, opened_at: now() })
      }
    },
    async addLetterReply(letter, body) {
      await wait()
      const reply = { id: crypto.randomUUID(), letter_id: letter.id, author_id: me.id, body, created_at: now() }
      letters.find((l) => l.id === letter.id)?.replies.push(reply)
      return reply
    },
    async deleteLetterReply(id) {
      await wait()
      letters.forEach((l) => (l.replies = l.replies.filter((r) => r.id !== id)))
    },

    // ── little notes ──
    async listQuickNotes(_spaceId, limit = 60) {
      await wait()
      return [...quickNotes].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit)
    },
    async addQuickNote(spaceId, body) {
      await wait()
      const note: QuickNote = { id: crypto.randomUUID(), space_id: spaceId, author_id: me.id, body, created_at: now() }
      quickNotes.push(note)
      return note
    },
    async deleteQuickNote(id) {
      await wait()
      quickNotes = quickNotes.filter((n) => n.id !== id)
    },

    // ── hearts ──
    async listReactions(type, targetIds) {
      return reactions.filter((r) => r.target_type === type && targetIds.includes(r.target_id))
    },
    async setHeart(_spaceId, type, targetId, on) {
      await wait(150)
      reactions = reactions.filter((r) => !(r.target_type === type && r.target_id === targetId && r.user_id === me.id))
      if (on) reactions.push({ id: crypto.randomUUID(), target_type: type, target_id: targetId, user_id: me.id })
    },

    // ── chat ──
    async listMessages(_spaceId, before, limit = 60) {
      await wait()
      const older = before ? messages.filter((m) => m.created_at < before) : messages
      return older.slice(-limit)
    },
    async sendMessage(spaceId, body) {
      await wait(200)
      const message: ChatMessage = { id: crypto.randomUUID(), space_id: spaceId, sender_id: me.id, body, created_at: now() }
      messages.push(message)
      chatSubs.forEach((s) => s.onMessage?.(message))
      post({ kind: 'message', data: message })
      partnerResponds()
      return message
    },
    async deleteMessage(id) {
      await wait()
      messages = messages.filter((m) => m.id !== id)
      chatSubs.forEach((s) => s.onDelete?.(id))
      post({ kind: 'unsend', id })
    },
    async listChatReads() {
      return reads.map((r) => ({ ...r }))
    },
    async markChatRead() {
      setRead(me.id)
      post({ kind: 'read', data: reads.find((r) => r.user_id === me.id)! })
    },
    async countUnread(_spaceId, since) {
      return messages.filter((m) => m.sender_id !== me.id && (!since || m.created_at > since)).length
    },
    subscribeChat(_spaceId, handlers) {
      chatSubs.add(handlers)
      return () => chatSubs.delete(handlers)
    },

    // ── doodle board ──
    async listStrokes() {
      await wait()
      return [...strokes]
    },
    async addStroke(spaceId, input) {
      await wait(80)
      const stroke: DoodleStroke = { ...input, id: crypto.randomUUID(), space_id: spaceId, author_id: me.id, created_at: now() }
      strokes.push(stroke)
      doodleSubs.forEach((s) => s.onStroke?.(stroke))
      post({ kind: 'stroke', data: stroke })
      return stroke
    },
    async deleteStroke(id) {
      await wait(80)
      strokes = strokes.filter((s) => s.id !== id)
      doodleSubs.forEach((s) => s.onDelete?.(id))
      post({ kind: 'unstroke', id })
    },
    async clearBoard() {
      await wait()
      const ids = strokes.map((s) => s.id)
      strokes = []
      ids.forEach((id) => {
        doodleSubs.forEach((s) => s.onDelete?.(id))
        post({ kind: 'unstroke', id })
      })
    },
    subscribeDoodles(_spaceId, handlers) {
      doodleSubs.add(handlers)
      return () => doodleSubs.delete(handlers)
    },

    // ── live presence (between preview windows) ──
    joinRoom(spaceId, roomName, _userId, handlers) {
      const topic = `space:${spaceId}:${roomName}`
      let room = demoRooms.get(topic)
      if (!room) {
        const created: DemoRoom = { handlers: new Set(), peers: new Map() }
        created.heartbeat = setInterval(() => {
          post({ kind: 'presence', topic, userId: me.id, here: true })
          announce(topic)
        }, 1500)
        demoRooms.set(topic, created)
        post({ kind: 'presence', topic, userId: me.id, here: true })
        room = created
      }
      const r = room
      r.handlers.add(handlers)
      handlers.onStatus?.('live')
      announce(topic)
      let left = false
      return {
        send(event, payload) {
          if (!left) post({ kind: 'room', topic, event, payload: { ...payload, from: me.id }, from: me.id })
        },
        leave() {
          if (left) return
          left = true
          r.handlers.delete(handlers)
          if (r.handlers.size === 0) {
            clearInterval(r.heartbeat)
            demoRooms.delete(topic)
            post({ kind: 'presence', topic, userId: me.id, here: false })
          }
        },
      }
    },

    // ── chess ──
    async latestChessGame() {
      await wait(150)
      return chessGame ? { ...chessGame, moves: [...chessGame.moves] } : null
    },
    async newChessGame(playAs) {
      await wait()
      const meWhite = playAs === 'white' ? true : playAs === 'black' ? false : Math.random() < 0.5
      saveChess({
        id: crypto.randomUUID(),
        space_id: space.id,
        white_id: meWhite ? me.id : partner.id,
        black_id: meWhite ? partner.id : me.id,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: [],
        last_move: null,
        status: 'active',
        winner_id: null,
        draw_offered_by: null,
        created_at: now(),
        updated_at: now(),
      })
    },
    async chessMove(gameId, move) {
      await wait(120)
      const game = chessGame
      if (!game || game.id !== gameId) throw new FriendlyError('Game not found.')
      if (game.status !== 'active') throw new FriendlyError('This game is already over.')
      if (game.moves.length !== move.expectedPly) throw new FriendlyError('The board changed — here is the latest position.')
      const mover = move.expectedPly % 2 === 0 ? game.white_id : game.black_id
      if (mover !== me.id) throw new FriendlyError('It is not your turn yet.')
      saveChess({
        ...game,
        fen: move.fen,
        moves: [...game.moves, move.san],
        last_move: move.uci,
        status: move.status,
        winner_id: move.status === 'checkmate' ? me.id : null,
        draw_offered_by: null,
        updated_at: now(),
      })
    },
    async chessResign(gameId) {
      await wait()
      const game = chessGame
      if (!game || game.id !== gameId) return
      saveChess({
        ...game,
        status: 'resigned',
        winner_id: game.white_id === me.id ? game.black_id : game.white_id,
        draw_offered_by: null,
        updated_at: now(),
      })
    },
    async chessDraw(gameId) {
      await wait()
      const game = chessGame
      if (!game || game.id !== gameId) return 'offered'
      if (game.draw_offered_by && game.draw_offered_by !== me.id) {
        saveChess({ ...game, status: 'draw', draw_offered_by: null, updated_at: now() })
        return 'agreed'
      }
      saveChess({ ...game, draw_offered_by: me.id, updated_at: now() })
      return 'offered'
    },
    subscribeChess(_spaceId, onGame) {
      chessSubs.add(onGame)
      return () => {
        chessSubs.delete(onGame)
      }
    },

    async photoUrl(path) {
      const url = files.get(path)
      if (!url) throw new Error('Photo unavailable')
      return url
    },
  }
}
