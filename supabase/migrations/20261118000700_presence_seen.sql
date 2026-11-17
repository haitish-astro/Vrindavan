-- ============================================================================
-- Our Little Vrindavan — "last here" and "what's new" markers.
-- Run AFTER 20261117000600_chat_photos_reactions.sql. Safe to run more than once.
-- Adds only; existing data is not changed.
-- ============================================================================

-- When each person was last in the app (shown as "last here 2 h ago").
alter table public.profiles add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set last_seen_at = now() where id = (select auth.uid());
$$;

-- When each person last looked at each part of the app, so the tabs can show
-- how many new things the other person added since then.
create table if not exists public.section_seen (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  section  text not null check (section in ('memories', 'letters', 'calendar', 'world')),
  seen_at  timestamptz not null default now(),
  primary key (user_id, section)
);

alter table public.section_seen enable row level security;
revoke all on table public.section_seen from anon, authenticated;
grant select on table public.section_seen to authenticated;

drop policy if exists "seen: own only" on public.section_seen;
create policy "seen: own only" on public.section_seen
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.mark_section_seen(which text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if which not in ('memories', 'letters', 'calendar', 'world') then
    raise exception 'Unknown section';
  end if;
  insert into public.section_seen (user_id, section, seen_at)
  values ((select auth.uid()), which, now())
  on conflict (user_id, section) do update set seen_at = excluded.seen_at;
end;
$$;

revoke all on function public.touch_last_seen()        from public, anon;
revoke all on function public.mark_section_seen(text)  from public, anon;
grant execute on function public.touch_last_seen()       to authenticated;
grant execute on function public.mark_section_seen(text) to authenticated;
