-- ============================================================================
-- Our Little Vrindavan — videos in memories, FaceTime memories, the calendar,
-- and each person's weekly schedule.
-- Run AFTER 20261112000400_live_and_chess.sql. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Videos: a memory's media can now be a photo or a video.
-- ---------------------------------------------------------------------------

alter table public.memory_photos
  add column if not exists kind text not null default 'photo';
alter table public.memory_photos
  add column if not exists duration_seconds real;

alter table public.memory_photos drop constraint if exists memory_photos_kind_check;
alter table public.memory_photos
  add constraint memory_photos_kind_check check (kind in ('photo', 'video'));
alter table public.memory_photos drop constraint if exists memory_photos_duration_check;
alter table public.memory_photos
  add constraint memory_photos_duration_check
  check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 3600));

-- The private bucket now also accepts videos (up to 50 MB each, the Supabase free-plan maximum).
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/jpeg', 'image/webp', 'image/png',
      'video/mp4', 'video/quicktime', 'video/webm'
    ],
    public = false
where id = 'memories';

-- ---------------------------------------------------------------------------
-- FaceTime memories: a memory is either an adventure or a call.
-- ---------------------------------------------------------------------------

alter table public.memories
  add column if not exists kind text not null default 'adventure';
alter table public.memories
  add column if not exists call_minutes integer;

alter table public.memories drop constraint if exists memories_kind_check;
alter table public.memories
  add constraint memories_kind_check check (kind in ('adventure', 'call'));
alter table public.memories drop constraint if exists memories_call_minutes_check;
alter table public.memories
  add constraint memories_call_minutes_check
  check (call_minutes is null or (call_minutes >= 0 and call_minutes <= 1440));

grant update (title, happened_on, location, description, emoji, call_minutes)
  on table public.memories to authenticated;

create index if not exists memories_space_kind_idx on public.memories (space_id, kind, happened_on desc);

-- ---------------------------------------------------------------------------
-- Calendar: special dates either of you adds.
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.couple_spaces (id) on delete cascade,
  created_by  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  event_date  date not null,
  event_time  time,
  note        text check (char_length(note) <= 1000),
  yearly      boolean not null default false,
  symbol      text check (char_length(symbol) <= 16),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists calendar_events_space_idx on public.calendar_events (space_id, event_date);

drop trigger if exists calendar_events_touch on public.calendar_events;
create trigger calendar_events_touch before update on public.calendar_events
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Our week: each person's regular busy times.
-- weekday: 0 = Sunday … 6 = Saturday. Minutes from midnight, in the owner's
-- time zone (tz), so the app can show them in the other person's local time.
-- An end before the start means the block runs past midnight (e.g. sleep).
-- ---------------------------------------------------------------------------

create table if not exists public.schedule_blocks (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.couple_spaces (id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 60),
  weekday       smallint not null check (weekday between 0 and 6),
  start_minute  smallint not null check (start_minute between 0 and 1439),
  end_minute    smallint not null check (end_minute between 1 and 1440),
  tz            text not null check (char_length(tz) between 1 and 64),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (start_minute <> end_minute)
);

create index if not exists schedule_blocks_space_idx on public.schedule_blocks (space_id, user_id, weekday);

drop trigger if exists schedule_blocks_touch on public.schedule_blocks;
create trigger schedule_blocks_touch before update on public.schedule_blocks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.calendar_events enable row level security;
alter table public.schedule_blocks enable row level security;

revoke all on table public.calendar_events, public.schedule_blocks from anon, authenticated;

grant select, insert, delete on table public.calendar_events to authenticated;
grant update (title, event_date, event_time, note, yearly, symbol) on table public.calendar_events to authenticated;

grant select, insert, delete on table public.schedule_blocks to authenticated;
grant update (label, weekday, start_minute, end_minute, tz) on table public.schedule_blocks to authenticated;

-- calendar: both see everything; each edits/removes what they added
drop policy if exists "calendar: members read" on public.calendar_events;
create policy "calendar: members read" on public.calendar_events
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "calendar: members add" on public.calendar_events;
create policy "calendar: members add" on public.calendar_events
  for insert to authenticated
  with check (public.is_space_member(space_id) and created_by = (select auth.uid()));

drop policy if exists "calendar: creator edits" on public.calendar_events;
create policy "calendar: creator edits" on public.calendar_events
  for update to authenticated
  using (public.is_space_member(space_id) and created_by = (select auth.uid()))
  with check (public.is_space_member(space_id) and created_by = (select auth.uid()));

drop policy if exists "calendar: creator removes" on public.calendar_events;
create policy "calendar: creator removes" on public.calendar_events
  for delete to authenticated
  using (public.is_space_member(space_id) and created_by = (select auth.uid()));

-- schedule: both see both weeks; each person changes only their own
drop policy if exists "week: members read" on public.schedule_blocks;
create policy "week: members read" on public.schedule_blocks
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "week: own add" on public.schedule_blocks;
create policy "week: own add" on public.schedule_blocks
  for insert to authenticated
  with check (public.is_space_member(space_id) and user_id = (select auth.uid()));

drop policy if exists "week: own edit" on public.schedule_blocks;
create policy "week: own edit" on public.schedule_blocks
  for update to authenticated
  using (public.is_space_member(space_id) and user_id = (select auth.uid()))
  with check (public.is_space_member(space_id) and user_id = (select auth.uid()));

drop policy if exists "week: own remove" on public.schedule_blocks;
create policy "week: own remove" on public.schedule_blocks
  for delete to authenticated
  using (public.is_space_member(space_id) and user_id = (select auth.uid()));
