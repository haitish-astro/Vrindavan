import { createClient, type Session } from '@supabase/supabase-js'
import type {
  Memory,
  MemoryNote,
  Milestone,
  Photo,
  Profile,
  SessionUser,
  Space,
} from '../lib/types'
import { FriendlyError, type Api } from './api'

const BUCKET = 'memories'
const SIGNED_URL_SECONDS = 60 * 60
const MEMORY_SELECT = '*, photos:memory_photos(*), notes:memory_notes(*)'

function toUser(session: Session | null): SessionUser | null {
  if (!session?.user) return null
  return { id: session.user.id, email: session.user.email ?? '' }
}

function sortMemory(memory: Memory): Memory {
  memory.photos = [...(memory.photos ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  )
  memory.notes = memory.notes ?? []
  return memory
}

/** Throws a generic, safe message; the technical detail goes to the console only. */
function check(error: { message: string } | null, message: string): void {
  if (error) {
    console.error(message, error.message)
    throw new FriendlyError(message)
  }
}

export function createSupabaseApi(url: string, anonKey: string): Api {
  const sb = createClient(url, anonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  async function requireUserId(): Promise<string> {
    const { data } = await sb.auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new FriendlyError('Your session has ended. Please sign in again.')
    return id
  }

  // ── uploads (XHR so we can show real progress) ──
  async function upload(path: string, blob: Blob, onProgress?: (fraction: number) => void) {
    const { data } = await sb.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new FriendlyError('Your session has ended. Please sign in again.')
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${url}/storage/v1/object/${BUCKET}/${encoded}`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('apikey', anonKey)
      xhr.setRequestHeader('Content-Type', 'image/jpeg')
      xhr.setRequestHeader('x-upsert', 'false')
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total)
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else {
          console.error('Photo upload failed', xhr.status, xhr.responseText)
          reject(new FriendlyError('A photo could not be uploaded. Please try again.'))
        }
      }
      xhr.onerror = () =>
        reject(new FriendlyError('The upload was interrupted. Check your connection and try again.'))
      xhr.send(blob)
    })
  }

  async function removeFiles(paths: (string | null | undefined)[]) {
    const list = paths.filter((p): p is string => Boolean(p))
    if (list.length === 0) return
    const { error } = await sb.storage.from(BUCKET).remove(list)
    if (error) console.error('Could not remove photo files', error.message)
  }

  // ── signed photo links, batched and cached ──
  const urlCache = new Map<string, { url: string; expires: number }>()
  type Waiter = { resolve: (url: string) => void; reject: (error: Error) => void }
  let waiting = new Map<string, Waiter[]>()
  let flushTimer: ReturnType<typeof setTimeout> | undefined

  async function flushPhotoUrls() {
    const batch = waiting
    waiting = new Map()
    flushTimer = undefined
    const paths = [...batch.keys()]
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
    const expires = Date.now() + (SIGNED_URL_SECONDS - 300) * 1000
    for (const path of paths) {
      const signed = error ? undefined : data?.find((entry) => entry.path === path)?.signedUrl
      const waiters = batch.get(path) ?? []
      if (signed) {
        urlCache.set(path, { url: signed, expires })
        waiters.forEach((w) => w.resolve(signed))
      } else {
        waiters.forEach((w) => w.reject(new Error('Photo unavailable')))
      }
    }
  }

  const api: Api = {
    mode: 'live',

    async getUser() {
      const { data } = await sb.auth.getSession()
      return toUser(data.session)
    },

    onAuthChange(callback) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => callback(toUser(session)))
      return () => data.subscription.unsubscribe()
    },

    async sendCode(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: {
          // Invite-only: signing in never creates a new account.
          shouldCreateUser: false,
          emailRedirectTo: window.location.origin + window.location.pathname,
        },
      })
      if (!error) return
      // Do not reveal whether an email is on the guest list.
      if (error.code === 'otp_disabled' || error.code === 'signup_disabled' || error.code === 'user_not_found') {
        return
      }
      if (/signups? not allowed/i.test(error.message)) return
      if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
        throw new FriendlyError('That was a lot of requests. Please wait a minute and try again.')
      }
      console.error('Could not send sign-in email', error.message)
      throw new FriendlyError('We could not send the sign-in email. Please try again in a moment.')
    },

    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' })
      if (error) {
        throw new FriendlyError('That code did not work. It may have expired — ask for a new one.')
      }
    },

    async signOut() {
      urlCache.clear()
      await sb.auth.signOut()
    },

    async loadWorld() {
      const userId = await requireUserId()
      const claim = await sb.rpc('claim_membership')
      check(claim.error, 'We could not open your little world. Please try again.')
      const spaceId = claim.data as string | null
      if (!spaceId) return null

      const [spaceResult, membersResult] = await Promise.all([
        sb.from('couple_spaces').select('*').eq('id', spaceId).maybeSingle(),
        sb.from('couple_members').select('user_id').eq('space_id', spaceId),
      ])
      check(spaceResult.error, 'We could not open your little world. Please try again.')
      check(membersResult.error, 'We could not open your little world. Please try again.')
      if (!spaceResult.data) return null

      const ids = (membersResult.data ?? []).map((m) => m.user_id as string)
      const profilesResult = await sb.from('profiles').select('id, display_name').in('id', ids)
      check(profilesResult.error, 'We could not open your little world. Please try again.')
      const members = (profilesResult.data ?? []) as Profile[]
      const me = members.find((p) => p.id === userId) ?? { id: userId, display_name: null }
      return { space: spaceResult.data as Space, me, members }
    },

    async updateSettings(spaceId, patch) {
      const { data, error } = await sb
        .from('couple_spaces')
        .update(patch)
        .eq('id', spaceId)
        .select('*')
        .single()
      check(error, 'Your settings could not be saved.')
      return data as Space
    },

    async updateMyName(name) {
      const userId = await requireUserId()
      const { data, error } = await sb
        .from('profiles')
        .update({ display_name: name })
        .eq('id', userId)
        .select('id, display_name')
        .single()
      check(error, 'Your name could not be saved.')
      return data as Profile
    },

    async listMemories(spaceId) {
      const { data, error } = await sb
        .from('memories')
        .select(MEMORY_SELECT)
        .eq('space_id', spaceId)
        .order('happened_on', { ascending: false })
        .order('created_at', { ascending: false })
      check(error, 'We could not load your memories.')
      return ((data ?? []) as Memory[]).map(sortMemory)
    },

    async getMemory(id) {
      const { data, error } = await sb.from('memories').select(MEMORY_SELECT).eq('id', id).maybeSingle()
      check(error, 'We could not open this memory.')
      return data ? sortMemory(data as Memory) : null
    },

    async createMemory(spaceId, input) {
      const userId = await requireUserId()
      const { data, error } = await sb
        .from('memories')
        .insert({ ...input, space_id: spaceId, created_by: userId })
        .select('*')
        .single()
      check(error, 'This memory could not be saved.')
      return { ...(data as Memory), photos: [], notes: [] }
    },

    async updateMemory(id, input) {
      const { error } = await sb.from('memories').update(input).eq('id', id)
      check(error, 'Your changes could not be saved.')
    },

    async deleteMemory(memory) {
      const { error } = await sb.from('memories').delete().eq('id', memory.id)
      check(error, 'This memory could not be removed.')
      await removeFiles(memory.photos.flatMap((p) => [p.storage_path, p.thumb_path]))
    },

    async addPhoto(memory, image, sortOrder, onProgress) {
      const userId = await requireUserId()
      const name = crypto.randomUUID()
      const folder = `${memory.space_id}/${memory.id}`
      const storagePath = `${folder}/${name}.jpg`
      const thumbPath = `${folder}/${name}_thumb.jpg`
      // The thumbnail is tiny; the full photo carries almost all the progress.
      await upload(thumbPath, image.thumb)
      onProgress(0.05)
      await upload(storagePath, image.full, (f) => onProgress(0.05 + f * 0.9))
      const { data, error } = await sb
        .from('memory_photos')
        .insert({
          memory_id: memory.id,
          space_id: memory.space_id,
          uploaded_by: userId,
          storage_path: storagePath,
          thumb_path: thumbPath,
          width: image.width,
          height: image.height,
          sort_order: sortOrder,
        })
        .select('*')
        .single()
      if (error) {
        await removeFiles([storagePath, thumbPath])
        check(error, 'A photo could not be saved. Please try again.')
      }
      onProgress(1)
      return data as Photo
    },

    async deletePhoto(photo) {
      const { error } = await sb.from('memory_photos').delete().eq('id', photo.id)
      check(error, 'This photo could not be removed.')
      await removeFiles([photo.storage_path, photo.thumb_path])
    },

    async saveNote(memory, existing, input) {
      const userId = await requireUserId()
      const query = existing
        ? sb.from('memory_notes').update(input).eq('id', existing.id)
        : sb
            .from('memory_notes')
            .insert({ ...input, memory_id: memory.id, space_id: memory.space_id, author_id: userId })
      const { data, error } = await query.select('*').single()
      check(error, 'Your note could not be saved.')
      return data as MemoryNote
    },

    async listMilestones(spaceId) {
      const { data, error } = await sb
        .from('timeline_milestones')
        .select('*')
        .eq('space_id', spaceId)
        .order('happened_on', { ascending: true })
      check(error, 'We could not load your story.')
      return (data ?? []) as Milestone[]
    },

    async createMilestone(spaceId, input, image) {
      const userId = await requireUserId()
      let photoPath: string | null = null
      if (image) {
        photoPath = `${spaceId}/milestones/${crypto.randomUUID()}.jpg`
        await upload(photoPath, image.full)
      }
      const { data, error } = await sb
        .from('timeline_milestones')
        .insert({ ...input, space_id: spaceId, created_by: userId, photo_path: photoPath })
        .select('*')
        .single()
      if (error) {
        await removeFiles([photoPath])
        check(error, 'This milestone could not be saved.')
      }
      return data as Milestone
    },

    async updateMilestone(milestone, input, image) {
      let photoPath = milestone.photo_path
      if (image) {
        photoPath = `${milestone.space_id}/milestones/${crypto.randomUUID()}.jpg`
        await upload(photoPath, image.full)
      } else if (image === null) {
        photoPath = null
      }
      const { data, error } = await sb
        .from('timeline_milestones')
        .update({ ...input, photo_path: photoPath })
        .eq('id', milestone.id)
        .select('*')
        .single()
      if (error) {
        if (photoPath !== milestone.photo_path) await removeFiles([photoPath])
        check(error, 'Your changes could not be saved.')
      }
      if (photoPath !== milestone.photo_path) await removeFiles([milestone.photo_path])
      return data as Milestone
    },

    async deleteMilestone(milestone) {
      const { error } = await sb.from('timeline_milestones').delete().eq('id', milestone.id)
      check(error, 'This milestone could not be removed.')
      await removeFiles([milestone.photo_path])
    },

    photoUrl(path) {
      const cached = urlCache.get(path)
      if (cached && cached.expires > Date.now()) return Promise.resolve(cached.url)
      return new Promise<string>((resolve, reject) => {
        const waiters = waiting.get(path) ?? []
        waiters.push({ resolve, reject })
        waiting.set(path, waiters)
        flushTimer ??= setTimeout(() => void flushPhotoUrls(), 20)
      })
    },
  }

  return api
}
