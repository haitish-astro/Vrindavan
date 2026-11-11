-- ============================================================================
-- Our Little Vrindavan — Phase 2: memories, photos, notes, timeline
-- Run AFTER 20261111000100_foundation.sql. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.memories (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.couple_spaces (id) on delete cascade,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 120),
  happened_on date not null,
  location    text check (char_length(location) <= 120),
  description text check (char_length(description) <= 4000),
  emoji       text check (char_length(emoji) <= 16),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, space_id)
);

-- Photos live in the private "memories" storage bucket; rows here point at them.
create table if not exists public.memory_photos (
  id           uuid primary key default gen_random_uuid(),
  memory_id    uuid not null,
  space_id     uuid not null,
  uploaded_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  storage_path text not null unique,
  thumb_path   text,
  width        integer check (width  is null or width  > 0),
  height       integer check (height is null or height > 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  -- The photo must belong to a memory in the SAME space...
  foreign key (memory_id, space_id) references public.memories (id, space_id) on delete cascade,
  -- ...and its files must sit inside that space's folder.
  check (storage_path like space_id::text || '/%'),
  check (thumb_path is null or thumb_path like space_id::text || '/%')
);

-- One personal note (and favourite moment) per person per memory,
-- so the two of you can never overwrite each other's words.
create table if not exists public.memory_notes (
  id              uuid primary key default gen_random_uuid(),
  memory_id       uuid not null,
  space_id        uuid not null,
  author_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  note            text check (char_length(note) <= 4000),
  favorite_moment text check (char_length(favorite_moment) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (memory_id, author_id),
  foreign key (memory_id, space_id) references public.memories (id, space_id) on delete cascade
);

-- Milestones that are not adventures (first meeting, important conversations...).
-- Adventures appear on the timeline automatically, straight from `memories`.
create table if not exists public.timeline_milestones (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.couple_spaces (id) on delete cascade,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  title       text not null check (char_length(title) between 1 and 120),
  happened_on date not null,
  description text check (char_length(description) <= 2000),
  location    text check (char_length(location) <= 120),
  photo_path  text check (photo_path is null or photo_path like space_id::text || '/%'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists memories_space_date_idx   on public.memories (space_id, happened_on desc);
create index if not exists memory_photos_memory_idx  on public.memory_photos (memory_id, sort_order);
create index if not exists memory_notes_memory_idx   on public.memory_notes (memory_id);
create index if not exists milestones_space_date_idx on public.timeline_milestones (space_id, happened_on);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists memories_touch on public.memories;
create trigger memories_touch before update on public.memories
  for each row execute function public.touch_updated_at();

drop trigger if exists memory_notes_touch on public.memory_notes;
create trigger memory_notes_touch before update on public.memory_notes
  for each row execute function public.touch_updated_at();

drop trigger if exists timeline_milestones_touch on public.timeline_milestones;
create trigger timeline_milestones_touch before update on public.timeline_milestones
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.memories            enable row level security;
alter table public.memory_photos       enable row level security;
alter table public.memory_notes        enable row level security;
alter table public.timeline_milestones enable row level security;

revoke all on table public.memories, public.memory_photos, public.memory_notes, public.timeline_milestones
  from anon, authenticated;

grant select, insert, delete on table public.memories to authenticated;
grant update (title, happened_on, location, description, emoji) on table public.memories to authenticated;

grant select, insert, delete on table public.memory_photos to authenticated;

grant select, insert, delete on table public.memory_notes to authenticated;
grant update (note, favorite_moment) on table public.memory_notes to authenticated;

grant select, insert, delete on table public.timeline_milestones to authenticated;
grant update (title, happened_on, description, location, photo_path)
  on table public.timeline_milestones to authenticated;

-- memories: both read; each person edits/deletes what they created.
drop policy if exists "memories: members read" on public.memories;
create policy "memories: members read" on public.memories
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "memories: members add" on public.memories;
create policy "memories: members add" on public.memories
  for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = (select auth.uid()));

drop policy if exists "memories: creator edits" on public.memories;
create policy "memories: creator edits" on public.memories
  for update to authenticated
  using (public.is_space_member(space_id) and created_by = (select auth.uid()))
  with check (public.is_space_member(space_id) and created_by = (select auth.uid()));

drop policy if exists "memories: creator deletes" on public.memories;
create policy "memories: creator deletes" on public.memories
  for delete to authenticated
  using (public.is_space_member(space_id) and created_by = (select auth.uid()));

-- memory_photos: both read and add; remove your own (or any on a memory you created).
drop policy if exists "photos: members read" on public.memory_photos;
create policy "photos: members read" on public.memory_photos
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "photos: members add" on public.memory_photos;
create policy "photos: members add" on public.memory_photos
  for insert to authenticated
  with check (public.is_space_member(space_id) and uploaded_by = (select auth.uid()));

drop policy if exists "photos: uploader or memory creator removes" on public.memory_photos;
create policy "photos: uploader or memory creator removes" on public.memory_photos
  for delete to authenticated
  using (
    public.is_space_member(space_id)
    and (
      uploaded_by = (select auth.uid())
      or exists (
        select 1 from public.memories m
        where m.id = memory_id and m.created_by = (select auth.uid())
      )
    )
  );

-- memory_notes: both read; each person writes only their own.
drop policy if exists "notes: members read" on public.memory_notes;
create policy "notes: members read" on public.memory_notes
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "notes: author adds" on public.memory_notes;
create policy "notes: author adds" on public.memory_notes
  for insert to authenticated
  with check (public.is_space_member(space_id) and author_id = (select auth.uid()));

drop policy if exists "notes: author edits" on public.memory_notes;
create policy "notes: author edits" on public.memory_notes
  for update to authenticated
  using (public.is_space_member(space_id) and author_id = (select auth.uid()))
  with check (public.is_space_member(space_id) and author_id = (select auth.uid()));

drop policy if exists "notes: author deletes" on public.memory_notes;
create policy "notes: author deletes" on public.memory_notes
  for delete to authenticated
  using (public.is_space_member(space_id) and author_id = (select auth.uid()));

-- timeline_milestones
drop policy if exists "milestones: members read" on public.timeline_milestones;
create policy "milestones: members read" on public.timeline_milestones
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "milestones: members add" on public.timeline_milestones;
create policy "milestones: members add" on public.timeline_milestones
  for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = (select auth.uid()));

drop policy if exists "milestones: creator edits" on public.timeline_milestones;
create policy "milestones: creator edits" on public.timeline_milestones
  for update to authenticated
  using (public.is_space_member(space_id) and created_by = (select auth.uid()))
  with check (public.is_space_member(space_id) and created_by = (select auth.uid()));

drop policy if exists "milestones: creator deletes" on public.timeline_milestones;
create policy "milestones: creator deletes" on public.timeline_milestones
  for delete to authenticated
  using (public.is_space_member(space_id) and created_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Private photo storage
-- Files are stored as:  <space_id>/<memory_id or "milestones">/<file>.jpg
-- The bucket is PRIVATE: photos are only reachable through short-lived signed
-- URLs that the app requests while a member is signed in.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memories', 'memories', false, 8388608, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vrindavan photos: members read" on storage.objects;
create policy "vrindavan photos: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'memories'
    and public.is_space_member_path((storage.foldername(name))[1])
  );

drop policy if exists "vrindavan photos: members upload" on storage.objects;
create policy "vrindavan photos: members upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'memories'
    and public.is_space_member_path((storage.foldername(name))[1])
  );

drop policy if exists "vrindavan photos: members remove" on storage.objects;
create policy "vrindavan photos: members remove" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'memories'
    and public.is_space_member_path((storage.foldername(name))[1])
  );
-- No UPDATE policy on purpose: uploaded photos can never be silently replaced.
