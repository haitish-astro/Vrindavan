/**
 * PREVIEW MODE — local development only.
 *
 * An in-memory stand-in for Supabase so the app can be explored with
 * `npm run dev` before the Supabase keys are configured. Nothing is saved:
 * everything disappears on reload. This file is never included in a
 * production build (see loadApi in api.ts).
 */
import type {
  Memory,
  MemoryNote,
  Milestone,
  Photo,
  Profile,
  SessionUser,
  Space,
} from '../lib/types'
import type { Api } from './api'

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))
const now = () => new Date().toISOString()

export function createDemoApi(): Api {
  let user: SessionUser | null = null
  const listeners = new Set<(user: SessionUser | null) => void>()
  const me: Profile = { id: 'demo-me', display_name: null }
  const partner: Profile = { id: 'demo-partner', display_name: null }
  let space: Space = {
    id: 'demo-space',
    name: 'Our Little Vrindavan',
    first_met_on: null,
    welcome_greeting: null,
    featured_message: null,
  }
  let memories: Memory[] = []
  let milestones: Milestone[] = []
  const files = new Map<string, string>()

  const store = (path: string, blob: Blob) => files.set(path, URL.createObjectURL(blob))
  const emit = () => listeners.forEach((l) => l(user))
  const find = (id: string) => memories.find((m) => m.id === id)

  return {
    mode: 'preview',

    async getUser() {
      return user
    },
    onAuthChange(callback) {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    async signInWithPassword(email) {
      await wait()
      user = { id: me.id, email }
      emit()
    },
    async changePassword() {
      await wait()
    },
    async sendCode() {
      await wait()
    },
    async verifyCode(email) {
      await wait()
      user = { id: me.id, email }
      emit()
    },
    async signOut() {
      user = null
      emit()
    },

    async loadWorld() {
      await wait()
      return { space, me, members: [me, partner] }
    },
    async updateSettings(_spaceId, patch) {
      await wait()
      space = { ...space, ...patch }
      return space
    },
    async updateMyName(name) {
      await wait()
      me.display_name = name
      return { ...me }
    },

    async listMemories() {
      await wait()
      return [...memories].sort((a, b) => b.happened_on.localeCompare(a.happened_on))
    },
    async getMemory(id) {
      await wait(150)
      const memory = find(id)
      return memory ? { ...memory, photos: [...memory.photos], notes: [...memory.notes] } : null
    },
    async createMemory(spaceId, input) {
      await wait()
      const memory: Memory = {
        ...input,
        id: crypto.randomUUID(),
        space_id: spaceId,
        created_by: me.id,
        created_at: now(),
        photos: [],
        notes: [],
      }
      memories.push(memory)
      return memory
    },
    async updateMemory(id, input) {
      await wait()
      const memory = find(id)
      if (memory) Object.assign(memory, input)
    },
    async deleteMemory(memory) {
      await wait()
      memories = memories.filter((m) => m.id !== memory.id)
    },
    async addPhoto(memory, image, sortOrder, onProgress) {
      for (const step of [0.2, 0.5, 0.8, 1]) {
        await wait(120)
        onProgress(step)
      }
      const id = crypto.randomUUID()
      const photo: Photo = {
        id,
        memory_id: memory.id,
        space_id: memory.space_id,
        uploaded_by: me.id,
        storage_path: `${memory.space_id}/${memory.id}/${id}.jpg`,
        thumb_path: `${memory.space_id}/${memory.id}/${id}_thumb.jpg`,
        width: image.width,
        height: image.height,
        sort_order: sortOrder,
        created_at: now(),
      }
      store(photo.storage_path, image.full)
      store(photo.thumb_path!, image.thumb)
      find(memory.id)?.photos.push(photo)
      return photo
    },
    async deletePhoto(photo) {
      await wait()
      const memory = find(photo.memory_id)
      if (memory) memory.photos = memory.photos.filter((p) => p.id !== photo.id)
    },
    async saveNote(memory, existing, input) {
      await wait()
      const target = find(memory.id)
      const note: MemoryNote = {
        id: existing?.id ?? crypto.randomUUID(),
        memory_id: memory.id,
        author_id: me.id,
        ...input,
        updated_at: now(),
      }
      if (target) target.notes = [...target.notes.filter((n) => n.id !== note.id), note]
      return note
    },

    async listMilestones() {
      await wait()
      return [...milestones].sort((a, b) => a.happened_on.localeCompare(b.happened_on))
    },
    async createMilestone(spaceId, input, image) {
      await wait()
      const id = crypto.randomUUID()
      let photoPath: string | null = null
      if (image) {
        photoPath = `${spaceId}/milestones/${id}.jpg`
        store(photoPath, image.full)
      }
      const milestone: Milestone = {
        ...input,
        id,
        space_id: spaceId,
        created_by: me.id,
        photo_path: photoPath,
        created_at: now(),
      }
      milestones.push(milestone)
      return milestone
    },
    async updateMilestone(milestone, input, image) {
      await wait()
      let photoPath = milestone.photo_path
      if (image) {
        photoPath = `${milestone.space_id}/milestones/${crypto.randomUUID()}.jpg`
        store(photoPath, image.full)
      } else if (image === null) {
        photoPath = null
      }
      const updated = { ...milestone, ...input, photo_path: photoPath }
      milestones = milestones.map((m) => (m.id === milestone.id ? updated : m))
      return updated
    },
    async deleteMilestone(milestone) {
      await wait()
      milestones = milestones.filter((m) => m.id !== milestone.id)
    },

    async photoUrl(path) {
      const url = files.get(path)
      if (!url) throw new Error('Photo unavailable')
      return url
    },
  }
}
