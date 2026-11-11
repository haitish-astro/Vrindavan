import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { Flower2, House, Images, Mail, MessageCircleHeart, type LucideIcon } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { useChatStatus } from '../app/ChatContext'
import { Feather, Petals, Sparkles } from './Decor'

const DESTINATIONS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/memories', label: 'Memories', icon: Images },
  { to: '/letters', label: 'Letters', icon: Mail },
  { to: '/chat', label: 'Chat', icon: MessageCircleHeart },
  { to: '/world', label: 'Our World', icon: Flower2 },
]

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className="absolute -top-1 -right-2 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-rose-deep px-1 text-[0.62rem] font-bold text-white"
      aria-label={`${count} new`}
    >
      {count > 9 ? '9+' : count}
    </motion.span>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { api } = useApp()
  const { unread } = useChatStatus()
  const { pathname } = useLocation()
  const inChat = pathname === '/chat'

  return (
    <div className="relative min-h-dvh">
      <Sparkles count={8} />
      <Petals count={inChat ? 0 : 6} />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {api.mode === 'preview' && (
        <p className="relative z-10 bg-gold-soft px-4 py-1.5 text-center text-xs font-semibold text-ink">
          Preview mode — Supabase is not connected, so nothing here is saved.
        </p>
      )}

      <header className="relative z-10 mx-auto flex max-w-3xl items-center justify-between px-5 pt-5 pb-2">
        <Link to="/" className="flex items-center gap-2 text-peacock-deep" aria-label="Our Little Vrindavan — home">
          <Feather className="h-9 w-4" />
          <span className="font-serif text-xl italic">Our Little Vrindavan</span>
        </Link>
        {/* wider screens: navigation sits in the header */}
        <nav aria-label="Main" className="hidden gap-0.5 sm:flex">
          {DESTINATIONS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative rounded-full px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'text-peacock-deep' : 'text-ink-soft hover:text-peacock-deep'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-desktop"
                      className="absolute inset-0 rounded-full bg-peacock-soft"
                      transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative">
                    {label}
                    {to === '/chat' && <Badge count={unread} />}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className={`relative z-10 mx-auto max-w-3xl px-5 pt-4 ${inChat ? 'pb-0 sm:pb-6' : 'pb-32 sm:pb-16'}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pathname} exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* phones: a floating bar within thumb's reach (hidden in chat, where the message box lives) */}
      {!inChat && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden"
        >
          <ul className="mx-auto flex max-w-md items-stretch justify-between rounded-full border border-gold/30 bg-paper/95 px-1.5 py-1.5 shadow-polaroid backdrop-blur">
            {DESTINATIONS.map(({ to, label, icon: Icon, end }) => (
              <li key={to} className="flex-1">
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `relative flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[0.64rem] font-semibold transition ${
                      isActive ? 'text-peacock-deep' : 'text-ink-soft'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          layoutId="nav-mobile"
                          className="absolute inset-0 rounded-full bg-peacock-soft"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <span className="relative">
                        <Icon className="size-5" aria-hidden />
                        {to === '/chat' && <Badge count={unread} />}
                      </span>
                      <span className="relative">{label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
