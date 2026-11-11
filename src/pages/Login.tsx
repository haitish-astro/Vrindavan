import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { ArrowLeft, Eye, EyeOff, Mail } from 'lucide-react'
import { useApp } from '../app/AppContext'
import { friendlyError } from '../data/api'
import { Feather, Sparkles } from '../components/Decor'
import { Button, Label, Page } from '../components/ui'
import { rememberEmail, rememberedEmail } from '../lib/local'

const RESEND_SECONDS = 60
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

/**
 * Invite-only sign-in. Email + password is the everyday way in;
 * an emailed one-time link is there for a forgotten password.
 */
export default function Login() {
  const { api, user } = useApp()
  const [savedEmail] = useState(rememberedEmail)
  const [email, setEmail] = useState(savedEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'password' | 'link' | 'sent'>('password')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(
    api.signInLinkFailed ? 'That sign-in link has expired or was already used. Sign in below, or ask for a new link.' : null,
  )
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  if (user) return <Navigate to="/" replace />

  const go = (next: typeof step) => {
    setStep(next)
    setError(null)
  }

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim().toLowerCase()
    if (!looksLikeEmail(address)) return setError('Please enter a valid email address.')
    if (!password) return setError('Please enter your password.')
    setBusy(true)
    setError(null)
    try {
      await api.signInWithPassword(address, password)
      rememberEmail(address)
      // AppContext notices the new session and <Navigate> above takes us home.
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  const sendLink = async (event?: FormEvent) => {
    event?.preventDefault()
    const address = email.trim().toLowerCase()
    if (!looksLikeEmail(address)) return setError('Please enter a valid email address.')
    setBusy(true)
    setError(null)
    try {
      await api.sendCode(address)
      setEmail(address)
      setCode('')
      setStep('sent')
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
    if (digits.length < 6) return setError('Enter the code from the email, or tap the link inside it.')
    setBusy(true)
    setError(null)
    try {
      await api.verifyCode(email, digits)
      rememberEmail(email)
    } catch (e) {
      setError(friendlyError(e))
      setBusy(false)
    }
  }

  const emailField = (
    <div>
      <Label htmlFor="email">Your email</Label>
      <input
        id="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        className="field"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
    </div>
  )
  const errorNote = error && (
    <p role="alert" className="text-sm text-rose-deep">
      {error}
    </p>
  )
  const subtitle = {
    password: 'This garden is private. Only the two of us hold a key.',
    link: 'Forgot your password? We will email you a one-time link instead.',
    sent: 'If this email is on the guest list, a sign-in email is on its way. Tap the link inside it and you are in.',
  }[step]

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-5 py-10">
      <Sparkles count={10} />
      <Page className="relative z-10 w-full max-w-sm">
        <div className="paper px-6 py-8">
          <div className="mb-5 flex flex-col items-center text-center">
            <Feather className="h-20" />
            <h1 className="mt-2 text-3xl text-peacock-deep">Just the two of us</h1>
            <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
          </div>

          {step === 'password' && (
            <form onSubmit={signIn} noValidate className="space-y-4">
              {emailField}
              <div>
                <Label htmlFor="password">Your password</Label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    autoFocus={Boolean(savedEmail)}
                    required
                    className="field pr-12"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-full text-ink-soft hover:text-peacock-deep"
                  >
                    {showPassword ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
                  </button>
                </div>
              </div>
              {errorNote}
              <Button type="submit" busy={busy} className="w-full">
                Open the garden ♡
              </Button>
              {savedEmail && email === savedEmail && (
                <p className="text-center text-xs text-ink-soft">
                  This device remembers your email.{' '}
                  <button
                    type="button"
                    className="font-semibold text-peacock-deep"
                    onClick={() => {
                      rememberEmail(null)
                      setEmail('')
                    }}
                  >
                    Forget it
                  </button>
                </p>
              )}
              <p className="text-center text-sm">
                <button type="button" className="font-semibold text-peacock-deep" onClick={() => go('link')}>
                  Forgot your password?
                </button>
              </p>
            </form>
          )}

          {step === 'link' && (
            <form onSubmit={sendLink} noValidate className="space-y-4">
              {emailField}
              {errorNote}
              <Button type="submit" busy={busy} className="w-full">
                <Mail className="size-4" aria-hidden />
                Email me a sign-in link
              </Button>
              <p className="text-center text-sm">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-peacock-deep"
                  onClick={() => go('password')}
                >
                  <ArrowLeft className="size-4" aria-hidden /> Back to password
                </button>
              </p>
            </form>
          )}

          {step === 'sent' && (
            <form onSubmit={verify} noValidate>
              <Label htmlFor="code" hint={email}>
                Or type the code, if the email shows one
              </Label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                className="field text-center font-serif text-2xl tracking-[0.4em]"
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
              <p className="mt-2 text-xs text-ink-soft">
                Once you are in, set a new password under Our World → Our Details. Nothing in your inbox? Check spam.
              </p>
              <div className="mt-3">{errorNote}</div>
              <Button type="submit" busy={busy} className="mt-4 w-full">
                Open the garden ♡
              </Button>
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 font-semibold text-ink-soft hover:text-peacock-deep"
                  onClick={() => go('password')}
                >
                  <ArrowLeft className="size-4" aria-hidden /> Back to password
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || busy}
                  className="font-semibold text-peacock-deep disabled:text-ink-soft/60"
                  onClick={() => void sendLink()}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new email'}
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
