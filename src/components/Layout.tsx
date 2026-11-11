import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { Flower2, House, Images, ScrollText, type LucideIcon } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { Feather } from './Decor'

const DESTINATIONS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/memories', label: 'Memories', icon: Images },
  { to: '/story', label: 'Our Story', icon: ScrollText },
  { to: '/world', label: 'Our World', icon: Flower2 },
]

export function Layout({ children }: { children: ReactNode }) {
  const { api } = useApp()
  return (
    <div className="relative min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {api.mode === 'preview' && (
        <p className="bg-gold-soft px-4 py-1.5 text-center text-xs font-semibold text-ink">
          Preview mode — Supabase is not connected, so nothing here is saved.
        </p>
      )}

      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 pt-5 pb-2">
        <Link to="/" className="flex items-center gap-2 text-peacock-deep" aria-label="Our Little Vrindavan — home">
          <Feather className="h-9 w-4" />
          <span className="font-serif text-xl italic">Our Little Vrindavan</span>
        </Link>
        {/* wider screens: navigation sits in the header */}
        <nav aria-label="Main" className="hidden gap-1 sm:flex">
          {DESTINATIONS.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-peacock-soft text-peacock-deep' : 'text-ink-soft hover:text-peacock-deep'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-5 pt-4 pb-32 sm:pb-16">
        {children}
      </main>

      {/* phones: a floating bar within thumb's reach */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-between rounded-full border border-gold/30 bg-paper/95 px-2 py-1.5 shadow-polaroid backdrop-blur">
          {DESTINATIONS.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[0.68rem] font-semibold transition ${
                    isActive ? 'bg-peacock-soft text-peacock-deep' : 'text-ink-soft'
                  }`
                }
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
