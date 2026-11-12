import { useEffect, useState } from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'

const INTERACTIVE = 'a, button, [role="button"], [role="tab"], [role="radio"], input, textarea, select, label, canvas'

/**
 * A soft glow that follows the mouse, with a faint trail of golden dust.
 * It grows and turns peacock-blue over things you can click.
 * Only on devices with a real mouse/trackpad, and never with reduced motion.
 */
export function CursorGlow() {
  const still = useReducedMotion()
  const [enabled, setEnabled] = useState(false)
  const [active, setActive] = useState(false)
  const [visible, setVisible] = useState(false)
  const x = useMotionValue(-100)
  const y = useMotionValue(-100)
  const sx = useSpring(x, { stiffness: 600, damping: 40, mass: 0.4 })
  const sy = useSpring(y, { stiffness: 600, damping: 40, mass: 0.4 })

  useEffect(() => {
    const query = window.matchMedia('(pointer: fine)')
    const update = () => setEnabled(query.matches && !still)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [still])

  useEffect(() => {
    if (!enabled) return
    let lastTrail = 0
    let lastX = 0
    let lastY = 0
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      x.set(event.clientX)
      y.set(event.clientY)
      setVisible(true)
      const target = event.target as Element | null
      setActive(Boolean(target?.closest?.(INTERACTIVE)))
      // golden dust when moving with some speed
      const now = performance.now()
      const moved = Math.hypot(event.clientX - lastX, event.clientY - lastY)
      if (now - lastTrail > 45 && moved > 14) {
        lastTrail = now
        lastX = event.clientX
        lastY = event.clientY
        const dot = document.createElement('span')
        dot.className = 'cursor-trail'
        dot.setAttribute('aria-hidden', 'true')
        dot.style.left = `${event.clientX}px`
        dot.style.top = `${event.clientY}px`
        document.body.appendChild(dot)
        setTimeout(() => dot.remove(), 750)
      }
    }
    const onLeave = () => setVisible(false)
    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', onLeave)
    }
  }, [enabled, x, y])

  if (!enabled) return null
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[70] rounded-full mix-blend-multiply"
      style={{ x: sx, y: sy, translateX: '-50%', translateY: '-50%' }}
      animate={{
        width: active ? 54 : 30,
        height: active ? 54 : 30,
        opacity: visible ? 1 : 0,
        background: active
          ? 'radial-gradient(circle, rgb(31 111 122 / 0.32), rgb(31 111 122 / 0) 70%)'
          : 'radial-gradient(circle, rgb(207 132 147 / 0.45), rgb(196 161 90 / 0.18) 45%, rgb(196 161 90 / 0) 70%)',
      }}
      transition={{ duration: 0.25 }}
    />
  )
}
