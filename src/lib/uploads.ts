import { friendlyError, type Api } from '../data/api'
import { prepareMedia } from './images'
import type { Memory, Photo } from './types'

export interface UploadStatus {
  current: number
  total: number
  /** overall progress, 0–1 */
  fraction: number
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
    onStatus({ current: i + 1, total, fraction: i / total })
    try {
      const media = await prepareMedia(files[i]!)
      const photo = await api.addPhoto(memory, media, startOrder + i, (f) =>
        onStatus({ current: i + 1, total, fraction: (i + f) / total }),
      )
      uploaded.push(photo)
    } catch (error) {
      console.error('Skipped a file', error)
      failed++
      reason ??= friendlyError(error, 'A photo or video could not be uploaded. Please try again.')
    }
  }
  onStatus({ current: total, total, fraction: 1 })
  return { uploaded, failed, reason }
}
