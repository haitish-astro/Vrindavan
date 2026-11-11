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
