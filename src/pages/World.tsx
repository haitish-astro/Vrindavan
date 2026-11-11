import { useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import {
  ChevronRight,
  LogOut,
  Palette,
  ScrollText,
  Settings as SettingsIcon,
  StickyNote,
  type LucideIcon,
} from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { Feather } from '../components/Decor'
import { Button, ConfirmDialog, Page, PageHeader } from '../components/ui'

const PLACES: { to: string; title: string; text: string; icon: LucideIcon }[] = [
  { to: '/story', title: 'Our Story', text: 'The timeline of us, milestone by milestone.', icon: ScrollText },
  { to: '/doodle', title: 'Doodle Board', text: 'A shared sheet of paper — draw together, live.', icon: Palette },
  { to: '/letters?tab=notes', title: 'Little Notes', text: 'Everyday affection, in a few words.', icon: StickyNote },
  { to: '/settings', title: 'Our Details', text: 'Your nickname, your password, the day we met.', icon: SettingsIcon },
]

export default function World() {
  const { user, signOut } = useApp()
  const world = useWorld()
  const [confirming, setConfirming] = useState(false)
  const partner = world.members.find((m) => m.id !== world.me.id)

  return (
    <Page>
      <PageHeader eyebrow="Our world" title={world.space.name} subtitle="Everything that belongs to just the two of us." />

      <section className="paper mb-6 flex items-center gap-4 px-5 py-5">
        <Feather className="feather-sway h-16 w-7 shrink-0" />
        <div className="min-w-0">
          <p className="font-serif text-2xl text-peacock-deep">
            {nameOf(world, world.me.id)} <span className="text-rose">♡</span>{' '}
            {partner ? nameOf(world, partner.id) : '…'}
          </p>
          <p className="text-sm text-ink-soft">
            {partner
              ? 'Two hearts, one little world. Everything here is shared between you both.'
              : 'Your other half has not arrived yet. Their place is being kept.'}
          </p>
        </div>
      </section>

      <ul className="space-y-3">
        {PLACES.map(({ to, title, text, icon: Icon }, i) => (
          <motion.li
            key={to}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Link to={to} className="paper flex items-center gap-4 px-5 py-4 transition hover:-translate-y-0.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-peacock-soft text-peacock-deep">
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-xl text-peacock-deep">{title}</span>
                <span className="block text-sm text-ink-soft">{text}</span>
              </span>
              <ChevronRight className="size-5 text-ink-soft" aria-hidden />
            </Link>
          </motion.li>
        ))}
      </ul>

      <p className="mt-6 px-2 text-center text-sm text-ink-soft italic">
        Still being prepared: special dates and our future adventures.
      </p>

      <div className="mt-8 flex flex-col items-center gap-2">
        <Button variant="soft" onClick={() => setConfirming(true)}>
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
        {user?.email && <p className="text-xs break-all text-ink-soft">Signed in as {user.email}</p>}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Leave for now?"
        message="You will need your password to come back in on this device."
        confirmLabel="Sign out"
        onConfirm={() => void signOut()}
        onCancel={() => setConfirming(false)}
      />
    </Page>
  )
}
