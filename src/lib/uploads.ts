import type { Api } from '../data/api'
import { prepareImage } from './images'
import type { Memory, Photo } from './types'

export interface UploadStatus {
  current: number
  total: number
  /** overall progress, 0–1 */
  fraction: number
}

/**
 * Compress and upload photos one at a time (kind to phone memory and mobile data).
 * A photo that fails is skipped so the rest still arrive.
 */
export async function uploadPhotos(
  api: Api,
  memory: Pick<Memory, 'id' | 'space_id'>,
  files: File[],
  startOrder: number,
  onStatus: (status: UploadStatus) => void,
): Promise<{ uploaded: Photo[]; failed: number }> {
  const uploaded: Photo[] = []
  let failed = 0
  const total = files.length
  for (let i = 0; i < total; i++) {
    onStatus({ current: i + 1, total, fraction: i / total })
    try {
      const image = await prepareImage(files[i]!)
      const photo = await api.addPhoto(memory, image, startOrder + i, (f) =>
        onStatus({ current: i + 1, total, fraction: (i + f) / total }),
      )
      uploaded.push(photo)
    } catch (error) {
      console.error('Photo skipped', error)
      failed++
    }
  }
  onStatus({ current: total, total, fraction: 1 })
  return { uploaded, failed }
}
