/** The rules of the Games corner, shared by both screens. */
import type { GameKind } from './types'

export const GAME_INFO: Record<GameKind | 'chess', { title: string; emoji: string; blurb: string; path: string }> = {
  chess: { title: 'Chess', emoji: '♟️', blurb: 'The classic, move by move.', path: '/chess' },
  sea_battle: { title: 'Sea Battle', emoji: '🚢', blurb: 'Hide your fleet, find theirs.', path: '/games/sea_battle' },
  ludo: { title: 'Ludo', emoji: '🎲', blurb: 'Race your four tokens home.', path: '/games/ludo' },
  snakes: { title: 'Snakes & Ladders', emoji: '🐍', blurb: 'Climb up, slide down, reach 100.', path: '/games/snakes' },
  connect4: { title: 'Connect Four', emoji: '🔴', blurb: 'Four in a row wins.', path: '/games/connect4' },
  quiz: { title: 'How well do you know me?', emoji: '💭', blurb: 'Answer about you, guess about them.', path: '/games/quiz' },
  pictionary: { title: 'Pictionary', emoji: '🎨', blurb: 'One draws, one guesses — live or later.', path: '/games/pictionary' },
}

/** A fair die roll (1–6) using the browser's secure random numbers. */
export function rollDie(): number {
  const buf = new Uint8Array(1)
  do crypto.getRandomValues(buf)
  while (buf[0]! >= 252) // 252 = 6 × 42, keeps every face equally likely
  return (buf[0]! % 6) + 1
}

// ── Connect four ────────────────────────────────────────────────────────────
export const C4_COLS = 7
export const C4_ROWS = 6

/** Index of the cell a disc lands in when dropped into `col`, or -1 if the column is full. */
export function c4Drop(board: number[], col: number): number {
  for (let row = C4_ROWS - 1; row >= 0; row--) {
    const i = row * C4_COLS + col
    if (!board[i]) return i
  }
  return -1
}

/** 1 or 2 if someone has four in a row (with the winning cells), otherwise 0. */
export function c4Winner(board: number[]): { who: 0 | 1 | 2; cells: number[] } {
  const at = (r: number, c: number) => (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS ? board[r * C4_COLS + c] ?? 0 : 0)
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const who = at(r, c)
      if (!who) continue
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
        const cells = [0, 1, 2, 3].map((k) => [r + dr * k, c + dc * k] as const)
        if (cells.every(([rr, cc]) => at(rr, cc) === who)) {
          return { who: who as 1 | 2, cells: cells.map(([rr, cc]) => rr * C4_COLS + cc) }
        }
      }
    }
  }
  return { who: 0, cells: [] }
}

// ── Snakes & ladders ────────────────────────────────────────────────────────
export const LADDERS: Record<number, number> = { 4: 14, 9: 31, 20: 38, 28: 84, 40: 59, 51: 67, 63: 81, 71: 91 }
export const SNAKES: Record<number, number> = { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 99: 78 }

/** Where square n (1–100) sits on the board: row 0 is the top. Rows snake back and forth. */
export function squareAt(n: number): { row: number; col: number } {
  const fromBottom = Math.floor((n - 1) / 10)
  const along = (n - 1) % 10
  return { row: 9 - fromBottom, col: fromBottom % 2 === 0 ? along : 9 - along }
}

/** Move from `pos` by `roll`. Overshooting 100 means staying put. */
export function snakesMove(pos: number, roll: number): { to: number; landed: number; via: 'ladder' | 'snake' | null } {
  const landed = pos + roll
  if (landed > 100) return { to: pos, landed: pos, via: null }
  if (LADDERS[landed]) return { to: LADDERS[landed]!, landed, via: 'ladder' }
  if (SNAKES[landed]) return { to: SNAKES[landed]!, landed, via: 'snake' }
  return { to: landed, landed, via: null }
}

