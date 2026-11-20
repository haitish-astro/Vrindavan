import { createClient, type RealtimeChannel, type Session } from '@supabase/supabase-js'
import type {
  Game,
  MessageReaction,
  CalendarEvent,
  ScheduleBlock,
  ChessGame,
  LiveHandlers,
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
/** Chat photos keep a small copy beside them: name.jpg → name_thumb.jpg */
export const chatThumb = (path: string) => path.replace(/\.jpg$/, '_thumb.jpg')

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

/** Game errors with a kind word for the common cases. */
function gameError(error: { message: string; code?: string } | null, message: string): void {
  if (!error) return
  const m = error.message
  if (m.startsWith('stale')) throw new FriendlyError('The board changed — here is the latest.')
  if (m.includes('not your turn')) throw new FriendlyError('It is not your turn yet.')
  if (m.includes('already over') || m.includes('not in battle')) throw new FriendlyError('This game has moved on — here is the latest.')
  if (m.includes('already fired')) throw new FriendlyError('You already fired there.')
  if (m.includes('already played')) throw new FriendlyError('You already played this round.')
  if (m.includes('overlap') || m.includes('Invalid fleet')) throw new FriendlyError('That fleet is not allowed — try shuffling again.')
  check(error, message)
}

/** Throws a generic, safe message; the technical detail goes to the console only. */
function check(error: { message: string; code?: string } | null, message: string): void {
  if (!error) return
  console.error(message, error.message)
  // The table is missing: a newer SQL file has not been run in Supabase yet.
  if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST204') {
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
  // Never keep anyone signed in between visits: forget any session an older
  // version of the app saved on this device.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key && /^sb-.*-auth-token/.test(key)) localStorage.removeItem(key)
    }
  } catch {
    // storage unavailable — nothing was saved
  }
  const sb = createClient(url, anonKey, {
    auth: {
      // The emailed link must work in whichever browser the mail app opens,
      // so the session comes back in the link itself (handled above).
      flowType: 'implicit',
      // The session lives only in this open page. Opening the link again —
      // a new tab, a reload, a reopened browser — always asks for the password.
      persistSession: false,
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
  async function upload(
    path: string,
    blob: Blob,
    onProgress?: (fraction: number) => void,
    contentType = 'image/jpeg',
  ) {
    const { data } = await sb.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new FriendlyError('Your session has ended. Please sign in again.')
    const encoded = path.split('/').map(encodeURIComponent).join('/')
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${url}/storage/v1/object/${BUCKET}/${encoded}`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.setRequestHeader('apikey', anonKey)
      xhr.setRequestHeader('Content-Type', contentType)
      xhr.setRequestHeader('x-upsert', 'false')
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total)
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else {
          console.error('Upload failed', xhr.status, xhr.responseText)
          reject(
            new FriendlyError(
              xhr.status === 413
                ? 'That file is too large to keep (50 MB at most).'
                : 'A photo or video could not be uploaded. Please try again.',
            ),
          )
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

  // ── live rooms: one private channel per room, shared by every screen that needs it ──
  interface RoomEntry {
    channel: RealtimeChannel
    handlers: Set<LiveHandlers>
    refs: number
    peers: string[]
    status: 'connecting' | 'live' | 'offline'
    closeTimer?: ReturnType<typeof setTimeout>
    states: Record<string, Record<string, unknown>>
    tracked: Record<string, unknown>
    subscribed: boolean
  }
  const rooms = new Map<string, RoomEntry>()

  function openRoom(topic: string, userId: string): RoomEntry {
    const channel = sb.channel(topic, {
      config: { private: true, broadcast: { self: false, ack: false }, presence: { key: userId } },
    })
    const entry: RoomEntry = {
      channel,
      handlers: new Set(),
      refs: 0,
      peers: [],
      status: 'connecting',
      states: {},
      tracked: { online_at: new Date().toISOString() },
      subscribed: false,
    }
    const setStatus = (status: RoomEntry['status']) => {
      entry.status = status
      entry.handlers.forEach((h) => h.onStatus?.(status))
    }
    channel.on('broadcast', { event: '*' }, (message) => {
      const payload = (message.payload ?? {}) as Record<string, unknown>
      const from = typeof payload.from === 'string' ? payload.from : ''
      if (!from || from === userId) return
      entry.handlers.forEach((h) => h.onEvent?.(message.event, payload, from))
    })
    channel.on('presence', { event: 'sync' }, () => {
      const raw = channel.presenceState() as Record<string, Record<string, unknown>[]>
      entry.peers = Object.keys(raw)
      entry.states = Object.fromEntries(Object.entries(raw).map(([key, metas]) => [key, metas[metas.length - 1] ?? {}]))
      entry.handlers.forEach((h) => {
        h.onPresence?.(entry.peers)
        h.onPresenceState?.(entry.states)
      })
    })
    // Private channels need the signed-in token before joining.
    void sb.realtime
      .setAuth()
      .catch(() => {})
      .finally(() => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            setStatus('live')
            entry.subscribed = true
            void channel.track(entry.tracked)
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            entry.subscribed = false
            setStatus('offline')
          }
        })
      })
    return entry
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

    async createMemory(spaceId, input, kind = 'adventure') {
      const userId = await requireUserId()
      const { data, error } = await sb
        .from('memories')
        .insert({ ...input, space_id: spaceId, created_by: userId, ...(kind === 'call' ? { kind } : {}) })
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

    async addPhoto(memory, media, sortOrder, onProgress) {
      const userId = await requireUserId()
      const name = crypto.randomUUID()
      const folder = `${memory.space_id}/${memory.id}`
      const isVideo = 'video' in media
      const storagePath = `${folder}/${name}.${isVideo ? media.ext : 'jpg'}`
      const thumbBlob = isVideo ? media.poster : media.thumb
      const thumbPath = thumbBlob ? `${folder}/${name}_thumb.jpg` : null
      // The thumbnail is tiny; the full file carries almost all the progress.
      if (thumbBlob && thumbPath) await upload(thumbPath, thumbBlob)
      onProgress(0.05)
      if (isVideo) await upload(storagePath, media.video, (f) => onProgress(0.05 + f * 0.9), media.type)
      else await upload(storagePath, media.full, (f) => onProgress(0.05 + f * 0.9))
      const { data, error } = await sb
        .from('memory_photos')
        .insert({
          memory_id: memory.id,
          space_id: memory.space_id,
          uploaded_by: userId,
          storage_path: storagePath,
          thumb_path: thumbPath,
          width: media.width,
          height: media.height,
          sort_order: sortOrder,
          ...(isVideo ? { kind: 'video', duration_seconds: media.duration } : {}),
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
      const page = (columns: string) => {
        let query = sb
          .from('messages')
          .select(columns)
          .eq('space_id', spaceId)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (before) query = query.lt('created_at', before)
        return query
      }
      let { data, error } = await page('*, reactions:message_reactions(*)')
      // Reactions arrive with a newer SQL file; until it has been run, chat still works without them.
      if (error && (error.code === 'PGRST200' || error.code === 'PGRST205' || error.code === '42P01')) {
        ;({ data, error } = await page('*'))
      }
      check(error, 'We could not load your messages.')
      return ((data ?? []) as unknown as ChatMessage[]).reverse()
    },

    async sendMessage(spaceId, body, image, onProgress) {
      const userId = await requireUserId()
      let imagePath: string | null = null
      if (image) {
        const name = crypto.randomUUID()
        imagePath = `${spaceId}/chat/${name}.jpg`
        await upload(`${spaceId}/chat/${name}_thumb.jpg`, image.thumb)
        onProgress?.(0.1)
        await upload(imagePath, image.full, (f) => onProgress?.(0.1 + f * 0.85))
      }
      const { data, error } = await sb
        .from('messages')
        .insert({
          space_id: spaceId,
          sender_id: userId,
          body,
          ...(image ? { image_path: imagePath, image_width: image.width, image_height: image.height } : {}),
        })
        .select('*')
        .single()
      if (error && imagePath) await removeFiles([imagePath, chatThumb(imagePath)])
      check(error, 'Your message could not be sent.')
      onProgress?.(1)
      return data as ChatMessage
    },

    async deleteMessage(message) {
      const { error } = await sb.from('messages').delete().eq('id', message.id)
      check(error, 'This message could not be unsent.')
      if (message.image_path) await removeFiles([message.image_path, chatThumb(message.image_path)])
    },

    async reactToMessage(messageId, emoji) {
      const { error } = await sb.rpc('react_to_message', { target: messageId, reaction: emoji })
      check(error, 'Your reaction could not be saved.')
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
      // Reactions on their own channel, so chat keeps working even before their table exists.
      const reactions = sb
        .channel(`chat-reactions:${spaceId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'message_reactions', filter: `space_id=eq.${spaceId}` },
          (payload) => {
            const row = payload.new as Partial<MessageReaction>
            if (row?.id && row.message_id && row.user_id && row.emoji) handlers.onReaction?.(row as MessageReaction)
          },
        )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, (payload) => {
          const id = (payload.old as { id?: string }).id
          if (id) handlers.onReactionRemoved?.(id)
        })
        .subscribe()
      return () => {
        void sb.removeChannel(channel)
        void sb.removeChannel(reactions)
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

    // ── calendar ──
    async listEvents(spaceId) {
      const { data, error } = await sb
        .from('calendar_events')
        .select('*')
        .eq('space_id', spaceId)
        .order('event_date', { ascending: true })
      check(error, 'We could not load the calendar.')
      return (data ?? []) as CalendarEvent[]
    },

    async saveEvent(spaceId, existing, input) {
      const userId = await requireUserId()
      const query = existing
        ? sb.from('calendar_events').update(input).eq('id', existing.id)
        : sb.from('calendar_events').insert({ ...input, space_id: spaceId, created_by: userId })
      const { data, error } = await query.select('*').single()
      check(error, 'This date could not be saved.')
      return data as CalendarEvent
    },

    async deleteEvent(id) {
      const { error } = await sb.from('calendar_events').delete().eq('id', id)
      check(error, 'This date could not be removed.')
    },

    // ── our week ──
    async listBlocks(spaceId) {
      const { data, error } = await sb
        .from('schedule_blocks')
        .select('*')
        .eq('space_id', spaceId)
        .order('start_minute', { ascending: true })
      check(error, 'We could not load your week.')
      return (data ?? []) as ScheduleBlock[]
    },

    async addBlocks(spaceId, inputs) {
      const userId = await requireUserId()
      const { data, error } = await sb
        .from('schedule_blocks')
        .insert(inputs.map((input) => ({ ...input, space_id: spaceId, user_id: userId })))
        .select('*')
      check(error, 'This could not be added to your week.')
      return (data ?? []) as ScheduleBlock[]
    },

    async updateBlock(id, input) {
      const { data, error } = await sb.from('schedule_blocks').update(input).eq('id', id).select('*').single()
      check(error, 'Your change could not be saved.')
      return data as ScheduleBlock
    },

    async deleteBlock(id) {
      const { error } = await sb.from('schedule_blocks').delete().eq('id', id)
      check(error, 'This could not be removed.')
    },

    // ── live presence ──
    joinRoom(spaceId, room, userId, handlers) {
      const topic = `space:${spaceId}:${room}`
      let entry = rooms.get(topic)
      if (entry?.closeTimer) {
        clearTimeout(entry.closeTimer)
        entry.closeTimer = undefined
      }
      if (!entry) {
        entry = openRoom(topic, userId)
        rooms.set(topic, entry)
      }
      const room$ = entry
      room$.handlers.add(handlers)
      room$.refs++
      handlers.onStatus?.(room$.status)
      if (room$.peers.length) {
        handlers.onPresence?.(room$.peers)
        handlers.onPresenceState?.(room$.states)
      }
      let left = false
      return {
        send(event, payload) {
          if (left) return
          void room$.channel.send({ type: 'broadcast', event, payload: { ...payload, from: userId } })
        },
        track(state) {
          if (left) return
          room$.tracked = { ...state, online_at: room$.tracked.online_at }
          if (room$.subscribed) void room$.channel.track(room$.tracked)
        },
        leave() {
          if (left) return
          left = true
          room$.handlers.delete(handlers)
          room$.refs--
          if (room$.refs <= 0) {
            // A short grace period, so moving between screens does not drop the connection.
            room$.closeTimer = setTimeout(() => {
              rooms.delete(topic)
              void sb.removeChannel(room$.channel)
            }, 1500)
          }
        },
      }
    },

    // ── being together ──
    async storageUsage() {
      const { data, error } = await sb.rpc('space_storage_usage')
      if (error) {
        if (error.code !== 'PGRST202') console.error('Could not read storage use', error.message)
        return null
      }
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, number | string> | undefined
      if (!row) return null
      return {
        photoBytes: Number(row.photo_bytes ?? 0),
        videoBytes: Number(row.video_bytes ?? 0),
        photoFiles: Number(row.photo_files ?? 0),
        videoFiles: Number(row.video_files ?? 0),
      }
    },

    async touchLastSeen() {
      const { error } = await sb.rpc('touch_last_seen')
      if (error && error.code !== 'PGRST202') console.error('Could not update last seen', error.message)
    },

    async markSeen(section) {
      const { error } = await sb.rpc('mark_section_seen', { which: section })
      if (error && error.code !== 'PGRST202') console.error('Could not mark as seen', error.message)
    },

    async countUpdates(spaceId, userId) {
      const fallback = new Date(Date.now() - 7 * 86_400_000).toISOString()
      const seenRows = await sb.from('section_seen').select('section, seen_at').eq('user_id', userId)
      const seen = Object.fromEntries(((seenRows.data ?? []) as { section: string; seen_at: string }[]).map((r) => [r.section, r.seen_at]))
      const since = (section: string) => seen[section] ?? fallback
      // Each count quietly becomes 0 if its table does not exist yet.
      const count = async (table: string, author: string, section: string, extra?: (q: any) => any, dateColumn = 'created_at') => {
        let query = sb
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('space_id', spaceId)
          .neq(author, userId)
          .gt(dateColumn, since(section))
        if (extra) query = extra(query)
        const { count: n, error } = await query
        return error ? 0 : (n ?? 0)
      }
      const waiting = sb
        .from('games')
        .select('kind, status, turn_id, state, p1_id')
        .eq('space_id', spaceId)
        .in('status', ['setup', 'active'])
      const [memories, letters, notes, calendar, doodles, chess, games] = await Promise.all([
        count('memories', 'created_by', 'memories'),
        count('letters', 'author_id', 'letters', (q) => q.eq('status', 'sent'), 'sent_at'),
        count('quick_notes', 'author_id', 'letters'),
        count('calendar_events', 'created_by', 'calendar'),
        count('doodle_strokes', 'author_id', 'world'),
        sb.from('chess_games').select('white_id, black_id, moves, status').eq('space_id', spaceId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        waiting,
      ])
      const game = chess.error ? null : (chess.data as { white_id: string; black_id: string; moves: string[]; status: string } | null)
      const chessTurn = Boolean(
        game && game.status === 'active' && (game.moves.length % 2 === 0 ? game.white_id : game.black_id) === userId,
      )
      const myKey = (g: { p1_id: string }) => (g.p1_id === userId ? 'p1' : 'p2')
      const waitingOnMe = games.error
        ? 0
        : ((games.data ?? []) as { kind: string; status: string; turn_id: string | null; state: Record<string, any>; p1_id: string }[]).filter(
            (g) =>
              g.turn_id === userId ||
              (g.kind === 'sea_battle' && g.status === 'setup' && !g.state?.ready?.[myKey(g)]) ||
              (g.kind === 'quiz' && g.status === 'active' && !g.state?.submitted?.[myKey(g)]),
          ).length
      return { memories, letters: letters + notes, calendar, doodles, chessTurn, games: waitingOnMe + (chessTurn ? 1 : 0) }
    },

    // ── games corner ──
    async listGames(spaceId) {
      const { data, error } = await sb
        .from('games')
        .select('*')
        .eq('space_id', spaceId)
        .neq('status', 'abandoned')
        .order('created_at', { ascending: false })
        .limit(40)
      check(error, 'We could not load the games.')
      return (data ?? []) as Game[]
    },

    async latestGame(spaceId, kind) {
      const { data, error } = await sb
        .from('games')
        .select('*')
        .eq('space_id', spaceId)
        .eq('kind', kind)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      check(error, 'We could not load this game.')
      return (data as Game | null) ?? null
    },

    async newGame(kind, initial) {
      const { error } = await sb.rpc('game_new', { which: kind, initial })
      if (error?.message.includes('not joined')) throw new FriendlyError('Your love has not joined yet — games need two.')
      check(error, 'A new game could not be started.')
    },

    async gameMove(game, state, nextTurn, outcome) {
      const { error } = await sb.rpc('game_move', {
        gid: game.id,
        expected_version: game.version,
        new_state: state,
        next_turn: nextTurn,
        outcome,
      })
      gameError(error, 'That move could not be saved.')
    },

    async gameResign(gameId) {
      const { error } = await sb.rpc('game_resign', { gid: gameId })
      gameError(error, 'Could not resign this game.')
    },

    async seaPlace(gameId, ships) {
      const { error } = await sb.rpc('sea_place', { gid: gameId, ships })
      gameError(error, 'Your fleet could not be placed.')
    },

    async seaFire(gameId, version, cell) {
      const { data, error } = await sb.rpc('sea_fire', { gid: gameId, expected_version: version, cell })
      gameError(error, 'That shot could not be fired.')
      return data as { hit: boolean; sunk: boolean; won: boolean }
    },

    async quizPlay(gameId, answers, guesses) {
      const { error } = await sb.rpc('quiz_play', { gid: gameId, answers, guesses })
      gameError(error, 'Your answers could not be saved.')
    },

    async mySecret(gameId) {
      const userId = await requireUserId()
      const { data, error } = await sb.from('game_secrets').select('secret').eq('game_id', gameId).eq('user_id', userId).maybeSingle()
      if (error) return null
      return (data?.secret as Record<string, unknown> | undefined) ?? null
    },

    subscribeGames(spaceId, onGame) {
      const channel = sb
        .channel(`games-db:${spaceId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `space_id=eq.${spaceId}` },
          (payload) => {
            if (payload.new && 'id' in payload.new) onGame(payload.new as Game)
          },
        )
        .subscribe()
      return () => {
        void sb.removeChannel(channel)
      }
    },

    // ── chess ──
    async latestChessGame(spaceId) {
      const { data, error } = await sb
        .from('chess_games')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      check(error, 'We could not load the chess board.')
      return (data as ChessGame | null) ?? null
    },

    async newChessGame(playAs) {
      const { error } = await sb.rpc('chess_new_game', { play_as: playAs })
      if (error?.message.includes('not joined')) {
        throw new FriendlyError('Your love has not joined yet — chess needs two.')
      }
      check(error, 'A new game could not be started.')
    },

    async chessMove(gameId, move) {
      const { error } = await sb.rpc('chess_move', {
        game_id: gameId,
        expected_ply: move.expectedPly,
        san: move.san,
        uci: move.uci,
        new_fen: move.fen,
        new_status: move.status,
      })
      if (!error) return
      if (error.message.startsWith('stale')) throw new FriendlyError('The board changed — here is the latest position.')
      if (error.message.includes('not your turn')) throw new FriendlyError('It is not your turn yet.')
      if (error.message.includes('already over')) throw new FriendlyError('This game is already over.')
      check(error, 'That move could not be saved.')
    },

    async chessResign(gameId) {
      const { error } = await sb.rpc('chess_resign', { game_id: gameId })
      check(error, 'Could not resign this game.')
    },

    async chessDraw(gameId) {
      const { data, error } = await sb.rpc('chess_draw', { game_id: gameId })
      check(error, 'Could not offer a draw.')
      return data === 'agreed' ? 'agreed' : 'offered'
    },

    subscribeChess(spaceId, onGame) {
      const channel = sb
        .channel(`chess-db:${spaceId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chess_games', filter: `space_id=eq.${spaceId}` },
          (payload) => {
            if (payload.new && 'id' in payload.new) onGame(payload.new as ChessGame)
          },
        )
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
