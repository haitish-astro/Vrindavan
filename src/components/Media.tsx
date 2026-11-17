/** Photos and videos from private storage. */
import { Film, Play } from 'lucide-react'
import { usePhotoUrl } from '../lib/hooks'
import type { Photo } from '../lib/types'
import { PrivatePhoto } from './ui'

export const isVideo = (item: Pick<Photo, 'kind'>) => item.kind === 'video'

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return ''
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** A small square/cover for a photo or a video (with a play badge and its length). */
export function MediaThumb({
  item,
  alt,
  className = '',
  full = false,
}: {
  item: Photo
  alt: string
  className?: string
  /** use the full-size photo instead of the thumbnail */
  full?: boolean
}) {
  if (!isVideo(item)) {
    return <PrivatePhoto path={full ? item.storage_path : (item.thumb_path ?? item.storage_path)} alt={alt} className={className} />
  }
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {item.thumb_path ? (
        <PrivatePhoto path={item.thumb_path} alt={alt} className="size-full" />
      ) : (
        <div className="flex size-full items-center justify-center bg-gradient-to-br from-peacock-soft to-lavender text-peacock-deep">
          <Film className="size-7" aria-hidden />
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <span className="flex size-11 items-center justify-center rounded-full bg-ink/45 text-white backdrop-blur-sm">
          <Play className="ml-0.5 size-5 fill-white" />
        </span>
      </span>
      {item.duration_seconds ? (
        <span className="absolute right-1.5 bottom-1.5 rounded-full bg-ink/60 px-1.5 py-0.5 text-[0.68rem] font-semibold text-white">
          {formatDuration(item.duration_seconds)}
        </span>
      ) : null}
    </div>
  )
}

/** A playable private video. The link is short-lived and requested only while signed in. */
export function PrivateVideo({
  item,
  className = '',
  autoPlay = false,
  label,
}: {
  item: Photo
  className?: string
  autoPlay?: boolean
  label: string
}) {
  const video = usePhotoUrl(item.storage_path)
  const poster = usePhotoUrl(item.thumb_path)
  if (video.failed) {
    return (
      <div className={`flex items-center justify-center text-sm text-white/80 ${className}`}>
        This video could not be loaded.
      </div>
    )
  }
  if (!video.url) {
    return <div className={`animate-pulse bg-white/10 ${className}`} aria-label="Loading video" />
  }
  return (
    <video
      key={video.url}
      src={video.url}
      poster={poster.url ?? undefined}
      controls
      playsInline
      autoPlay={autoPlay}
      preload="metadata"
      className={className}
      aria-label={label}
    />
  )
}
