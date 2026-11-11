-- ============================================================================
-- Our Little Vrindavan — Phase 3: letters, little notes, hearts, private chat,
-- and the shared doodle board.
-- Run AFTER the two earlier migrations. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The server's clock decides "when", so no device can backdate anything.
create or replace function public.stamp_created_now()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: remember whether someone has chosen their own password yet
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists own_password boolean not null default false;

-- Called by the app right after a successful password change.
create or replace function public.mark_own_password()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set own_password = true where id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Letters
-- ---------------------------------------------------------------------------

create table if not exists public.letters (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.couple_spaces (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title      text check (char_length(title) <= 120),
  body       text not null check (char_length(body) between 1 and 20000),
  status     text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at    timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, space_id)
);

-- Drafts stay drafts until sent; a sent letter can be edited but never "unsent".
create or replace function public.letters_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.sent_at := case when new.status = 'sent' then now() else null end;
  elsif old.status = 'sent' and new.status = 'draft' then
    raise exception 'A sent letter cannot become a draft again.';
  elsif old.status = 'draft' and new.status = 'sent' then
    new.sent_at := now();
  else
    new.sent_at := old.sent_at;
  end if;
  return new;
end;
$$;

create table if not exists public.letter_replies (
  id         uuid primary key default gen_random_uuid(),
  letter_id  uuid not null,
  space_id   uuid not null,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  foreign key (letter_id, space_id) references public.letters (id, space_id) on delete cascade
);

