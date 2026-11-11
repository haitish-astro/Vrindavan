/** Small shared building blocks: buttons, page shell, states, dialogs. */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ImageOff, LoaderCircle } from 'lucide-react'
import { usePhotoUrl } from '../lib/hooks'
import { Lotus } from './Decor'

type Variant = 'primary' | 'soft' | 'ghost' | 'danger'

export function buttonClass(variant: Variant = 'primary', extra = '') {
  const base =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[0.95rem] font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55'
  const variants: Record<Variant, string> = {
    primary: 'bg-peacock text-white shadow-soft hover:bg-peacock-deep',
    soft: 'border border-peacock/25 bg-paper text-peacock-deep hover:bg-peacock-soft/60',
    ghost: 'text-peacock-deep hover:bg-peacock-soft/50',
    danger: 'bg-rose-deep text-white hover:brightness-95',
  }
  return `${base} ${variants[variant]} ${extra}`
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  busy?: boolean
}

export function Button({ variant, busy, className, children, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={buttonClass(variant, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
}

export function ButtonLink({ variant, className, ...rest }: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />
}

/** Every screen fades gently into place. */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-[2rem] leading-tight text-peacock-deep sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-ink-soft" role="status">
      <LoaderCircle className="size-6 animate-spin text-peacock" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="paper flex flex-col items-center gap-3 p-6 text-center" role="alert">
      <p className="text-rose-deep">{message}</p>
      {onRetry && (
        <Button variant="soft" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="paper flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Lotus className="h-12 w-20" />
      <h2 className="text-2xl text-peacock-deep">{title}</h2>
      {children && <p className="max-w-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** A photo from private storage, with a soft placeholder and a graceful fallback. */
export function PrivatePhoto({
  path,
  alt,
  className = '',
  imgClassName = 'object-cover',
}: {
  path: string | null | undefined
  alt: string
  className?: string
  imgClassName?: string
}) {
  const { url, failed } = usePhotoUrl(path)
  return (
    <div className={`relative overflow-hidden bg-parchment ${className}`}>
      {url ? (
        <motion.img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className={`size-full ${imgClassName}`}
        />
      ) : (
        <div className="flex size-full min-h-24 items-center justify-center text-ink-soft/60">
          {failed || !path ? (
            <span className="flex flex-col items-center gap-1 text-xs">
              <ImageOff className="size-5" aria-hidden />
              {path ? 'Photo unavailable' : 'No photo yet'}
            </span>
          ) : (
            <span className="size-full animate-pulse bg-blush/40" aria-label="Loading photo" />
          )}
        </div>
      )}
    </div>
  )
}

/** A centred sheet over a dimmed backdrop. Closes on Escape or backdrop tap. */
export function Modal({
  open,
  onClose,
  title,
  children,
  role = 'dialog',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  role?: 'dialog' | 'alertdialog'
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.div
            ref={panel}
            role={role}
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-gold/25 bg-paper p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-polaroid outline-none sm:rounded-3xl"
          >
            <h2 id={titleId} className="mb-4 text-2xl text-peacock-deep">
              {title}
            </h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} role="alertdialog">
      <p className="text-ink-soft">{message}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="soft" onClick={onCancel} disabled={busy}>
          Keep it
        </Button>
        <Button variant="danger" onClick={onConfirm} busy={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
      <span>{children}</span>
      {hint && <span className="text-xs font-normal text-ink-soft">{hint}</span>}
    </label>
  )
}