// ── Ludo (two players: red from the top-left, yellow from the bottom-right) ─
/** The 52 squares of the track, clockwise, starting at red's start square. [row, col] on a 15×15 board. */
export const LUDO_TRACK: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
]
export const LUDO_START = { p1: 0, p2: 26 } as const
/** Start squares and star squares: nobody can be captured here. */
export const LUDO_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47])
const HOME_COLUMN = {
  p1: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]] as [number, number][],
  p2: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]] as [number, number][],
}
const BASE_SPOTS = {
  p1: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]] as [number, number][],
  p2: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]] as [number, number][],
}
/** Finished tokens rest inside their own colour's triangle in the centre, side by side. */
const DONE_SPOTS = {
  p1: [[6.65, 5.9], [7.35, 5.9], [6.65, 6.35], [7.35, 6.35]] as [number, number][],
  p2: [[6.65, 8.1], [7.35, 8.1], [6.65, 7.65], [7.35, 7.65]] as [number, number][],
}
/** Token progress: -1 waiting at home base, 0–50 on the track, 51–55 the home column, 56 finished. */
export const LUDO_DONE = 56
export type LudoKey = 'p1' | 'p2'

export function ludoTrackIndex(key: LudoKey, progress: number): number | null {
  return progress >= 0 && progress <= 50 ? (LUDO_START[key] + progress) % 52 : null
}

/** Where to draw a token, in board cells (row, col — fractional for the base). */
export function ludoPlace(key: LudoKey, progress: number, token: number): [number, number] {
  if (progress < 0) return BASE_SPOTS[key][token]!
  if (progress >= LUDO_DONE) return DONE_SPOTS[key][token]!
  if (progress > 50) return HOME_COLUMN[key][progress - 51]!
  return LUDO_TRACK[ludoTrackIndex(key, progress)!]!
}

/** Which of your tokens can move with this roll. */
export function ludoLegal(tokens: number[], roll: number): number[] {
  return tokens
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (p < 0 ? roll === 6 : p < LUDO_DONE && p + roll <= LUDO_DONE))
    .map(({ i }) => i)
}

export interface LudoMoveResult {
  tokens: Record<LudoKey, number[]>
  captured: boolean
  finished: boolean
}

export function ludoApply(tokens: Record<LudoKey, number[]>, key: LudoKey, token: number, roll: number): LudoMoveResult {
  const other: LudoKey = key === 'p1' ? 'p2' : 'p1'
  const mine = [...tokens[key]]
  const theirs = [...tokens[other]]
  const from = mine[token]!
  const to = from < 0 ? 0 : from + roll
  mine[token] = to
  let captured = false
  const square = ludoTrackIndex(key, to)
  if (square !== null && !LUDO_SAFE.has(square)) {
    theirs.forEach((p, i) => {
      if (ludoTrackIndex(other, p) === square) {
        theirs[i] = -1
        captured = true
      }
    })
  }
  return { tokens: { [key]: mine, [other]: theirs } as Record<LudoKey, number[]>, captured, finished: to === LUDO_DONE }
}

// ── Sea battle ──────────────────────────────────────────────────────────────
export const FLEET = [5, 4, 3, 3, 2]
export const SHIP_NAMES: Record<number, string> = { 5: 'carrier', 4: 'battleship', 3: 'cruiser', 2: 'patrol boat' }

/** A random, valid fleet: ships in straight lines, no overlaps, and never touching (easier to read). */
export function randomFleet(): number[][] {
  for (;;) {
    const used = new Set<number>() // ship cells plus the ring of water around them
    const ships: number[][] = []
    let ok = true
    for (const len of FLEET) {
      let placed = false
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const across = Math.random() < 0.5
        const r = Math.floor(Math.random() * (across ? 10 : 11 - len))
        const c = Math.floor(Math.random() * (across ? 11 - len : 10))
        const cells = Array.from({ length: len }, (_, k) => (across ? r * 10 + c + k : (r + k) * 10 + c))
        if (cells.every((x) => !used.has(x))) {
          for (const x of cells) {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const rr = Math.floor(x / 10) + dr
                const cc = (x % 10) + dc
                if (rr >= 0 && rr < 10 && cc >= 0 && cc < 10) used.add(rr * 10 + cc)
              }
            }
          }
          ships.push(cells)
          placed = true
        }
      }
      if (!placed) ok = false
    }
    if (ok) return ships
  }
}

