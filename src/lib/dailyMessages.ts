import { dayOfYear } from './dates'

/**
 * Original thoughts inspired by the love of Radha and Krishna.
 * These are our own words — they are not quotations from any scripture or person.
 * Add, edit or remove lines freely; one is shown per calendar day.
 */
export const DAILY_MESSAGES: string[] = [
  'Radha never had to ask where Krishna was. Love had already told her.',
  'A flute is hollow, and that is why it can sing. Make room, and love will find its music in you.',
  'In Vrindavan, even the dust remembers who walked there together.',
  'Krishna played for the whole world, yet Radha heard a song meant only for her.',
  'Love is not counted in days. It is counted in how often your name becomes my prayer.',
  'The Yamuna does not hurry, and still she arrives. So does every good thing between us.',
  'To be loved is to be seen. To be loved like Radha is to be seen even with eyes closed.',
  'A peacock feather asks for nothing, yet it crowns the one it loves.',
  'Distance never frightened them. What is separation to two hearts that beat as one?',
  'Some loves are loud. Theirs was a quiet lamp that never once went out.',
  'Every ordinary evening becomes Vrindavan when it is spent beside the right person.',
  'Radha did not wait for Krishna. She carried him with her, and so she was never alone.',
  'The sweetest devotion is small: a remembered word, a saved seat, a hand held without reason.',
  'When the flute is heard, the cows stop grazing and the river stops flowing. Let me pause like that for you.',
  'Love does not say "you are mine." It says "I am yours," and smiles.',
  'A garland is only flowers and thread. A life together is only moments and care.',
  'They say Krishna stole butter. Radha knew he had stolen something far softer.',
  'The kadamba tree does not bloom for applause. Let us love like that, simply because it is our nature.',
  'To say your name slowly is its own kind of worship.',
  'In the forest of twelve groves, there was always one path that led only to her.',
  'Love grows not by grand gestures but by returning, again and again, to the same heart.',
  'The moon over Vrindavan has watched a thousand dances, and still it leans closer for one more.',
  'Where there is trust, there is no need for promises. Radha never asked Krishna for one.',
  'Let today be a small festival. There is always a reason, and the reason is you.',
  'A lotus rises through still water and opens anyway. Patience is the gentlest form of love.',
  'Krishna wore the colour of rainclouds, Radha the colour of lightning. One is never seen without the other.',
  'The memory of a single afternoon together can light an entire monsoon of waiting.',
  'To notice is to love. Notice the little things today.',
  'Their story is told with her name first. Love knows whom to honour.',
  'Not every prayer is spoken in a temple. Some are spoken across a table, over two cups of chai.',
  'Wherever you are is where my Vrindavan begins.',
  'Seasons turned, the river changed its course, and still the song on the flute stayed the same.',
  'The heart is a small courtyard. Sweep it every morning, and keep one lamp lit for the one you love.',
]

export function messageForToday(date = new Date()): string {
  // Offset by year so the same date does not always land on the same thought.
  const index = (dayOfYear(date) + date.getFullYear() * 7) % DAILY_MESSAGES.length
  return DAILY_MESSAGES[index]!
}
