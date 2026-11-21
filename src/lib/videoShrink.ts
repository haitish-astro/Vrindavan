/**
 * Shrinks a video right here in the browser (nothing leaves the device until the upload):
 * at most 1280 px on the long side (720p), about 2.5 Mbps, 30 fps, H.264 in MP4 so it
 * plays everywhere. The original sound is kept as it is when possible.
 *
 * Returns null when this browser can't do it (no WebCodecs, a codec it can't read, …),
 * so the caller can fall back to the original file.
 */
const LONG_SIDE = 1280
const MAX_FPS = 30
const BITRATE_720P = 2_500_000

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

export async function shrinkVideo(file: Blob, onProgress?: (fraction: number) => void): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('VideoEncoder' in window) || !('VideoDecoder' in window)) return null
  // loaded only when someone actually adds a video, so the rest of the site stays light
  const mb = await import('mediabunny')
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) return null
    const w = track.displayWidth
    const h = track.displayHeight
    const scale = Math.min(1, LONG_SIDE / Math.max(w, h))
    // keep smaller videos' bitrate in proportion to their size
    const bitrate = Math.max(700_000, Math.round(BITRATE_720P * Math.min(1, (w * scale * h * scale) / (1280 * 720))))
    let fps: number | undefined
    try {
      const stats = await track.computePacketStats(90)
      if (stats.averagePacketRate > MAX_FPS + 1) fps = MAX_FPS
    } catch {
      // unknown frame rate: leave it as it is
    }
    if (!(await mb.canEncodeVideo('avc', { width: even(w * scale), height: even(h * scale), bitrate }))) return null

    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() })
    const conversion = await mb.Conversion.init({
      input,
      output,
      tracks: 'primary',
      showWarnings: false,
      video: {
        codec: 'avc',
        bitrate,
        forceTranscode: true,
        ...(w >= h ? { width: even(w * scale) } : { height: even(h * scale) }),
        ...(fps ? { frameRate: fps } : {}),
      },
      // no audio options: the phone's AAC sound is copied over untouched
    })
    // never quietly lose the sound or the picture
    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      await conversion.cancel().catch(() => {})
      return null
    }
    conversion.onProgress = (p) => onProgress?.(Math.min(1, Math.max(0, p)))
    await conversion.execute()
    const buffer = output.target.buffer
    if (!buffer) return null
    return new Blob([buffer], { type: 'video/mp4' })
  } catch (error) {
    console.warn('Could not shrink this video here; keeping the original', error)
    return null
  } finally {
    input.dispose?.()
  }
}