// ── How well do you know me? ────────────────────────────────────────────────
export interface QuizQuestion {
  /** finish the sentence "Your … ?" / "Her … ?" */
  about: string
  options: [string, string, string, string]
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  { about: 'comfort food on a bad day', options: ['Maggi or noodles', 'Biryani', 'Pizza', 'Something sweet'] },
  { about: 'ideal lazy Sunday', options: ['Sleeping in', 'A long walk out', 'Movies & snacks', 'Cooking something new'] },
  { about: 'dream trip', options: ['Beach & sunsets', 'Snowy mountains', 'A buzzing city', 'Quiet temples & history'] },
  { about: 'favourite season', options: ['Monsoon', 'Winter', 'Spring', 'Summer'] },
  { about: 'go-to drink', options: ['Chai', 'Coffee', 'Juice or smoothie', 'Just water'] },
  { about: 'way of saying sorry', options: ['Words', 'A hug', 'A little gift', 'Fixing it quietly'] },
  { about: 'love language', options: ['Words of affirmation', 'Quality time', 'Touch', 'Acts of service'] },
  { about: 'biggest pet peeve', options: ['Lateness', 'Loud chewing', 'Being interrupted', 'Mess'] },
  { about: 'perfect date', options: ['Fancy dinner', 'Street food walk', 'Movie night in', 'An adventure outside'] },
  { about: 'morning or night person?', options: ['Early bird', 'Night owl', 'Afternoon is my peak', 'Depends on the day'] },
  { about: 'favourite way to be cheered up', options: ['A call', 'Food', 'Being left alone a bit', 'Silly memes'] },
  { about: 'secret talent', options: ['Singing', 'Cooking', 'Remembering everything', 'Making people laugh'] },
  { about: 'childhood dream job', options: ['Doctor', 'Astronaut or pilot', 'Artist or musician', 'Teacher'] },
  { about: 'favourite festival', options: ['Diwali', 'Holi', 'Janmashtami', 'Christmas / New Year'] },
  { about: 'most-used emoji', options: ['😂', '❤️', '🥺', '😭'] },
  { about: 'favourite kind of movie', options: ['Romance', 'Comedy', 'Thriller', 'Animated'] },
  { about: 'stress habit', options: ['Overthinking', 'Snacking', 'Cleaning', 'Going quiet'] },
  { about: 'favourite flower', options: ['Rose', 'Lotus', 'Sunflower', 'Jasmine'] },
  { about: 'dessert of choice', options: ['Gulab jamun', 'Ice cream', 'Chocolate cake', 'Rasmalai'] },
  { about: 'perfect weather', options: ['Light rain', 'Sunny & warm', 'Cold & cosy', 'Breezy evening'] },
  { about: 'favourite thing about us', options: ['How we laugh', 'Our long talks', 'How we take care of each other', 'Our little adventures'] },
  { about: 'texting style', options: ['Long paragraphs', 'Lots of short texts', 'Voice notes', 'Mostly emojis'] },
  { about: 'travel personality', options: ['Plans everything', 'Goes with the flow', 'Food-first explorer', 'Photo-taker'] },
  { about: 'favourite time of day', options: ['Sunrise', 'Lunchtime', 'Golden hour', 'Midnight'] },
  { about: 'pick a superpower', options: ['Teleporting', 'Reading minds', 'Flying', 'Stopping time'] },
  { about: 'ideal pet', options: ['Dog', 'Cat', 'Bird', 'No pets, thanks'] },
  { about: 'favourite music for a long drive', options: ['Old Bollywood', 'Pop hits', 'Devotional / calm', 'Whatever’s playing'] },
  { about: 'what makes you feel most loved', options: ['Surprise notes', 'Undivided attention', 'Being held', 'Being helped'] },
  { about: 'favourite meal of the day', options: ['Breakfast', 'Lunch', 'Dinner', 'Midnight snacks'] },
  { about: 'first thing done in the morning', options: ['Check the phone', 'Chai or coffee', 'Stretch / pray', 'Snooze again'] },
]

export function pickQuestions(count = 6): number[] {
  const all = QUIZ_QUESTIONS.map((_, i) => i)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j]!, all[i]!]
  }
  return all.slice(0, count)
}
