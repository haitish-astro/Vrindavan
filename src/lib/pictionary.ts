/** Pictionary: the built-in words, picking choices, and the scoring rules (the database applies the same ones). */

export type Level = 'easy' | 'medium' | 'hard'

export const PICT_WORDS: Record<Level, string[]> = {
  easy: [
    'cat', 'dog', 'fish', 'sun', 'moon', 'star', 'tree', 'flower', 'house', 'car', 'boat', 'apple',
    'banana', 'cake', 'ice cream', 'pizza', 'cup', 'chair', 'bed', 'book', 'phone', 'clock', 'hat',
    'shoe', 'umbrella', 'rain', 'cloud', 'heart', 'kite', 'balloon', 'butterfly', 'bird', 'snake',
    'ball', 'key', 'door', 'eye', 'smile', 'ring', 'candle', 'cow', 'duck', 'egg', 'leaf', 'rainbow',
    'mango', 'flute', 'diya', 'lotus', 'peacock', 'chai', 'samosa', 'kite festival', 'rose',
  ],
  medium: [
    'guitar', 'bicycle', 'camera', 'sandwich', 'birthday', 'beach', 'mountain', 'volcano', 'castle',
    'robot', 'rocket', 'dinosaur', 'giraffe', 'elephant', 'penguin', 'octopus', 'spider web', 'snowman',
    'lighthouse', 'waterfall', 'campfire', 'treasure map', 'hot air balloon', 'teddy bear', 'popcorn',
    'headphones', 'toothbrush', 'sunflower', 'cactus', 'paper plane', 'swing', 'picnic', 'love letter',
    'selfie', 'movie night', 'road trip', 'mehndi', 'rangoli', 'auto rickshaw', 'chai stall', 'temple bells',
    'cricket', 'jalebi', 'golgappa', 'monsoon', 'butter pot', 'cow with a bell', 'tabla', 'saree', 'Taj Mahal',
    'swan', 'kadamba tree', 'Yamuna river', 'peacock feather', 'garland',
  ],
  hard: [
    'gravity', 'jealousy', 'time travel', 'daydream', 'homesick', 'first date', 'long distance', 'promise',
    'forgiveness', 'nostalgia', 'surprise party', 'stage fright', 'deja vu', 'sleepwalking', 'wifi',
    'inside joke', 'butterflies in my stomach', 'traffic jam', 'video call', 'blind date', 'Monday morning',
    'Holi colours', 'Raas Leela', 'Krishna stealing butter', 'Radha waiting', 'Govardhan hill', 'Janmashtami',
    'Diwali fireworks', 'wedding baraat', 'Bollywood dance', 'chai and rain', 'online shopping', 'procrastination',
    'midnight snack', 'serenade', 'soulmate', 'missing you', 'karma', 'meditation', 'echo',
  ],
}

export const LEVEL_LABEL: Record<Level, string> = { easy: 'Easy', medium: 'Medium', hard: 'Tricky' }

/** Points the guesser earns: 10, minus 2 for each wrong guess and 3 for each hint, but never below 2. */
export function guesserPoints(wrong: number, hints: number): number {
  return Math.max(2, 10 - 2 * wrong - 3 * hints)
}
/** The artist earns half of that (rounded up) when it is guessed. */
export function drawerPoints(guesser: number): number {
  return Math.floor((guesser + 1) / 2)
}

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!

export interface WordChoice {
  word: string
  level: Level | 'ours'
}

/**
 * Three choices: one easy, one medium, one tricky. If you have added words of your own,
 * one of the three is usually one of yours. `avoid` keeps recently played words out.
 */
export function pickChoices(ours: string[], avoid: string[] = []): WordChoice[] {
  const seen = new Set(avoid.map((w) => w.toLowerCase()))
  const fresh = (list: string[]) => {
    const left = list.filter((w) => !seen.has(w.toLowerCase()))
    return left.length ? left : list
  }
  const choices: WordChoice[] = [
    { word: pick(fresh(PICT_WORDS.easy)), level: 'easy' },
    { word: pick(fresh(PICT_WORDS.medium)), level: 'medium' },
    { word: pick(fresh(PICT_WORDS.hard)), level: 'hard' },
  ]
  if (ours.length > 0 && Math.random() < 0.75) {
    choices[Math.floor(Math.random() * 3)] = { word: pick(fresh(ours)), level: 'ours' }
  }
  return choices
}

// ── the same helpers the database uses (for the local preview) ──
export function pictNorm(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

export function pictIsRight(guess: string, word: string): boolean {
  const a = pictNorm(guess)
  const b = pictNorm(word)
  if (a === b) return true
  return b.length > 3 && (a === `${b}s` || `${a}s` === b || a === `${b}es` || `${a}es` === b)
}

/** "_ _ _" with revealed letters (1-based positions) filled in. */
export function pictMask(word: string, shown: number[]): string {
  return [...word].map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) && !shown.includes(i + 1) ? '_' : ch)).join('')
}

export const PICT_ROUND_OPTIONS = [4, 6, 8, 10] as const
