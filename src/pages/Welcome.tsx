import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { useApp } from '../app/AppContext'
import { Feather, LotusDivider, Petals, Sparkles } from '../components/Decor'
import { messageForToday } from '../lib/dailyMessages'
import { markWelcomed, savedGreeting } from '../lib/local'

/** The magical front door. Shows nothing private — only today's thought and a greeting. */
export default function Welcome() {
  const { user } = useApp()
  const navigate = useNavigate()
  const still = useReducedMotion()
  const thought = useMemo(() => messageForToday(), [])
  const saved = useMemo(() => savedGreeting(), [])

  const greeting = saved.greeting ?? 'This little world was made for you.'
  const hello = saved.name ? `Radhe Radhe, ${saved.name}` : 'Radhe Radhe'

  // Each piece arrives a little after the last. With reduced motion, everything is simply there.
  const appear = (delay: number) =>
    still
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay, ease: 'easeOut' as const },
        }

  const enter = () => {
    markWelcomed()
    navigate(user ? '/' : '/login')
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12 text-center">
      <Sparkles />
      <Petals />

      {user && (
        <Link
          to="/"
          onClick={markWelcomed}
          className="absolute top-5 right-5 z-10 rounded-full px-3 py-2 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
        >
          Skip
        </Link>
      )}

      <main className="relative z-10 flex max-w-md flex-col items-center">
        <motion.div
          initial={still ? false : { opacity: 0, scale: 0.7, rotate: -14, y: 30 }}
          animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <Feather className="feather-sway h-52 drop-shadow-sm sm:h-60" title="A peacock feather" />
        </motion.div>

        <motion.p {...appear(1.3)} className="eyebrow mt-6">
          Today&rsquo;s thought
        </motion.p>
        <motion.p
          {...appear(1.6)}
          className="mt-3 font-serif text-[1.45rem] leading-snug text-ink italic sm:text-[1.65rem]"
        >
          {thought}
        </motion.p>

        <motion.div {...appear(2.5)} className="mt-7">
          <LotusDivider />
        </motion.div>

        <motion.h1 {...appear(2.8)} className="mt-6 text-3xl text-peacock-deep sm:text-4xl">
          {hello} <span className="text-rose">♡</span>
        </motion.h1>
        <motion.p {...appear(3.1)} className="hand mt-2 text-rose-deep">
          {greeting}
        </motion.p>

        <motion.button
          {...appear(3.7)}
          type="button"
          onClick={enter}
          whileHover={still ? undefined : { scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="mt-9 min-h-13 rounded-full border border-gold/50 bg-peacock px-8 py-3.5 font-serif text-xl text-white shadow-polaroid transition-colors hover:bg-peacock-deep"
        >
          Enter Our Little Vrindavan ♡
        </motion.button>
      </main>
    </div>
  )
}
