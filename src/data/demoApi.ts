/**
 * PREVIEW MODE — local development only.
 *
 * An in-memory stand-in for Supabase so the app can be explored with
 * `npm run dev` before the Supabase keys are configured. Nothing is saved:
 * everything disappears on reload. This file is never included in a
 * production build (see loadApi in api.ts).
 */
import { drawerPoints, guesserPoints, pictIsRight, pictMask } from '../lib/pictionary'
import type {
  Game,
  PictStroke,
  PictStrokeHandlers,
  PictWord,
  MessageReaction,
  CalendarEvent,
  ScheduleBlock,
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
  let events: CalendarEvent[] = []
  // A sample week for "them", in another time zone, so the converted view can be seen in preview.
  let blocks: ScheduleBlock[] = [
    ...[1, 2, 3, 4, 5].map((weekday) => ({
      id: `demo-work-${weekday}`,
      space_id: 'demo-space',
      user_id: partner.id,
      label: 'Work (preview)',
      weekday,
      start_minute: 9 * 60,
      end_minute: 17 * 60 + 30,
      tz: 'America/New_York',
      created_at: now(),
    })),
    ...[0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      id: `demo-sleep-${weekday}`,
      space_id: 'demo-space',
      user_id: partner.id,
      label: 'Sleep (preview)',
      weekday,
      start_minute: 23 * 60,
      end_minute: 7 * 60,
      tz: 'America/New_York',
      created_at: now(),
    })),
  ]
  const chatSubs = new Set<ChatHandlers>()
  const doodleSubs = new Set<DoodleHandlers>()
  const files = new Map<string, string>()
  const sizes = new Map<string, number>()

  const store = (path: string, blob: Blob) => {
    sizes.set(path, blob.size)
    files.set(path, URL.createObjectURL(blob))
  }
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
    | { kind: 'presence'; topic: string; userId: string; here: boolean; state?: Record<string, unknown> }
    | { kind: 'message'; data: ChatMessage }
    | { kind: 'unsend'; id: string }
    | { kind: 'read'; data: ChatRead }
    | { kind: 'stroke'; data: DoodleStroke }
    | { kind: 'unstroke'; id: string }
    | { kind: 'chess'; data: ChessGame }
    | { kind: 'reaction'; data: MessageReaction }
    | { kind: 'game'; data: Game }
    | { kind: 'secret'; key: string; data: Record<string, any> }
    | { kind: 'pstroke'; data: PictStroke }
    | { kind: 'unpstroke'; id: string }
    | { kind: 'pword'; data: PictWord }
    | { kind: 'unpword'; id: string }
    | { kind: 'unreaction'; id: string; messageId: string }
  const bus = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('vrindavan-preview') : null
  let otherWindowSeen = 0
  const post = (message: BusMessage) => bus?.postMessage(message)

  interface DemoRoom {
    handlers: Set<LiveHandlers>
    peers: Map<string, number>
    heartbeat?: ReturnType<typeof setInterval>
  }
  const demoRooms = new Map<string, DemoRoom>()
  const myStates = new Map<string, Record<string, unknown>>()
  const peerStates = new Map<string, Record<string, unknown>>() // `${topic}|${userId}` → state
  const seenAt: Partial<Record<string, string>> = {}
  const announce = (topic: string) => {
    const room = demoRooms.get(topic)
    if (!room) return
    const cutoff = Date.now() - 4500
    room.peers.forEach((seen, id) => {
      if (seen < cutoff) room.peers.delete(id)
    })
    const ids = [me.id, ...room.peers.keys()]
    const states = Object.fromEntries(ids.map((id) => [id, id === me.id ? (myStates.get(topic) ?? {}) : (peerStates.get(`${topic}|${id}`) ?? {})]))
    room.handlers.forEach((h) => {
      h.onPresence?.(ids)
      h.onPresenceState?.(states)
    })
  }

  let chessGame: ChessGame | null = null
  let games: Game[] = []
  const secrets = new Map<string, Record<string, any>>() // `${gameId}|${userId}`
  const gameSubs = new Set<(game: Game) => void>()
  const saveGame = (game: Game) => {
    games = [...games.filter((g) => g.id !== game.id), game]
    gameSubs.forEach((fn) => fn(game))
    post({ kind: 'game', data: game })
  }
  const saveSecret = (gameId: string, userId: string, secret: Record<string, any>) => {
    const key = `${gameId}|${userId}`
    secrets.set(key, secret)
    post({ kind: 'secret', key, data: secret })
  }
  const gameFor = (id: string) => {
    const g = games.find((x) => x.id === id)
    if (!g) throw new FriendlyError('Game not found.')
    return g
  }
  const pictLoad = (gameId: string, phase: string, role: 'drawer' | 'guesser') => {
    const g = gameFor(gameId)
    if (g.kind !== 'pictionary') throw new FriendlyError('Game not found.')
    if (g.status !== 'active') throw new FriendlyError('This game has moved on — here is the latest.')
    if (g.state.phase !== phase) throw new FriendlyError('The round moved on — here is the latest.')
    const drawerId = g.state.drawer === 'p1' ? g.p1_id : g.p2_id
    if (role === 'drawer' && drawerId !== me.id) throw new FriendlyError('It is not your turn to draw.')
    if (role === 'guesser' && drawerId === me.id) throw new FriendlyError('You are the one drawing this round.')
    return g
  }
  const pictWord = (g: Game): string => {
    const drawerId = g.state.drawer === 'p1' ? g.p1_id : g.p2_id
    const secret = secrets.get(`${g.id}|${drawerId}`)
    if (!secret || secret.round !== g.state.round) throw new FriendlyError('The word is missing — ask them to pick again.')
    return secret.word as string
  }
  const pictNext = (g: Game, word: string, gp: number, dp: number, how: 'guessed' | 'gave_up') => {
    const drawer: 'p1' | 'p2' = g.state.drawer
    const guesser: 'p1' | 'p2' = drawer === 'p1' ? 'p2' : 'p1'
    const scores = { ...g.state.scores, [drawer]: (g.state.scores?.[drawer] ?? 0) + dp, [guesser]: (g.state.scores?.[guesser] ?? 0) + gp }
    const entry = { round: g.state.round, drawer, word, how, wrong: (g.state.guesses ?? []).length, hints: g.state.hints ?? 0, guesser_points: gp, drawer_points: dp }
    const state = { ...g.state, scores, history: [...(g.state.history ?? []), entry], last: { round: g.state.round, word, how, guesser_points: gp, drawer_points: dp } }
    if (g.state.round >= g.state.rounds) {
      saveGame({
        ...g,
        state: { ...state, phase: 'done', mask: null, guesses: [], shown: [] },
        status: 'finished',
        turn_id: null,
        winner_id: scores.p1 > scores.p2 ? g.p1_id : scores.p2 > scores.p1 ? g.p2_id : null,
        version: g.version + 1,
        updated_at: now(),
      })
    } else {
      saveGame({
        ...g,
        state: { ...state, round: g.state.round + 1, drawer: guesser, phase: 'choosing', mask: null, guesses: [], shown: [], hints: 0 },
        turn_id: guesser === 'p1' ? g.p1_id : g.p2_id,
        version: g.version + 1,
        updated_at: now(),
      })
    }
  }
  const chessSubs = new Set<(game: ChessGame) => void>()
  let pictStrokes: PictStroke[] = []
  let pictWords: PictWord[] = []
  const pictSubs = new Map<string, Set<PictStrokeHandlers>>() // by game id
  const pictEmit = (gameId: string, fn: (h: PictStrokeHandlers) => void) => pictSubs.get(gameId)?.forEach(fn)

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
        if (m.state) peerStates.set(`${m.topic}|${m.userId}`, m.state)
        if (isNew) post({ kind: 'presence', topic: m.topic, userId: me.id, here: true, state: myStates.get(m.topic) })
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
    } else if (m.kind === 'game') {
      games = [...games.filter((g) => g.id !== m.data.id), m.data]
      gameSubs.forEach((fn) => fn(m.data))
    } else if (m.kind === 'secret') {
      secrets.set(m.key, m.data)
    } else if (m.kind === 'pstroke') {
      if (!pictStrokes.some((x) => x.id === m.data.id)) pictStrokes.push(m.data)
      pictEmit(m.data.game_id, (h) => h.onStroke?.(m.data))
    } else if (m.kind === 'unpstroke') {
      const gone = pictStrokes.find((x) => x.id === m.id)
      pictStrokes = pictStrokes.filter((x) => x.id !== m.id)
      if (gone) pictEmit(gone.game_id, (h) => h.onDelete?.(m.id))
    } else if (m.kind === 'pword') {
      if (!pictWords.some((x) => x.id === m.data.id)) pictWords.push(m.data)
    } else if (m.kind === 'unpword') {
      pictWords = pictWords.filter((x) => x.id !== m.id)
    } else if (m.kind === 'reaction') {
      const target = messages.find((x) => x.id === m.data.message_id)
      if (target) target.reactions = [...(target.reactions ?? []).filter((r) => r.user_id !== m.data.user_id), m.data]
      chatSubs.forEach((sub) => sub.onReaction?.(m.data))
    } else if (m.kind === 'unreaction') {
      const target = messages.find((x) => x.id === m.messageId)
      if (target) target.reactions = (target.reactions ?? []).filter((r) => r.id !== m.id)
      chatSubs.forEach((sub) => sub.onReactionRemoved?.(m.id))
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
    async createMemory(spaceId, input, kind = 'adventure') {
      await wait()
      const memory: Memory = {
        ...input,
        kind,
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
    async addPhoto(memory, media, sortOrder, onProgress) {
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
        width: media.width,
        height: media.height,
        sort_order: sortOrder,
        created_at: now(),
      }
      if ('video' in media) {
        photo.kind = 'video'
        photo.duration_seconds = media.duration
        photo.storage_path = photo.storage_path.replace(/\.jpg$/, `.${media.ext}`)
        store(photo.storage_path, media.video)
        if (media.poster) store(photo.thumb_path!, media.poster)
        else photo.thumb_path = null
      } else {
        store(photo.storage_path, media.full)
        store(photo.thumb_path!, media.thumb)
      }
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
    async sendMessage(spaceId, body, image, onProgress) {
      await wait(200)
      const message: ChatMessage = { id: crypto.randomUUID(), space_id: spaceId, sender_id: me.id, body, created_at: now(), reactions: [] }
      if (image) {
        for (const step of [0.3, 0.7, 1]) {
          await wait(120)
          onProgress?.(step)
        }
        message.image_path = `${spaceId}/chat/${crypto.randomUUID()}.jpg`
        message.image_width = image.width
        message.image_height = image.height
        store(message.image_path, image.full)
        store(message.image_path.replace(/\.jpg$/, '_thumb.jpg'), image.thumb)
      }
      messages.push(message)
      chatSubs.forEach((s) => s.onMessage?.(message))
      post({ kind: 'message', data: message })
      partnerResponds()
      return message
    },
    async deleteMessage(message) {
      await wait()
      const id = message.id
      messages = messages.filter((m) => m.id !== id)
      chatSubs.forEach((s) => s.onDelete?.(id))
      post({ kind: 'unsend', id })
    },
    async reactToMessage(messageId, emoji) {
      await wait(120)
      const target = messages.find((m) => m.id === messageId)
      if (!target) throw new FriendlyError('Message not found.')
      const existing = (target.reactions ?? []).find((r) => r.user_id === me.id)
      target.reactions = (target.reactions ?? []).filter((r) => r.user_id !== me.id)
      if (emoji) {
        const reaction = { id: existing?.id ?? crypto.randomUUID(), message_id: messageId, user_id: me.id, emoji }
        target.reactions.push(reaction)
        chatSubs.forEach((s) => s.onReaction?.(reaction))
        post({ kind: 'reaction', data: reaction })
      } else if (existing) {
        chatSubs.forEach((s) => s.onReactionRemoved?.(existing.id))
        post({ kind: 'unreaction', id: existing.id, messageId })
      }
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

    // ── calendar ──
    async listEvents() {
      await wait()
      return [...events].sort((a, b) => a.event_date.localeCompare(b.event_date))
    },
    async saveEvent(spaceId, existing, input) {
      await wait()
      if (existing) {
        const updated = { ...existing, ...input }
        events = events.map((e) => (e.id === existing.id ? updated : e))
        return updated
      }
      const created: CalendarEvent = { ...input, id: crypto.randomUUID(), space_id: spaceId, created_by: me.id, created_at: now() }
      events.push(created)
      return created
    },
    async deleteEvent(id) {
      await wait()
      events = events.filter((e) => e.id !== id)
    },

    // ── our week ──
    async listBlocks() {
      await wait()
      return [...blocks]
    },
    async addBlocks(spaceId, inputs) {
      await wait()
      const created = inputs.map((input) => ({
        ...input,
        id: crypto.randomUUID(),
        space_id: spaceId,
        user_id: me.id,
        created_at: now(),
      }))
      blocks.push(...created)
      return created
    },
    async updateBlock(id, input) {
      await wait()
      const updated = { ...blocks.find((b) => b.id === id)!, ...input }
      blocks = blocks.map((b) => (b.id === id ? updated : b))
      return updated
    },
    async deleteBlock(id) {
      await wait()
      blocks = blocks.filter((b) => b.id !== id)
    },

    // ── live presence (between preview windows) ──
    joinRoom(spaceId, roomName, _userId, handlers) {
      const topic = `space:${spaceId}:${roomName}`
      let room = demoRooms.get(topic)
      if (!room) {
        const created: DemoRoom = { handlers: new Set(), peers: new Map() }
        created.heartbeat = setInterval(() => {
          post({ kind: 'presence', topic, userId: me.id, here: true, state: myStates.get(topic) })
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
        track(state) {
          if (left) return
          myStates.set(topic, state)
          post({ kind: 'presence', topic, userId: me.id, here: true, state })
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

    // ── being together ──
    async touchLastSeen() {},
    async storageUsage() {
      let photoBytes = 0, videoBytes = 0, photoFiles = 0, videoFiles = 0
      sizes.forEach((size, path) => {
        if (/\.(mp4|mov|webm)$/i.test(path)) {
          videoBytes += size
          videoFiles++
        } else {
          photoBytes += size
          if (!path.endsWith('_thumb.jpg')) photoFiles++
        }
      })
      return { photoBytes, videoBytes, photoFiles, videoFiles }
    },
    async markSeen(section) {
      seenAt[section] = now()
    },
    async countUpdates() {
      const since = (s: string) => seenAt[s] ?? new Date(Date.now() - 7 * 86_400_000).toISOString()
      const newer = (list: { created_at: string }[], s: string) => list.filter((x) => x.created_at > since(s)).length
      return {
        memories: newer(memories.filter((m) => m.created_by !== me.id), 'memories'),
        letters:
          letters.filter((l) => l.status === 'sent' && l.author_id !== me.id && (l.sent_at ?? '') > since('letters')).length +
          newer(quickNotes.filter((n) => n.author_id !== me.id), 'letters'),
        calendar: newer(events.filter((e) => e.created_by !== me.id), 'calendar'),
        doodles: newer(strokes.filter((s) => s.author_id !== me.id), 'world'),
        chessTurn: Boolean(
          chessGame && chessGame.status === 'active' && (chessGame.moves.length % 2 === 0 ? chessGame.white_id : chessGame.black_id) === me.id,
        ),
        games: games.filter((g) => {
          if (g.status !== 'active' && g.status !== 'setup') return false
          const key = g.p1_id === me.id ? 'p1' : 'p2'
          return (
            g.turn_id === me.id ||
            (g.kind === 'sea_battle' && g.status === 'setup' && !g.state.ready?.[key]) ||
            (g.kind === 'quiz' && g.status === 'active' && !g.state.submitted?.[key])
          )
        }).length,
      }
    },

    // ── games corner (same rules as the database functions) ──
    async listGames() {
      await wait(120)
      return games.filter((g) => g.status !== 'abandoned').sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
    async latestGame(_spaceId, kind) {
      await wait(120)
      return games.filter((g) => g.kind === kind).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
    },
    async newGame(kind, initial) {
      await wait()
      games.filter((g) => g.kind === kind && (g.status === 'active' || g.status === 'setup')).forEach((g) => saveGame({ ...g, status: 'abandoned', turn_id: null }))
      const first = Math.random() < 0.5 ? me.id : partner.id
      saveGame({
        id: crypto.randomUUID(),
        space_id: space.id,
        kind,
        status: kind === 'sea_battle' ? 'setup' : 'active',
        p1_id: me.id,
        p2_id: partner.id,
        turn_id: kind === 'sea_battle' || kind === 'quiz' ? null : first,
        winner_id: null,
        state: { ...initial, first },
        version: 0,
        created_at: now(),
        updated_at: now(),
      })
    },
    async gameMove(game, state, nextTurn, outcome) {
      await wait(100)
      const g = gameFor(game.id)
      if (g.status !== 'active') throw new FriendlyError('This game has moved on — here is the latest.')
      if (g.version !== game.version) throw new FriendlyError('The board changed — here is the latest.')
      if (g.turn_id !== me.id) throw new FriendlyError('It is not your turn yet.')
      saveGame({
        ...g,
        state,
        version: g.version + 1,
        turn_id: outcome === 'continue' ? nextTurn : null,
        status: outcome === 'continue' ? 'active' : 'finished',
        winner_id: outcome === 'win' ? me.id : null,
        updated_at: now(),
      })
    },
    async gameResign(gameId) {
      await wait()
      const g = gameFor(gameId)
      saveGame({ ...g, status: 'finished', turn_id: null, winner_id: g.p1_id === me.id ? g.p2_id : g.p1_id, state: { ...g.state, resigned: me.id }, version: g.version + 1 })
    },
    async seaPlace(gameId, ships) {
      await wait()
      const g = gameFor(gameId)
      if (g.status !== 'setup') throw new FriendlyError('The fleets are already placed.')
      saveSecret(gameId, me.id, { ships })
      const key = g.p1_id === me.id ? 'p1' : 'p2'
      const state = { ...g.state, ready: { ...(g.state.ready ?? {}), [key]: true } }
      const both = state.ready.p1 && state.ready.p2
      saveGame({ ...g, state, status: both ? 'active' : 'setup', turn_id: both ? (g.state.first ?? g.p1_id) : null, version: g.version + 1 })
    },
    async seaFire(gameId, version, cell) {
      await wait(120)
      const g = gameFor(gameId)
      if (g.status !== 'active') throw new FriendlyError('This game has moved on — here is the latest.')
      if (g.version !== version) throw new FriendlyError('The board changed — here is the latest.')
      if (g.turn_id !== me.id) throw new FriendlyError('It is not your turn yet.')
      const key = g.p1_id === me.id ? 'p1' : 'p2'
      const them = g.p1_id === me.id ? g.p2_id : g.p1_id
      const shots: { c: number; h: boolean }[] = g.state.shots?.[key] ?? []
      if (shots.some((x) => x.c === cell)) throw new FriendlyError('You already fired there.')
      const fleet: number[][] = secrets.get(`${gameId}|${them}`)?.ships ?? []
      const ship = fleet.find((sh) => sh.includes(cell))
      const hit = Boolean(ship)
      const sunk = Boolean(ship && ship.every((c) => c === cell || shots.some((x) => x.c === c && x.h)))
      const nextShots = [...shots, { c: cell, h: hit }]
      const won = nextShots.filter((x) => x.h).length >= 17
      const state: Record<string, any> = {
        ...g.state,
        shots: { ...(g.state.shots ?? {}), [key]: nextShots },
        last: { by: key, c: cell, h: hit, sunk },
      }
      if (sunk && ship) state.sunk = { ...(g.state.sunk ?? {}), [key]: [...(g.state.sunk?.[key] ?? []), ship] }
      saveGame({ ...g, state, version: g.version + 1, turn_id: won ? null : them, status: won ? 'finished' : 'active', winner_id: won ? me.id : null })
      return { hit, sunk, won }
    },
    async quizPlay(gameId, answers, guesses) {
      await wait()
      const g = gameFor(gameId)
      if (g.status !== 'active') throw new FriendlyError('This game has moved on — here is the latest.')
      if (secrets.has(`${gameId}|${me.id}`)) throw new FriendlyError('You already played this round.')
      saveSecret(gameId, me.id, { answers, guesses })
      const key = g.p1_id === me.id ? 'p1' : 'p2'
      const them = g.p1_id === me.id ? g.p2_id : g.p1_id
      const theirs = secrets.get(`${gameId}|${them}`)
      if (!theirs) {
        saveGame({ ...g, state: { ...g.state, submitted: { ...(g.state.submitted ?? {}), [key]: true } }, version: g.version + 1 })
        return
      }
      const mine = { answers, guesses }
      const p1s = key === 'p1' ? mine : theirs
      const p2s = key === 'p1' ? theirs : mine
      const score = (a: number[], b: number[]) => a.filter((x, i) => x === b[i]).length
      const s1 = score(p1s.guesses, p2s.answers)
      const s2 = score(p2s.guesses, p1s.answers)
      saveGame({
        ...g,
        state: {
          ...g.state,
          submitted: { p1: true, p2: true },
          reveal: { answers: { p1: p1s.answers, p2: p2s.answers }, guesses: { p1: p1s.guesses, p2: p2s.guesses }, scores: { p1: s1, p2: s2 } },
        },
        version: g.version + 1,
        status: 'finished',
        winner_id: s1 > s2 ? g.p1_id : s2 > s1 ? g.p2_id : null,
      })
    },
    async mySecret(gameId) {
      return secrets.get(`${gameId}|${me.id}`) ?? null
    },
    subscribeGames(_spaceId, onGame) {
      gameSubs.add(onGame)
      return () => {
        gameSubs.delete(onGame)
      }
    },

    // ── pictionary (same rules as the database functions) ──
    async pictNew(rounds) {
      await wait()
      if (rounds < 2 || rounds > 20) throw new FriendlyError('Invalid game.')
      games.filter((g) => g.kind === 'pictionary' && (g.status === 'active' || g.status === 'setup')).forEach((g) => saveGame({ ...g, status: 'abandoned', turn_id: null }))
      const first = Math.random() < 0.5 ? me.id : partner.id
      saveGame({
        id: crypto.randomUUID(),
        space_id: space.id,
        kind: 'pictionary',
        status: 'active',
        p1_id: me.id,
        p2_id: partner.id,
        turn_id: first,
        winner_id: null,
        state: {
          rounds, round: 1, phase: 'choosing', drawer: first === me.id ? 'p1' : 'p2', first,
          scores: { p1: 0, p2: 0 }, history: [], guesses: [], shown: [], hints: 0, mask: null,
        },
        version: 0,
        created_at: now(),
        updated_at: now(),
      })
    },
    async pictChoose(gameId, word) {
      await wait(100)
      const g = pictLoad(gameId, 'choosing', 'drawer')
      const w = word.replace(/\s+/g, ' ').trim()
      if (w.length < 1 || w.length > 40 || !/[\p{L}\p{N}]/u.test(w)) throw new FriendlyError('Pick a word of 1 to 40 letters.')
      saveSecret(gameId, me.id, { round: g.state.round, word: w })
      saveGame({
        ...g,
        state: { ...g.state, phase: 'drawing', mask: pictMask(w, []), shown: [], guesses: [], hints: 0, started_at: now() },
        turn_id: g.p1_id === me.id ? g.p2_id : g.p1_id,
        version: g.version + 1,
        updated_at: now(),
      })
    },
    async pictRechoose(gameId) {
      await wait(100)
      const g = pictLoad(gameId, 'drawing', 'drawer')
      if ((g.state.guesses ?? []).length > 0 || (g.state.hints ?? 0) > 0) throw new FriendlyError('They have already started guessing this one.')
      pictStrokes.filter((x) => x.game_id === gameId && x.round === g.state.round).forEach((x) => {
        pictStrokes = pictStrokes.filter((y) => y.id !== x.id)
        pictEmit(gameId, (h) => h.onDelete?.(x.id))
        post({ kind: 'unpstroke', id: x.id })
      })
      saveGame({ ...g, state: { ...g.state, phase: 'choosing', mask: null, shown: [] }, turn_id: me.id, version: g.version + 1, updated_at: now() })
    },
    async pictGuess(gameId, guess) {
      await wait(120)
      const g = pictLoad(gameId, 'drawing', 'guesser')
      const t = guess.replace(/\s+/g, ' ').trim()
      if (t.length < 1 || t.length > 60) throw new FriendlyError('Type a guess (up to 60 letters).')
      const wrong = (g.state.guesses ?? []).length
      if (wrong >= 30) throw new FriendlyError('That is a lot of guesses! Ask for a hint or give up on this one.')
      const w = pictWord(g)
      if (pictIsRight(t, w)) {
        const gp = guesserPoints(wrong, g.state.hints ?? 0)
        const dp = drawerPoints(gp)
        pictNext(g, w, gp, dp, 'guessed')
        return { right: true, word: w, points: gp, drawer_points: dp }
      }
      saveGame({ ...g, state: { ...g.state, guesses: [...(g.state.guesses ?? []), t] }, version: g.version + 1, updated_at: now() })
      return { right: false }
    },
    async pictHint(gameId) {
      await wait(100)
      const g = pictLoad(gameId, 'drawing', 'guesser')
      if ((g.state.hints ?? 0) >= 3) throw new FriendlyError('No more hints for this one.')
      const w = pictWord(g)
      const shown: number[] = g.state.shown ?? []
      const hidden = [...w].map((_ch, i) => i + 1).filter((i) => /[\p{L}\p{N}]/u.test(w[i - 1]!) && !shown.includes(i))
      if (hidden.length <= 1) throw new FriendlyError('No more hints for this one.')
      const next = [...shown, hidden[Math.floor(Math.random() * hidden.length)]!]
      saveGame({ ...g, state: { ...g.state, shown: next, mask: pictMask(w, next), hints: (g.state.hints ?? 0) + 1 }, version: g.version + 1, updated_at: now() })
    },
    async pictGiveUp(gameId) {
      await wait(100)
      const g = pictLoad(gameId, 'drawing', 'guesser')
      const w = pictWord(g)
      pictNext(g, w, 0, 0, 'gave_up')
      return w
    },
    async pictStrokes(gameId) {
      await wait(100)
      return pictStrokes.filter((x) => x.game_id === gameId).sort((a, b) => a.created_at.localeCompare(b.created_at))
    },
    async pictAddStroke(gameId, round, stroke) {
      await wait(60)
      const g = gameFor(gameId)
      const drawerId = g.state.drawer === 'p1' ? g.p1_id : g.p2_id
      if (g.status !== 'active' || g.state.phase !== 'drawing' || g.state.round !== round || drawerId !== me.id) {
        throw new FriendlyError('This round has finished, so that line was not saved.')
      }
      const saved: PictStroke = { ...stroke, id: crypto.randomUUID(), game_id: gameId, round, author_id: me.id, created_at: now() }
      pictStrokes.push(saved)
      pictEmit(gameId, (h) => h.onStroke?.(saved))
      post({ kind: 'pstroke', data: saved })
      return saved
    },
    async pictDeleteStroke(id) {
      await wait(60)
      const target = pictStrokes.find((x) => x.id === id)
      if (!target || target.author_id !== me.id) return
      const g = gameFor(target.game_id)
      if (g.status !== 'active' || g.state.phase !== 'drawing' || g.state.round !== target.round) return
      pictStrokes = pictStrokes.filter((x) => x.id !== id)
      pictEmit(target.game_id, (h) => h.onDelete?.(id))
      post({ kind: 'unpstroke', id })
    },
    subscribePictStrokes(gameId, handlers) {
      const set = pictSubs.get(gameId) ?? new Set()
      set.add(handlers)
      pictSubs.set(gameId, set)
      return () => {
        set.delete(handlers)
      }
    },
    async pictWords() {
      await wait(80)
      return [...pictWords]
    },
    async pictAddWord(_spaceId, word) {
      await wait(80)
      const w = word.trim().replace(/\s+/g, ' ')
      if (w.length < 1 || w.length > 40 || !/[\p{L}\p{N}]/u.test(w)) throw new FriendlyError('Words can be 1 to 40 letters.')
      if (pictWords.some((x) => x.word.toLowerCase() === w.toLowerCase())) throw new FriendlyError('That word is already on your list.')
      const saved: PictWord = { id: crypto.randomUUID(), space_id: space.id, word: w, added_by: me.id, created_at: now() }
      pictWords.push(saved)
      post({ kind: 'pword', data: saved })
      return saved
    },
    async pictRemoveWord(id) {
      await wait(80)
      pictWords = pictWords.filter((x) => x.id !== id)
      post({ kind: 'unpword', id })
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
