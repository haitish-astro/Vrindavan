import { friendlyError, type Api } from '../data/api'
import { isVideoFile, prepareMedia } from './images'
import type { Memory, Photo } from './types'

export interface UploadStatus {
  current: number
  total: number
  /** overall progress, 0–1 */
  fraction: number
  /** what is happening to the current file */
  stage: 'preparing' | 'shrinking' | 'saving'
  video: boolean
}

/** A friendly line for the progress bar. */
export function uploadLabel(s: UploadStatus): string {
  const of = s.total > 1 ? ` ${s.current} of ${s.total}` : ''
  if (s.stage === 'preparing') return `Getting ${s.video ? 'video' : 'photo'}${of} ready…`
  if (s.stage === 'shrinking') return `Making video${of} lighter… (stays on this device until it's ready)`
  return `Saving ${s.video ? 'video' : 'photo'}${of}…`
}

/**
 * Compress and upload photos (and videos) one at a time (kind to phone memory and mobile data).
 * A photo that fails is skipped so the rest still arrive.
 */
export async function uploadPhotos(
  api: Api,
  memory: Pick<Memory, 'id' | 'space_id'>,
  files: File[],
  startOrder: number,
  onStatus: (status: UploadStatus) => void,
): Promise<{ uploaded: Photo[]; failed: number; reason?: string }> {
  const uploaded: Photo[] = []
  let failed = 0
  let reason: string | undefined
  const total = files.length
  for (let i = 0; i < total; i++) {
    const file = files[i]!
    const video = isVideoFile(file)
    // shrinking a video takes about as long as sending it, so it gets most of this file's share of the bar
    let prepShare = 0
    onStatus({ current: i + 1, total, fraction: i / total, stage: 'preparing', video })
    try {
      const media = await prepareMedia(file, (f) => {
        prepShare = 0.6
        onStatus({ current: i + 1, total, fraction: (i + f * prepShare) / total, stage: 'shrinking', video })
      })
      const photo = await api.addPhoto(memory, media, startOrder + i, (f) =>
        onStatus({ current: i + 1, total, fraction: (i + prepShare + f * (1 - prepShare)) / total, stage: 'saving', video }),
      )
      uploaded.push(photo)
    } catch (error) {
      console.error('Skipped a file', error)
      failed++
      reason ??= friendlyError(error, 'A photo or video could not be uploaded. Please try again.')
    }
  }
  onStatus({ current: total, total, fraction: 1, stage: 'saving', video: total > 0 && isVideoFile(files[total - 1]!) })
  return { uploaded, failed, reason }
}
