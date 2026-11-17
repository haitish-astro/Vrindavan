-- ============================================================================
-- Our Little Vrindavan — photos in chat, and reactions on messages.
-- Run AFTER 20261117000500_videos_calendar_week.sql. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Photo messages: a message can carry a photo (with or without words).
-- Photos live in the same private bucket, under <space_id>/chat/.
-- ---------------------------------------------------------------------------

alter table public.messages alter column body drop not null;
alter table public.messages add column if not exists image_path text;
alter table public.messages add column if not exists image_width integer;
alter table public.messages add column if not exists image_height integer;

alter table public.messages drop constraint if exists messages_has_content;
alter table public.messages
  add constraint messages_has_content check (body is not null or image_path is not null);
alter table public.messages drop constraint if exists messages_image_in_space;
alter table public.messages
  add constraint messages_image_in_space check (image_path is null or image_path like space_id::text || '/chat/%');

-- lets reactions point at (message, space) together
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_id_space_key') then
    alter table public.messages add constraint messages_id_space_key unique (id, space_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reactions: one per person per message (tap again to change or remove).
-- ---------------------------------------------------------------------------

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null,
  space_id   uuid not null,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji      text not null check (emoji in ('❤️', '😂', '😮', '😢', '🔥', '👍', '🥺', '😘')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id),
  foreign key (message_id, space_id) references public.messages (id, space_id) on delete cascade
);

create index if not exists message_reactions_message_idx on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;
revoke all on table public.message_reactions from anon, authenticated;
grant select on table public.message_reactions to authenticated;

drop policy if exists "message reactions: members read" on public.message_reactions;
create policy "message reactions: members read" on public.message_reactions
  for select to authenticated
  using (public.is_space_member(space_id));

-- Set (or change, or with null remove) your reaction to a message.
create or replace function public.react_to_message(target uuid, reaction text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  sid uuid;
begin
  select m.space_id into sid from public.messages m where m.id = target;
  if sid is null or not public.is_space_member(sid) then
    raise exception 'Message not found';
  end if;
  if reaction is null then
    delete from public.message_reactions r where r.message_id = target and r.user_id = uid;
    return;
  end if;
  insert into public.message_reactions (message_id, space_id, user_id, emoji)
  values (target, sid, uid, reaction)
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now();
end;
$$;

revoke all on function public.react_to_message(uuid, text) from public, anon;
grant execute on function public.react_to_message(uuid, text) to authenticated;

-- Live updates for reactions
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
     ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
end;
$$;
