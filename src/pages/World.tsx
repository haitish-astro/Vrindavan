import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, LogOut, ScrollText, Settings as SettingsIcon, type LucideIcon } from 'lucide-react'
import { nameOf, useApp, useWorld } from '../app/AppContext'
import { Feather } from '../components/Decor'
import { Button, ConfirmDialog, Page, PageHeader } from '../components/ui'

const PLACES: { to: string; title: string; text: string; icon: LucideIcon }[] = [
  { to: '/story', title: 'Our Story', text: 'The timeline of us, milestone by milestone.', icon: ScrollText },
  { to: '/settings', title: 'Our Details', text: 'Names, the day we met, and little greetings.', icon: SettingsIcon },
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
        <Feather className="h-16 w-7 shrink-0" />
        <div className="min-w-0">
          <p className="font-serif text-2xl text-peacock-deep">
            {nameOf(world, world.me.id)} <span className="text-rose">♡</span>{' '}
            {partner ? nameOf(world, partner.id) : '…'}
          </p>
          <p className="text-sm text-ink-soft">
            {partner
              ? 'Two hearts, one little world.'
              : 'Your other half has not arrived yet. Their place is being kept.'}
          </p>
        </div>
      </section>

      <ul className="space-y-3">
        {PLACES.map(({ to, title, text, icon: Icon }) => (
          <li key={to}>
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
          </li>
        ))}
      </ul>

      <p className="mt-6 px-2 text-center text-sm text-ink-soft italic">
        More rooms are being prepared: letters, little notes, special dates and future adventures.
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
        message="You will need a new sign-in code from your email to come back in on this device."
        confirmLabel="Sign out"
        onConfirm={() => void signOut()}
        onCancel={() => setConfirming(false)}
      />
    </Page>
  )
}
