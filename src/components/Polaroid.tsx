import { Link } from 'react-router'
import { motion } from 'motion/react'
import { Images, MapPin } from 'lucide-react'
import type { Memory } from '../lib/types'
import { formatShort } from '../lib/dates'
import { PrivatePhoto } from './ui'

export function coverPath(memory: Memory, size: 'thumb' | 'full' = 'thumb'): string | null {
  const first = memory.photos[0]
  if (!first) return null
  return size === 'thumb' ? (first.thumb_path ?? first.storage_path) : first.storage_path
}

/** A memory shown as a Polaroid: photo, handwritten title, date. */
export function Polaroid({ memory, index = 0, large = false }: { memory: Memory; index?: number; large?: boolean }) {
  // A gentle, alternating tilt — like photos laid on a table.
  const tilt = large ? 0 : [-1.6, 1.2, -0.8, 1.8][index % 4]
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, rotate: 0 }}
      whileInView={{ opacity: 1, y: 0, rotate: tilt }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      whileHover={{ rotate: 0, y: -4 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <Link
        to={`/memories/${memory.id}`}
        className="block rounded-md border border-gold/20 bg-white p-2.5 pb-3 shadow-polaroid"
        aria-label={`${memory.title}, ${formatShort(memory.happened_on)}`}
      >
        <div className="relative">
          <PrivatePhoto
            path={coverPath(memory, large ? 'full' : 'thumb')}
            alt=""
            className={`rounded-sm ${large ? 'aspect-[4/3]' : 'aspect-square'}`}
          />
          {memory.photos.length > 1 && (
            <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-full bg-ink/55 px-2 py-0.5 text-[0.7rem] font-semibold text-white">
              <Images className="size-3" aria-hidden />
              {memory.photos.length}
            </span>
          )}
        </div>
        <div className="px-1 pt-2.5">
          <p className={`hand truncate text-ink ${large ? 'text-[1.7rem]' : ''}`}>
            {memory.emoji && <span className="mr-1 font-sans text-[0.75em]">{memory.emoji}</span>}
            {memory.title}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-soft">
            <span>{formatShort(memory.happened_on)}</span>
            {memory.location && (
              <span className="inline-flex min-w-0 items-center gap-0.5">
                <MapPin className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{memory.location}</span>
              </span>
            )}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}
