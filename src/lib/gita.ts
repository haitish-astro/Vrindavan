/**
 * A verse from the Bhagavad Gita every three days, with a little encouragement.
 *
 * `meaning` is our own plain-English rendering of the verse (faithful to the Sanskrit,
 * not copied from any published translation). `sanskrit` is the well-known opening of the
 * verse in transliteration, where it is short enough to show. `note` is our own words.
 * Add, edit or reorder freely — the cycle simply walks through the list.
 */
export interface GitaVerse {
  /** chapter.verse */
  ref: string
  sanskrit?: string
  meaning: string
  note: string
}

export const GITA_VERSES: GitaVerse[] = [
  {
    ref: '2.47',
    sanskrit: 'karmaṇy evādhikāras te mā phaleṣu kadācana',
    meaning: 'Your right is to the work alone, never to its fruits. Do not let the fruits be your motive, and do not cling to doing nothing.',
    note: 'Do the loving thing today without keeping score. The giving is already the reward.',
  },
  {
    ref: '2.48',
    sanskrit: 'samatvaṁ yoga ucyate',
    meaning: 'Act steadily, setting attachment aside, the same in success and in failure. That evenness of mind is called yoga.',
    note: 'Good day or hard day, we stay the same to each other. That steadiness is our quiet strength.',
  },
  {
    ref: '2.50',
    sanskrit: 'yogaḥ karmasu kauśalam',
    meaning: 'Yoga is skill in action.',
    note: 'Love is a skill too: the gentle word, the right moment, the small thing done well. Practise it today.',
  },
  {
    ref: '2.14',
    meaning: 'Heat and cold, pleasure and pain come from the touch of the senses. They arrive and they leave; they do not last. Bear them patiently.',
    note: 'Whatever is heavy today will pass. We will still be here, holding hands, when it does.',
  },
  {
    ref: '2.20',
    sanskrit: 'na jāyate mriyate vā kadācin',
    meaning: 'The Self is never born and never dies. It did not come into being and will not cease to be. Unborn, eternal, ancient — it is not slain when the body is slain.',
    note: 'Some things in us are untouched by time. Let our love live there.',
  },
  {
    ref: '2.40',
    meaning: 'On this path no effort is ever lost, and nothing turns against you. Even a little of this practice protects from great fear.',
    note: 'Every small effort for each other counts. None of it is wasted, not one bit.',
  },
  {
    ref: '2.56',
    meaning: 'One whose mind is not shaken by sorrow, who does not crave pleasures, and who is free of attachment, fear and anger — such a person is called steady in wisdom.',
    note: 'When one of us is shaken, the other can be the calm. Take turns being the shore.',
  },
  {
    ref: '2.70',
    meaning: 'As rivers pour into the ocean, which stays full and unmoved, so one into whom all desires flow and who stays still finds peace — not the one who chases desires.',
    note: 'Be each other’s ocean: deep enough that small storms do not spill over.',
  },
  {
    ref: '3.8',
    meaning: 'Do the work that is yours to do. Action is better than inaction; without action, even the body cannot be kept going.',
    note: 'Love is a verb. One small act of care today is worth a hundred plans.',
  },
  {
    ref: '3.21',
    meaning: 'Whatever a great person does, others follow. Whatever standard they set, the world goes along with it.',
    note: 'The way we treat each other quietly teaches everyone around us what love looks like.',
  },
  {
    ref: '3.35',
    meaning: 'Better your own path done imperfectly than another’s path done well.',
    note: 'Our story does not need to look like anyone else’s. Ours, imperfect, is the right one.',
  },
  {
    ref: '4.7',
    sanskrit: 'yadā yadā hi dharmasya',
    meaning: 'Whenever goodness declines and wrong rises, then I bring myself forth.',
    note: 'When things feel dark, light always finds its way back. So will we, to each other.',
  },
  {
    ref: '4.38',
    meaning: 'Nothing in this world purifies like knowledge. One perfected in yoga finds it within the self, in time.',
    note: 'Keep learning each other. There is always a new page of you I want to read.',
  },
  {
    ref: '4.39',
    meaning: 'One who has faith, who is devoted to it and has mastered the senses, gains knowledge — and having gained it, soon reaches supreme peace.',
    note: 'Faith in each other is where our peace begins.',
  },
  {
    ref: '5.10',
    meaning: 'One who acts while offering every action to the Divine, letting go of attachment, is untouched by wrong, as a lotus leaf is untouched by water.',
    note: 'Like the lotus leaf, let the world’s noise roll off us. What we have stays clean and bright.',
  },
  {
    ref: '5.18',
    meaning: 'The wise look with an equal eye on a learned sage, a cow, an elephant, a dog, and one the world casts out.',
    note: 'Be kind to everyone today, and then save your softest kindness for each other.',
  },
  {
    ref: '6.5',
    sanskrit: 'uddhared ātmanātmānaṁ',
    meaning: 'Lift yourself up by your own self; do not let yourself sink. The self alone is your friend, and the self alone is your enemy.',
    note: 'Be your own friend today. And when it is hard, I will be one for you too.',
  },
  {
    ref: '6.17',
    meaning: 'For one who is moderate in eating and rest, in work and play, in sleep and waking, yoga becomes the destroyer of sorrow.',
    note: 'Eat well, sleep enough, laugh a little. Taking care of yourself is taking care of us.',
  },
  {
    ref: '6.19',
    sanskrit: 'yathā dīpo nivāta-stho',
    meaning: 'As a lamp in a windless place does not flicker — that is the image of a mind held steady in meditation.',
    note: 'Let us be that lamp for each other: steady, warm, unflickering.',
  },
  {
    ref: '6.26',
    meaning: 'Wherever the restless, unsteady mind wanders, draw it back from there and bring it home to the Self.',
    note: 'When your thoughts wander and worry, let them find their way home — to calm, and to us.',
  },
  {
    ref: '6.32',
    meaning: 'One who sees every being as oneself, feeling their joy and sorrow as one’s own, is the highest yogi.',
    note: 'Your joy is my joy; your sorrow is mine to share. That is what “us” means.',
  },
  {
    ref: '6.35',
    meaning: 'The mind is restless and hard to hold, without a doubt. Yet it is held by steady practice and by letting go.',
    note: 'Nothing good is built in a day. Practise patience with yourself, and with us.',
  },
  {
    ref: '6.40',
    meaning: 'No one who does good ever comes to a bad end, my friend — not in this world, nor beyond it.',
    note: 'The goodness you put into the world comes back. Keep being good. I see it.',
  },
  {
    ref: '7.7',
    sanskrit: 'sūtre maṇi-gaṇā iva',
    meaning: 'There is nothing higher than Me. All this is strung upon Me, like pearls upon a thread.',
    note: 'Our days are pearls, and love is the thread that holds them together.',
  },
  {
    ref: '7.8',
    meaning: 'I am the taste in water, the light of the moon and the sun, the sacred Om in all the Vedas, the sound in the air, and the strength in people.',
    note: 'The divine hides in ordinary things — a sip of water, moonlight, your laugh. Notice it today.',
  },
  {
    ref: '9.22',
    meaning: 'To those who think of Me alone and worship Me with steady devotion, I bring what they lack and protect what they have.',
    note: 'What we have is worth protecting. Hold it gently, and trust that what is missing will come.',
  },
  {
    ref: '9.26',
    sanskrit: 'patraṁ puṣpaṁ phalaṁ toyaṁ',
    meaning: 'A leaf, a flower, a fruit, a little water — whoever offers it to Me with love, that offering of a devoted heart I accept.',
    note: 'Big gestures are lovely, but the small gifts given with love are the ones that are treasured most.',
  },
  {
    ref: '9.27',
    meaning: 'Whatever you do, whatever you eat, whatever you offer or give, whatever effort you make — do it as an offering to Me.',
    note: 'Make an ordinary task an offering today. Even making chai can be an act of love.',
  },
  {
    ref: '9.29',
    meaning: 'I am the same to all beings; none is hateful to Me and none is favoured. But those who worship Me with devotion are in Me, and I am in them.',
    note: 'Devotion makes two into one. You are in me, and I am in you.',
  },
  {
    ref: '10.20',
    meaning: 'I am the Self seated in the heart of every being. I am the beginning, the middle and the end of all beings.',
    note: 'Look into each other’s eyes today. Something sacred is looking back.',
  },
  {
    ref: '10.41',
    meaning: 'Whatever is glorious, beautiful or mighty — know that it comes from but a spark of My splendour.',
    note: 'Every beautiful thing about you is a spark of something divine. I am lucky to see it up close.',
  },
  {
    ref: '12.13–14',
    meaning: 'One who bears ill will to no being, who is friendly and compassionate, free of “I” and “mine”, even-minded in joy and sorrow, and forgiving — that devotee is dear to Me.',
    note: 'Forgive quickly, love kindly. That is the heart Krishna calls dear.',
  },
  {
    ref: '12.15',
    meaning: 'One by whom the world is not troubled, and who is not troubled by the world, free from excitement, envy, fear and anxiety — that one is dear to Me.',
    note: 'Let us be a peaceful place for each other, where no one has to be anxious.',
  },
  {
    ref: '15.15',
    meaning: 'I am seated in the hearts of all. From Me come memory, knowledge, and their loss.',
    note: 'Every memory we make lives in a sacred place. Let us make good ones.',
  },
  {
    ref: '17.15',
    meaning: 'Speech that causes no distress, that is truthful, pleasant and helpful — this is called the discipline of speech.',
    note: 'Speak softly and truly to each other today. Words are how hearts hold hands.',
  },
  {
    ref: '18.66',
    sanskrit: 'mām ekaṁ śaraṇaṁ vraja',
    meaning: 'Set aside every other duty and take refuge in Me alone. I will free you from all wrongs. Do not grieve.',
    note: 'You do not have to carry everything alone. Lean on love — and lean on me.',
  },
  {
    ref: '18.78',
    meaning: 'Wherever there is Krishna, the lord of yoga, and wherever there is Arjuna with his bow, there will surely be fortune, victory, wellbeing and wisdom.',
    note: 'Where two hearts stand together with the Divine, good things follow. That is our promise.',
  },
]

const DAY = 24 * 60 * 60 * 1000
/** a fixed starting point, so both of you always see the same verse on the same day */
const START = Date.UTC(2026, 10, 21) // the day the verses began: starts with 2.47
export const GITA_EVERY_DAYS = 3

function localDayNumber(date: Date): number {
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - START) / DAY)
}

/** The verse for this three-day stretch, and how many days until the next one. */
export function gitaVerseFor(date = new Date()): { verse: GitaVerse; nextInDays: number } {
  const day = localDayNumber(date)
  const block = Math.floor(day / GITA_EVERY_DAYS)
  const n = GITA_VERSES.length
  const verse = GITA_VERSES[((block % n) + n) % n]!
  const nextInDays = GITA_EVERY_DAYS - (((day % GITA_EVERY_DAYS) + GITA_EVERY_DAYS) % GITA_EVERY_DAYS)
  return { verse, nextInDays }
}

/** "Chapter 2, verse 47" */
export function gitaCitation(ref: string): string {
  const [chapter, verse] = ref.split('.')
  return `Bhagavad Gita ${ref} · Chapter ${chapter}, ${verse?.includes('–') ? 'verses' : 'verse'} ${verse}`
}