-- "She opened your letter ♡"
create table if not exists public.letter_opens (
  letter_id uuid not null,
  space_id  uuid not null,
  user_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (letter_id, user_id),
  foreign key (letter_id, space_id) references public.letters (id, space_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Little notes
-- ---------------------------------------------------------------------------

create table if not exists public.quick_notes (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.couple_spaces (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Hearts (one per person per thing)
-- ---------------------------------------------------------------------------

create table if not exists public.reactions (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.couple_spaces (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('memory', 'letter', 'quick_note')),
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  unique (target_type, target_id, user_id)
);

-- When something is removed, its hearts go with it.
create or replace function public.clear_reactions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.reactions r where r.target_type = tg_argv[0] and r.target_id = old.id;
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- Private chat
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.couple_spaces (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_reads (
  space_id     uuid not null references public.couple_spaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- "Seen": records that the signed-in person has read the chat up to now.
create or replace function public.mark_chat_read()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
  t   timestamptz := now();
begin
  select m.space_id into sid from public.couple_members m where m.user_id = uid;
  if sid is null then
    return null;
  end if;
  insert into public.chat_reads (space_id, user_id, last_read_at)
  values (sid, uid, t)
  on conflict (space_id, user_id) do update set last_read_at = excluded.last_read_at;
  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared doodle board: each finished stroke is one row.
-- points = [x1, y1, x2, y2, ...] in 0..1 so it looks the same on every screen.
-- ---------------------------------------------------------------------------

create table if not exists public.doodle_strokes (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.couple_spaces (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  color      text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  width      real not null check (width > 0 and width <= 0.05),
  points     real[] not null check (cardinality(points) between 2 and 4000),
  created_at timestamptz not null default now()
);

-- Clearing the board removes both people's strokes, so it is a member-only function.
create or replace function public.clear_doodle_board()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
begin
  select m.space_id into sid from public.couple_members m where m.user_id = (select auth.uid());
  if sid is null then
    raise exception 'Not a member';
  end if;
  delete from public.doodle_strokes d where d.space_id = sid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists letters_space_idx        on public.letters (space_id, updated_at desc);
create index if not exists letter_replies_letter_idx on public.letter_replies (letter_id, created_at);
create index if not exists quick_notes_space_idx    on public.quick_notes (space_id, created_at desc);
create index if not exists reactions_target_idx     on public.reactions (target_type, target_id);
create index if not exists messages_space_idx       on public.messages (space_id, created_at desc);
create index if not exists doodle_space_idx         on public.doodle_strokes (space_id, created_at);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists letters_status on public.letters;
create trigger letters_status before insert or update on public.letters
  for each row execute function public.letters_status();

drop trigger if exists letters_touch on public.letters;
create trigger letters_touch before update on public.letters
  for each row execute function public.touch_updated_at();

drop trigger if exists letter_replies_stamp on public.letter_replies;
create trigger letter_replies_stamp before insert on public.letter_replies
  for each row execute function public.stamp_created_now();

drop trigger if exists quick_notes_stamp on public.quick_notes;
create trigger quick_notes_stamp before insert on public.quick_notes
  for each row execute function public.stamp_created_now();

drop trigger if exists messages_stamp on public.messages;
create trigger messages_stamp before insert on public.messages
  for each row execute function public.stamp_created_now();

drop trigger if exists doodle_stamp on public.doodle_strokes;
create trigger doodle_stamp before insert on public.doodle_strokes
  for each row execute function public.stamp_created_now();

drop trigger if exists memories_clear_reactions on public.memories;
create trigger memories_clear_reactions after delete on public.memories
  for each row execute function public.clear_reactions('memory');

drop trigger if exists letters_clear_reactions on public.letters;
create trigger letters_clear_reactions after delete on public.letters
  for each row execute function public.clear_reactions('letter');

drop trigger if exists quick_notes_clear_reactions on public.quick_notes;
create trigger quick_notes_clear_reactions after delete on public.quick_notes
  for each row execute function public.clear_reactions('quick_note');

-- ---------------------------------------------------------------------------
-- Function permissions
-- ---------------------------------------------------------------------------

revoke all on function public.stamp_created_now()   from public, anon, authenticated;
revoke all on function public.letters_status()      from public, anon, authenticated;
revoke all on function public.clear_reactions()     from public, anon, authenticated;

revoke all on function public.mark_own_password()   from public, anon;
revoke all on function public.mark_chat_read()      from public, anon;
revoke all on function public.clear_doodle_board()  from public, anon;
grant execute on function public.mark_own_password()  to authenticated;
grant execute on function public.mark_chat_read()     to authenticated;
grant execute on function public.clear_doodle_board() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.letters        enable row level security;
alter table public.letter_replies enable row level security;
alter table public.letter_opens   enable row level security;
alter table public.quick_notes    enable row level security;
alter table public.reactions      enable row level security;
alter table public.messages       enable row level security;
alter table public.chat_reads     enable row level security;
alter table public.doodle_strokes enable row level security;

revoke all on table
  public.letters, public.letter_replies, public.letter_opens, public.quick_notes,
  public.reactions, public.messages, public.chat_reads, public.doodle_strokes
  from anon, authenticated;

grant select, insert, delete on table public.letters to authenticated;
grant update (title, body, status) on table public.letters to authenticated;
grant select, insert, delete on table public.letter_replies to authenticated;
grant select, insert on table public.letter_opens to authenticated;
grant select, insert, delete on table public.quick_notes to authenticated;
grant select, insert, delete on table public.reactions to authenticated;
grant select, insert, delete on table public.messages to authenticated;
grant select on table public.chat_reads to authenticated;
grant select, insert, delete on table public.doodle_strokes to authenticated;

-- letters: drafts are visible only to their author.
drop policy if exists "letters: read sent, or own drafts" on public.letters;
create policy "letters: read sent, or own drafts" on public.letters
  for select to authenticated
  using (public.is_space_member(space_id) and (status = 'sent' or author_id = (select auth.uid())));

drop policy if exists "letters: author writes" on public.letters;
create policy "letters: author writes" on public.letters
  for insert to authenticated
  with check (public.is_space_member(space_id) and author_id = (select auth.uid()));

drop policy if exists "letters: author edits" on public.letters;
create policy "letters: author edits" on public.letters
  for update to authenticated
  using (public.is_space_member(space_id) and author_id = (select auth.uid()))
  with check (public.is_space_member(space_id) and author_id = (select auth.uid()));

drop policy if exists "letters: author deletes" on public.letters;
create policy "letters: author deletes" on public.letters
  for delete to authenticated
  using (public.is_space_member(space_id) and author_id = (select auth.uid()));

-- replies: only on sent letters.
drop policy if exists "replies: read on visible letters" on public.letter_replies;
create policy "replies: read on visible letters" on public.letter_replies
  for select to authenticated
  using (
    public.is_space_member(space_id)
    and exists (select 1 from public.letters l where l.id = letter_id and l.status = 'sent')
  );

drop policy if exists "replies: author writes" on public.letter_replies;
create policy "replies: author writes" on public.letter_replies
  for insert to authenticated
  with check (
    public.is_space_member(space_id)
    and author_id = (select auth.uid())
    and exists (select 1 from public.letters l where l.id = letter_id and l.status = 'sent')
  );

drop policy if exists "replies: author deletes" on public.letter_replies;
create policy "replies: author deletes" on public.letter_replies
  for delete to authenticated
  using (public.is_space_member(space_id) and author_id = (select auth.uid()));

-- letter_opens
drop policy if exists "opens: members read" on public.letter_opens;
create policy "opens: members read" on public.letter_opens
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "opens: record own" on public.letter_opens;
create policy "opens: record own" on public.letter_opens
  for insert to authenticated
  with check (
    public.is_space_member(space_id)
    and user_id = (select auth.uid())
    and exists (select 1 from public.letters l where l.id = letter_id and l.status = 'sent')
  );

-- quick_notes
drop policy if exists "quick notes: members read" on public.quick_notes;
create policy "quick notes: members read" on public.quick_notes
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "quick notes: author writes" on public.quick_notes;
create policy "quick notes: author writes" on public.quick_notes
  for insert to authenticated
  with check (public.is_space_member(space_id) and author_id = (select auth.uid()));

drop policy if exists "quick notes: author deletes" on public.quick_notes;
create policy "quick notes: author deletes" on public.quick_notes
  for delete to authenticated
  using (public.is_space_member(space_id) and author_id = (select auth.uid()));

-- reactions
drop policy if exists "hearts: members read" on public.reactions;
create policy "hearts: members read" on public.reactions
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "hearts: give own" on public.reactions;
create policy "hearts: give own" on public.reactions
  for insert to authenticated
  with check (public.is_space_member(space_id) and user_id = (select auth.uid()));

drop policy if exists "hearts: take back own" on public.reactions;
create policy "hearts: take back own" on public.reactions
  for delete to authenticated
  using (public.is_space_member(space_id) and user_id = (select auth.uid()));

-- messages
drop policy if exists "chat: members read" on public.messages;
create policy "chat: members read" on public.messages
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "chat: send as self" on public.messages;
create policy "chat: send as self" on public.messages
  for insert to authenticated
  with check (public.is_space_member(space_id) and sender_id = (select auth.uid()));

drop policy if exists "chat: unsend own" on public.messages;
create policy "chat: unsend own" on public.messages
  for delete to authenticated
  using (public.is_space_member(space_id) and sender_id = (select auth.uid()));

-- chat_reads (written only by mark_chat_read)
drop policy if exists "chat reads: members read" on public.chat_reads;
create policy "chat reads: members read" on public.chat_reads
  for select to authenticated
  using (public.is_space_member(space_id));

-- doodle_strokes
drop policy if exists "doodles: members read" on public.doodle_strokes;
create policy "doodles: members read" on public.doodle_strokes
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "doodles: draw as self" on public.doodle_strokes;
create policy "doodles: draw as self" on public.doodle_strokes
  for insert to authenticated
  with check (public.is_space_member(space_id) and author_id = (select auth.uid()));

drop policy if exists "doodles: undo own" on public.doodle_strokes;
create policy "doodles: undo own" on public.doodle_strokes
  for delete to authenticated
  using (public.is_space_member(space_id) and author_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Live updates (Supabase Realtime). Row Level Security still decides who
-- receives each change, so only the two members ever see these events.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'chat_reads', 'doodle_strokes'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
