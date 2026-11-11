import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { ArrowLeft, Mail } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { Feather, Sparkles } from '../components/Decor'
import { Button, Label, Page } from '../components/ui'

const RESEND_SECONDS = 60

/** Invite-only sign-in: an emailed one-time code (or the link in the same email). */
export default function Login() {
  const { api, user } = useApp()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  if (user) return <Navigate to="/" replace />

  const send = async (event?: FormEvent) => {
    event?.preventDefault()
    const address = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('Please enter a valid email address.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.sendCode(address)
      setEmail(address)
      setStep('code')
      setCode('')
      setCooldown(RESEND_SECONDS)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event: FormEvent) => {
    event.preventDefault()
    const digits = code.replace(/\D/g, '')
    if (digits.length < 6) {
      setError('Enter the code from the email.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.verifyCode(email, digits)
      // AppContext notices the new session and <Navigate> above takes us home.
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-5 py-10">
      <Sparkles count={10} />
      <Page className="relative z-10 w-full max-w-sm">
        <div className="paper px-6 py-8">
          <div className="mb-5 flex flex-col items-center text-center">
            <Feather className="h-20" />
            <h1 className="mt-2 text-3xl text-peacock-deep">Just the two of us</h1>
            <p className="mt-1 text-sm text-ink-soft">
              {step === 'email'
                ? 'This garden is private. Enter your email and we will send you a key.'
                : 'If this email is on the guest list, a sign-in code is on its way.'}
            </p>
          </div>

          {step === 'email' ? (
            <form onSubmit={send} noValidate>
              <Label htmlFor="email">Your email</Label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                autoFocus
                className="field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-deep">
                  {error}
                </p>
              )}
              <Button type="submit" busy={busy} className="mt-5 w-full">
                <Mail className="size-4" aria-hidden />
                Send my key
              </Button>
            </form>
          ) : (
            <form onSubmit={verify} noValidate>
              <Label htmlFor="code" hint={email}>
                Sign-in code
              </Label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                required
                autoFocus
                className="field text-center font-serif text-2xl tracking-[0.4em]"
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <p className="mt-2 text-xs text-ink-soft">
                Or tap the link in the email if you are opening it on this same device and browser.
              </p>
              {error && (
                <p role="alert" className="mt-3 text-sm text-rose-deep">
                  {error}
                </p>
              )}
              <Button type="submit" busy={busy} className="mt-5 w-full">
                Open the garden ♡
              </Button>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-peacock-deep"
                  onClick={() => {
                    setStep('email')
                    setError(null)
                  }}
                >
                  <ArrowLeft className="size-4" aria-hidden /> Different email
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || busy}
                  className="font-semibold text-peacock-deep disabled:text-ink-soft/60"
                  onClick={() => void send()}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
                </button>
              </div>
            </form>
          )}
        </div>
        <p className="mt-5 text-center text-sm">
          <Link to="/welcome" className="text-ink-soft hover:text-peacock-deep">
            ← Back to the welcome
          </Link>
        </p>
      </Page>
    </div>
  )
}
