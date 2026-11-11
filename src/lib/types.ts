export interface SessionUser {
  id: string
  email: string
}

export interface Profile {
  id: string
  display_name: string | null
}

export interface Space {
  id: string
  name: string
  first_met_on: string | null
  welcome_greeting: string | null
  featured_message: string | null
}

/** Everything about "our world" that the app needs once someone is signed in. */
export interface World {
  space: Space
  me: Profile
  members: Profile[]
}

export interface Photo {
  id: string
  memory_id: string
  space_id: string
  uploaded_by: string | null
  storage_path: string
  thumb_path: string | null
  width: number | null
  height: number | null
  sort_order: number
  created_at: string
}

export interface MemoryNote {
  id: string
  memory_id: string
  author_id: string
  note: string | null
  favorite_moment: string | null
  updated_at: string
}

export interface Memory {
  id: string
  space_id: string
  created_by: string | null
  title: string
  happened_on: string
  location: string | null
  description: string | null
  emoji: string | null
  created_at: string
  photos: Photo[]
  notes: MemoryNote[]
}

export interface MemoryInput {
  title: string
  happened_on: string
  location: string | null
  description: string | null
  emoji: string | null
}

export interface NoteInput {
  note: string | null
  favorite_moment: string | null
}

export interface Milestone {
  id: string
  space_id: string
  created_by: string | null
  title: string
  happened_on: string
  description: string | null
  location: string | null
  photo_path: string | null
  created_at: string
}

export interface MilestoneInput {
  title: string
  happened_on: string
  description: string | null
  location: string | null
}

export type SpaceSettings = Pick<Space, 'first_met_on' | 'welcome_greeting' | 'featured_message'>
