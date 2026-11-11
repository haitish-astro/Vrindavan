import type { PreparedImage } from '../lib/images'
import type {
  Memory,
  MemoryInput,
  MemoryNote,
  Milestone,
  MilestoneInput,
  NoteInput,
  Photo,
  Profile,
  SessionUser,
  Space,
  SpaceSettings,
  World,
} from '../lib/types'

/**
 * The one doorway between the app and its data.
 * `supabaseApi.ts` is the real implementation; `demoApi.ts` is an in-memory
 * stand-in that only exists in local development when Supabase is not configured.
 */
export interface Api {
  readonly mode: 'live' | 'preview'
  /** True when this page was opened from a sign-in email link that had expired or been used. */
  readonly signInLinkFailed?: boolean

  // ── sign-in ──
  getUser(): Promise<SessionUser | null>
  onAuthChange(callback: (user: SessionUser | null) => void): () => void
  sendCode(email: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signOut(): Promise<void>

  // ── our world ──
  /** Returns null when the signed-in person is not one of the two members. */
  loadWorld(): Promise<World | null>
  updateSettings(spaceId: string, patch: Partial<SpaceSettings>): Promise<Space>
  updateMyName(name: string): Promise<Profile>

  // ── memories ──
  listMemories(spaceId: string): Promise<Memory[]>
  getMemory(id: string): Promise<Memory | null>
  createMemory(spaceId: string, input: MemoryInput): Promise<Memory>
  updateMemory(id: string, input: MemoryInput): Promise<void>
  deleteMemory(memory: Memory): Promise<void>
  addPhoto(
    memory: Pick<Memory, 'id' | 'space_id'>,
    image: PreparedImage,
    sortOrder: number,
    onProgress: (fraction: number) => void,
  ): Promise<Photo>
  deletePhoto(photo: Photo): Promise<void>
  /** Saves the signed-in person's own note; never touches the partner's. */
  saveNote(
    memory: Pick<Memory, 'id' | 'space_id'>,
    existing: MemoryNote | undefined,
    input: NoteInput,
  ): Promise<MemoryNote>

  // ── timeline ──
  listMilestones(spaceId: string): Promise<Milestone[]>
  createMilestone(spaceId: string, input: MilestoneInput, image?: PreparedImage): Promise<Milestone>
  /** `image`: undefined keeps the current photo, null removes it. */
  updateMilestone(
    milestone: Milestone,
    input: MilestoneInput,
    image?: PreparedImage | null,
  ): Promise<Milestone>
  deleteMilestone(milestone: Milestone): Promise<void>

  // ── private photos ──
  /** A short-lived link to a private photo. */
  photoUrl(path: string): Promise<string>
}

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''

export async function loadApi(): Promise<Api | null> {
  if (url && key) {
    const { createSupabaseApi } = await import('./supabaseApi')
    return createSupabaseApi(url, key)
  }
  if (import.meta.env.DEV) {
    // Local preview only. This branch (and demoApi.ts) is removed from production builds.
    const { createDemoApi } = await import('./demoApi')
    return createDemoApi()
  }
  return null
}

/** Turns any thrown value into a sentence we are happy to show. */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof FriendlyError) return error.message
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You seem to be offline. Check your connection and try again.'
  }
  return fallback
}

/** An error whose message is already written for people, not for logs. */
export class FriendlyError extends Error {}
