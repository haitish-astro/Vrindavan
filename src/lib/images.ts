/** Client-side photo compression so uploads from phones are quick and light. */
import { FriendlyError } from '../data/api'

export interface PreparedImage {
  full: Blob
  thumb: Blob
  width: number
  height: number
}

const FULL_MAX = 2000
const THUMB_MAX = 640
const MAX_INPUT_BYTES = 40 * 1024 * 1024

/** Its message is written for people, so screens can show it as-is. */
export class ImageError extends FriendlyError {}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // fall through to <img> decoding
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new ImageError(`We couldn't read "${file.name}". Try a JPEG or PNG photo.`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function render(source: ImageBitmap | HTMLImageElement, maxSide: number, quality: number) {
  const sw = source.width
  const sh = source.height
  const scale = Math.min(1, maxSide / Math.max(sw, sh))
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageError('Your browser could not prepare this photo.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, width, height)
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve({ blob, width, height })
          : reject(new ImageError('Your browser could not prepare this photo.')),
      'image/jpeg',
      quality,
    )
  })
}

/** Resize to a sensible size, re-encode as JPEG (which also strips GPS/EXIF data). */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new ImageError(`"${file.name}" is not a photo.`)
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ImageError(`"${file.name}" is too large (over 40 MB).`)
  }
  const source = await decode(file)
  try {
    const full = await render(source, FULL_MAX, 0.82)
    const thumb = await render(source, THUMB_MAX, 0.75)
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height }
  } finally {
    if ('close' in source) source.close()
  }
}

// ── videos ──────────────────────────────────────────────────────────────────

export interface PreparedVideo {
  video: Blob
  type: string
  ext: 'mp4' | 'mov' | 'webm'
  /** a still frame used as the cover, or null if this browser can't read the video */
  poster: Blob | null
  width: number | null
  height: number | null
  duration: number | null
}

export type PreparedMedia = PreparedImage | PreparedVideo

const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const VIDEO_TYPES: Record<string, PreparedVideo['ext']> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

function videoType(file: File): string {
  if (file.type in VIDEO_TYPES) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.mov')) return 'video/quicktime'
  if (name.endsWith('.mp4') || name.endsWith('.m4v')) return 'video/mp4'
  if (name.endsWith('.webm')) return 'video/webm'
  return file.type
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || /\.(mov|mp4|m4v|webm)$/i.test(file.name)
}

/** Grab a frame for the cover and read the size and length. Gives up quietly after a few seconds. */
function readVideo(file: File): Promise<{ poster: Blob | null; width: number | null; height: number | null; duration: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let finished = false
    const done = (result: { poster: Blob | null; width: number | null; height: number | null; duration: number | null }) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load()
      resolve(result)
    }
    const timer = setTimeout(() => done({ poster: null, width: null, height: null, duration: null }), 8000)
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null
      video.currentTime = Math.min(0.5, (duration ?? 1) / 2)
    }
    video.onseeked = () => {
      const width = video.videoWidth || null
      const height = video.videoHeight || null
      const duration = Number.isFinite(video.duration) ? video.duration : null
      try {
        const scale = Math.min(1, 640 / Math.max(width ?? 640, height ?? 640))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round((width ?? 640) * scale))
        canvas.height = Math.max(1, Math.round((height ?? 640) * scale))
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => done({ poster: blob, width, height, duration }), 'image/jpeg', 0.78)
      } catch {
        done({ poster: null, width, height, duration })
      }
    }
    video.onerror = () => done({ poster: null, width: null, height: null, duration: null })
    video.src = url
  })
}

export async function prepareVideo(file: File): Promise<PreparedVideo> {
  const type = videoType(file)
  const ext = VIDEO_TYPES[type]
  if (!ext) throw new ImageError(`"${file.name}" is a video format we can't keep. Try MP4 or MOV.`)
  if (file.size > MAX_VIDEO_BYTES) {
    throw new ImageError(`"${file.name}" is over 50 MB. Try a shorter clip — about a minute or less.`)
  }
  const details = await readVideo(file)
  return { video: file, type, ext, ...details }
}

/** A photo or a video, ready to upload. */
export function prepareMedia(file: File): Promise<PreparedMedia> {
  return isVideoFile(file) ? prepareVideo(file) : prepareImage(file)
}
