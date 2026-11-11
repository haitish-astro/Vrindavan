import { createClient, type Session } from '@supabase/supabase-js'
import type {
  ChatMessage,
  ChatRead,
  DoodleStroke,
  Letter,
  LetterReply,
  QuickNote,
  Reaction,
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
const LETTER_SELECT = '*, replies:letter_replies(*), opens:letter_opens(*)'

function sortLetter(letter: Letter): Letter {
  letter.replies = [...(letter.replies ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  letter.opens = letter.opens ?? []
  return letter
}

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
function check(error: { message: string; code?: string } | null, message: string): void {
  if (!error) return
  console.error(message, error.message)
  // The table is missing: a newer SQL file has not been run in Supabase yet.
  if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST202') {
    throw new FriendlyError(
      'This part of our world is not set up yet. Run the newest SQL file in Supabase (see the README), then try again.',
    )
  }
  throw new FriendlyError(message)
}

/**
 * When someone taps the link in a sign-in email, Supabase sends them back here with
 * the session in the URL fragment (`#access_token=…`) or an error (`#error=…`).
 * We read it and wipe it from the address bar straight away, before the router
 * (which also uses the fragment) ever sees it.
 */
function takeSignInFromUrl(): { access: string; refresh: string } | { failed: true } | null {
  const fragment = window.location.hash.replace(/^#\/?/, '')
  if (!/(^|&)(access_token|error|error_description)=/.test(fragment)) return null
  const params = new URLSearchParams(fragment)
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  const access = params.get('access_token')
  const refresh = params.get('refresh_token')
  return access && refresh ? { access, refresh } : { failed: true }
}

export async function createSupabaseApi(url: string, anonKey: string): Promise<Api> {
  const arrival = takeSignInFromUrl()
  const sb = createClient(url, anonKey, {
    auth: {
      // The emailed link must work in whichever browser the mail app opens,
      // so the session comes back in the link itself (handled above).
      flowType: 'implicit',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

  let signInLinkFailed = false
  if (arrival && 'access' in arrival) {
    const { error } = await sb.auth.setSession({
      access_token: arrival.access,
      refresh_token: arrival.refresh,
    })
    signInLinkFailed = Boolean(error)
  } else if (arrival) {
    signInLinkFailed = true
  }

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
    signInLinkFailed,

    async getUser() {
      const { data } = await sb.auth.getSession()
      return toUser(data.session)
    },

    onAuthChange(callback) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => callback(toUser(session)))
      return () => data.subscription.unsubscribe()
    },

    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (!error) return
      if (error.status === 429) {
        throw new FriendlyError('Too many tries. Please wait a minute and try again.')
      }
      // One message for every failure, so nobody can learn which emails are on the guest list.
      throw new FriendlyError('That email and password do not match. Please try again.')
    },

    async changePassword(newPassword) {
      const { error } = await sb.auth.updateUser({ password: newPassword })
      if (!error) {
        const marked = await sb.rpc('mark_own_password')
        if (marked.error) console.error('Could not record password change', marked.error.message)
        return
      }
      if (error.code === 'weak_password') {
        throw new FriendlyError('That password is too easy to guess. Try a longer one.')
      }
      if (error.code === 'same_password') {
        throw new FriendlyError('That is already your password. Choose a different one.')
      }
      if (error.code === 'reauthentication_needed') {
        throw new FriendlyError('For safety, sign out and sign back in, then change your password straight away.')
      }
      console.error('Could not change password', error.message)
      throw new FriendlyError('Your password could not be changed. Please try again.')
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
      const profilesResult = await sb.from('profiles').select('*').in('id', ids)
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
        .select('*')
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

    // ── letters ──
    async listLetters(spaceId) {
      const { data, error } = await sb
        .from('letters')
        .select(LETTER_SELECT)
        .eq('space_id', spaceId)
        .order('updated_at', { ascending: false })
      check(error, 'We could not load your letters.')
      return ((data ?? []) as Letter[]).map(sortLetter)
    },

    async getLetter(id) {
      const { data, error } = await sb.from('letters').select(LETTER_SELECT).eq('id', id).maybeSingle()
      check(error, 'We could not open this letter.')
      return data ? sortLetter(data as Letter) : null
    },

    async saveLetter(spaceId, existing, input) {
      const userId = await requireUserId()
      const query = existing
        ? sb.from('letters').update(input).eq('id', existing.id)
        : sb.from('letters').insert({ ...input, space_id: spaceId, author_id: userId })
      const { data, error } = await query.select(LETTER_SELECT).single()
      check(
        error,
        input.status === 'sent'
          ? 'Your letter could not be sent. Nothing is lost — please try again.'
          : 'Your letter could not be saved. Nothing is lost — please try again.',
      )
      return sortLetter(data as Letter)
    },

    async deleteLetter(id) {
      const { error } = await sb.from('letters').delete().eq('id', id)
      check(error, 'This letter could not be removed.')
    },

    async markLetterOpened(letter) {
      const userId = await requireUserId()
      const { error } = await sb
        .from('letter_opens')
        .upsert(
          { letter_id: letter.id, space_id: letter.space_id, user_id: userId },
          { onConflict: 'letter_id,user_id', ignoreDuplicates: true },
        )
      if (error) console.error('Could not record letter opening', error.message)
    },

    async addLetterReply(letter, body) {
      const userId = await requireUserId()
      const { data, error } = await sb
        .from('letter_replies')
        .insert({ letter_id: letter.id, space_id: letter.space_id, author_id: userId, body })
        .select('*')
        .single()
      check(error, 'Your reply could not be sent.')
      return data as LetterReply
    },

    async deleteLetterReply(id) {
      const { error } = await sb.from('letter_replies').delete().eq('id', id)
      check(error, 'This reply could not be removed.')
    },

    // ── little notes ──
    async listQuickNotes(spaceId, limit = 60) {
      const { data, error } = await sb
        .from('quick_notes')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(limit)
      check(error, 'We could not load your little notes.')
      return (data ?? []) as QuickNote[]
    },

    async addQuickNote(spaceId, body) {
      const userId = await requireUserId()
      const { data, error } = await sb
        .from('quick_notes')
        .insert({ space_id: spaceId, author_id: userId, body })
        .select('*')
        .single()
      check(error, 'Your note could not be saved.')
      return data as QuickNote
    },

    async deleteQuickNote(id) {
      const { error } = await sb.from('quick_notes').delete().eq('id', id)
      check(error, 'This note could not be removed.')
    },

    // ── hearts ──
    async listReactions(type, targetIds) {
      if (targetIds.length === 0) return []
      const { data, error } = await sb
        .from('reactions')
        .select('id, target_type, target_id, user_id')
        .eq('target_type', type)
        .in('target_id', targetIds)
      if (error) {
        console.error('Could not load hearts', error.message)
        return []
      }
      return (data ?? []) as Reaction[]
    },

    async setHeart(spaceId, type, targetId, on) {
      const userId = await requireUserId()
      const { error } = on
        ? await sb
            .from('reactions')
            .upsert(
              { space_id: spaceId, user_id: userId, target_type: type, target_id: targetId },
              { onConflict: 'target_type,target_id,user_id', ignoreDuplicates: true },
            )
        : await sb
            .from('reactions')
            .delete()
            .eq('target_type', type)
            .eq('target_id', targetId)
            .eq('user_id', userId)
      check(error, 'Your heart could not be saved.')
    },

    // ── chat ──
    async listMessages(spaceId, before, limit = 60) {
      let query = sb
        .from('messages')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (before) query = query.lt('created_at', before)
      const { data, error } = await query
      check(error, 'We could not load your messages.')
      return ((data ?? []) as ChatMessage[]).reverse()
    },

    async sendMessage(spaceId, body) {
      const userId = await requireUserId()
      const { data, error } = await sb
        .from('messages')
        .insert({ space_id: spaceId, sender_id: userId, body })
        .select('*')
        .single()
      check(error, 'Your message could not be sent.')
      return data as ChatMessage
    },

    async deleteMessage(id) {
      const { error } = await sb.from('messages').delete().eq('id', id)
      check(error, 'This message could not be unsent.')
    },

    async listChatReads(spaceId) {
      const { data, error } = await sb.from('chat_reads').select('user_id, last_read_at').eq('space_id', spaceId)
      if (error) return []
      return (data ?? []) as ChatRead[]
    },

    async markChatRead() {
      const { error } = await sb.rpc('mark_chat_read')
      if (error) console.error('Could not mark chat as read', error.message)
    },

    async countUnread(spaceId, since) {
      const userId = await requireUserId()
      let query = sb
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('space_id', spaceId)
        .neq('sender_id', userId)
      if (since) query = query.gt('created_at', since)
      const { count, error } = await query
      return error ? 0 : (count ?? 0)
    },

    subscribeChat(spaceId, handlers) {
      const channel = sb
        .channel(`chat:${spaceId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `space_id=eq.${spaceId}` },
          (payload) => handlers.onMessage?.(payload.new as ChatMessage),
        )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) handlers.onDelete?.(id)
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_reads', filter: `space_id=eq.${spaceId}` },
          (payload) => {
            const row = payload.new as Partial<ChatRead>
            if (row?.user_id && row.last_read_at) {
              handlers.onRead?.({ user_id: row.user_id, last_read_at: row.last_read_at })
            }
          },
        )
        .subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },

    // ── doodle board ──
    async listStrokes(spaceId) {
      const { data, error } = await sb
        .from('doodle_strokes')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: true })
        .limit(3000)
      check(error, 'We could not load the doodle board.')
      return (data ?? []) as DoodleStroke[]
    },

    async addStroke(spaceId, stroke) {
      const userId = await requireUserId()
      const { data, error } = await sb
        .from('doodle_strokes')
        .insert({ ...stroke, space_id: spaceId, author_id: userId })
        .select('*')
        .single()
      check(error, 'That stroke could not be saved.')
      return data as DoodleStroke
    },

    async deleteStroke(id) {
      const { error } = await sb.from('doodle_strokes').delete().eq('id', id)
      check(error, 'That stroke could not be undone.')
    },

    async clearBoard() {
      const { error } = await sb.rpc('clear_doodle_board')
      check(error, 'The board could not be cleared.')
    },

    subscribeDoodles(spaceId, handlers) {
      const channel = sb
        .channel(`doodles:${spaceId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'doodle_strokes', filter: `space_id=eq.${spaceId}` },
          (payload) => handlers.onStroke?.(payload.new as DoodleStroke),
        )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'doodle_strokes' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) handlers.onDelete?.(id)
        })
        .subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
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
