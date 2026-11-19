import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, Check } from 'lucide-react'
import { useApp, useWorld } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { todayISO } from '../lib/dates'
import { useAsync } from '../lib/hooks'
import { motion } from 'motion/react'
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

      <StorageCard />
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

/** Supabase's free plan includes 1 GB for photos and videos. */
const FREE_STORAGE_BYTES = 1024 ** 3

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(bytes >= 100 * 1024 ** 2 ? 0 : 1)} MB`
  if (bytes === 0) return "0 MB"
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** How much of the free photo & video storage your little world is using. */
function StorageCard() {
  const { api } = useApp()
  const usage = useAsync(() => api.storageUsage(), [api])

  if (usage.loading) return null
  const data = usage.data
  const total = data ? data.photoBytes + data.videoBytes : 0
  const share = Math.min(1, total / FREE_STORAGE_BYTES)
  const photoShare = data ? Math.min(1, data.photoBytes / FREE_STORAGE_BYTES) : 0
  const videoShare = data ? Math.min(1 - photoShare, data.videoBytes / FREE_STORAGE_BYTES) : 0
  const tone = share >= 0.95 ? 'full' : share >= 0.8 ? 'close' : 'ok'

  return (
    <section className="paper mt-6 space-y-3 p-5 sm:p-7" aria-label="Storage">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl text-peacock-deep">Photo & video storage</h2>
        {data && (
          <p className="text-sm font-semibold text-ink">
            {formatBytes(total)} <span className="font-normal text-ink-soft">of 1 GB</span>
          </p>
        )}
      </div>

      {!data ? (
        <p className="text-sm text-ink-soft">
          The storage meter appears once the newest SQL file has been run in Supabase (see the README).
        </p>
      ) : (
        <>
          <div
            className="flex h-3 overflow-hidden rounded-full bg-parchment"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share * 100)}
            aria-label={`${Math.round(share * 100)}% of the free storage used`}
          >
            <motion.span
              className="h-full bg-peacock"
              initial={{ width: 0 }}
              animate={{ width: `${photoShare * 100}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
            <motion.span
              className="h-full bg-rose"
              initial={{ width: 0 }}
              animate={{ width: `${videoShare * 100}%` }}
              transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-peacock" aria-hidden />
              Photos · {data.photoFiles} · {formatBytes(data.photoBytes)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-rose" aria-hidden />
              Videos · {data.videoFiles} · {formatBytes(data.videoBytes)}
            </span>
            <span>{Math.round(share * 100)}% used</span>
          </div>
          <p
            className={`rounded-xl px-3 py-2 text-sm ${
              tone === 'full' ? 'bg-blush text-rose-deep' : tone === 'close' ? 'bg-gold-soft/60 text-ink' : 'text-ink-soft'
            }`}
          >
            {tone === 'full'
              ? 'Almost full — new uploads may soon be refused. Remove some videos, or move to Supabase Pro (100 GB).'
              : tone === 'close'
                ? 'Getting close to the free 1 GB. Videos take the most room — consider trimming long clips.'
                : 'Plenty of room. This counts every photo and video either of you has added, including chat photos.'}
          </p>
        </>
      )}
    </section>
  )
}
