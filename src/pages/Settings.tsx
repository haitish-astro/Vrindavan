import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Check } from 'lucide-react'
import { useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { todayISO } from '../lib/dates'
import { Button, Label, Page, PageHeader } from '../components/ui'

/** Personalisation: names, the day we met, the greetings. */
export default function Settings() {
  const { api, setWorld } = useApp()
  const world = useWorld()
  const { space, me } = world

  const [name, setName] = useState(me.display_name ?? '')
  const [firstMet, setFirstMet] = useState(space.first_met_on ?? '')
  const [greeting, setGreeting] = useState(space.welcome_greeting ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (firstMet && firstMet > todayISO()) {
      setError('The day we first met cannot be in the future.')
      return
    }
    setBusy(true)
    setError(null)
    setSavedAt(false)
    try {
      const [profile, nextSpace] = await Promise.all([
        api.updateMyName(name.trim()),
        api.updateSettings(space.id, {
          first_met_on: firstMet || null,
          welcome_greeting: greeting.trim() || null,
        }),
      ])
      setWorld({
        space: nextSpace,
        me: profile,
        members: world.members.map((m) => (m.id === profile.id ? profile : m)),
      })
      setSavedAt(true)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <Link
        to="/world"
        className="mb-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-ink-soft hover:text-peacock-deep"
      >
        <ArrowLeft className="size-4" aria-hidden /> Our World
      </Link>
      <PageHeader eyebrow="Our details" title="Make it ours" subtitle="Little touches that appear around our world." />

      <form onSubmit={submit} className="paper space-y-5 p-5 sm:p-7" noValidate>
        <div>
          <Label htmlFor="name" hint="only you can change yours">
            Your name or nickname
          </Label>
          <input
            id="name"
            className="field"
            maxLength={60}
            autoComplete="nickname"
            placeholder="What should our world call you?"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="first-met" hint="starts the day counter">
            The day we first met
          </Label>
          <input
            id="first-met"
            type="date"
            className="field"
            max={todayISO()}
            value={firstMet}
            onChange={(e) => setFirstMet(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="greeting" hint="optional">
            Welcome greeting
          </Label>
          <input
            id="greeting"
            className="field"
            maxLength={200}
            placeholder="Welcome back to our little world ♡"
            value={greeting}
            onChange={(e) => setGreeting(e.target.value)}
          />
          <p className="mt-1 text-xs text-ink-soft">Shown on the welcome screen and at the top of home.</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-rose-deep">
            {error}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" busy={busy}>
            Save
          </Button>
          {savedAt && (
            <span role="status" className="inline-flex items-center gap-1 text-sm font-semibold text-sage-deep">
              <Check className="size-4" aria-hidden /> Saved
            </span>
          )}
        </div>
      </form>

      <PasswordCard />
    </Page>
  )
}

const MIN_PASSWORD = 10

/** Each person chooses their own password; the other can never see or change it. */
function PasswordCard() {
  const { api, setWorld } = useApp()
  const world = useWorld()
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    if (password !== again) return setError('The two passwords do not match.')
    setBusy(true)
    setError(null)
    try {
      await api.changePassword(password)
      const me = { ...world.me, own_password: true }
      setWorld({ ...world, me, members: world.members.map((m) => (m.id === me.id ? me : m)) })
      setPassword('')
      setAgain('')
      setSaved(true)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="paper mt-6 space-y-5 p-5 sm:p-7" noValidate>
      <div id="password">
        <h2 className="text-2xl text-peacock-deep">Your password</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {world.me.own_password
            ? 'Only you know it. Nobody else in this little world can see or change it.'
            : 'You are still using the password you were given. Choose your own, so only you hold this key.'}{' '}
          A few unrelated words strung together are easy to remember and hard to guess.
        </p>
      </div>
      <div>
        <Label htmlFor="new-password" hint={`at least ${MIN_PASSWORD} characters`}>
          New password
        </Label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="new-password-again">Type it once more</Label>
        <input
          id="new-password-again"
          type="password"
          autoComplete="new-password"
          className="field"
          value={again}
          onChange={(e) => setAgain(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-deep">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" busy={busy} variant="soft">
          Change password
        </Button>
        {saved && (
          <span role="status" className="inline-flex items-center gap-1 text-sm font-semibold text-sage-deep">
            <Check className="size-4" aria-hidden /> Password changed
          </span>
        )}
      </div>
    </form>
  )
}
