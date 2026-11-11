-- ============================================================================
-- Our Little Vrindavan — Phase 1: foundation
-- Profiles, the private couple space, membership, and the invite allowlist.
--
-- Safe to run more than once. Run in: Supabase dashboard -> SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.couple_spaces (
  id               uuid primary key default gen_random_uuid(),
  name             text not null default 'Our Little Vrindavan'
                     check (char_length(name) between 1 and 80),
  first_met_on     date,
  welcome_greeting text check (char_length(welcome_greeting) <= 200),
  featured_message text check (char_length(featured_message) <= 600),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.couple_members (
  space_id  uuid not null references public.couple_spaces (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id),
  unique (user_id) -- a person belongs to exactly one space
);

-- The allowlist. Only emails listed here can ever become members.
-- No client can read or write this table (RLS on, zero policies, no grants).
create table if not exists public.space_invites (
  email      text primary key check (email = lower(email)),
  space_id   uuid not null references public.couple_spaces (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Is the signed-in user a member of this space?
-- SECURITY DEFINER so policies can call it without recursive RLS checks.
create or replace function public.is_space_member(target_space uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.couple_members m
    where m.space_id = target_space
      and m.user_id = (select auth.uid())
  );
$$;

-- Same check for storage paths, where the space id arrives as a folder name.
-- Compares as text so a malformed folder name is simply "not a member".
create or replace function public.is_space_member_path(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.couple_members m
    where m.space_id::text = folder
      and m.user_id = (select auth.uid())
  );
$$;

-- Does the signed-in user share a space with this other user?
create or replace function public.shares_space(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.couple_members mine
    join public.couple_members theirs on theirs.space_id = mine.space_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  );
$$;

-- A space is for exactly two people.
create or replace function public.enforce_two_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Lock the space row so two simultaneous joins cannot both slip through.
  perform 1 from public.couple_spaces s where s.id = new.space_id for update;
  if (select count(*) from public.couple_members m where m.space_id = new.space_id) >= 2 then
    raise exception 'This space already has its two people.';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_two_invites()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.couple_spaces s where s.id = new.space_id for update;
  if (select count(*) from public.space_invites i where i.space_id = new.space_id) >= 2 then
    raise exception 'This space already has two invited emails. Remove one first.';
  end if;
  return new;
end;
$$;

-- Every new auth user gets a profile row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

-- Called by the app right after sign-in. If the signed-in user's VERIFIED email
-- is on the allowlist, they become a member. Otherwise nothing happens.
create or replace function public.claim_membership()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid        uuid := auth.uid();
  user_email text;
  target     uuid;
begin
  if uid is null then
    return null;
  end if;

  select m.space_id into target from public.couple_members m where m.user_id = uid;
  if target is not null then
    return target;
  end if;

  select lower(u.email) into user_email
  from auth.users u
  where u.id = uid
    and u.email_confirmed_at is not null
    and coalesce(u.is_anonymous, false) = false;
  if user_email is null then
    return null;
  end if;

  select i.space_id into target from public.space_invites i where i.email = user_email;
  if target is null then
    return null;
  end if;

  insert into public.profiles (id) values (uid) on conflict (id) do nothing;
  insert into public.couple_members (space_id, user_id)
  values (target, uid)
  on conflict do nothing;

  return target;
end;
$$;

-- ADMIN ONLY — run from the SQL Editor, never callable from the app.
-- Creates the space (first call) and adds emails to the allowlist.
--   select public.setup_couple_space('me@example.com');
--   select public.setup_couple_space('me@example.com', 'her@example.com');
create or replace function public.setup_couple_space(owner_email text, partner_email text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_clean   text := lower(trim(owner_email));
  partner_clean text := lower(trim(partner_email));
  sid           uuid;
begin
  if owner_clean is null or owner_clean = '' then
    raise exception 'owner_email is required';
  end if;

  select i.space_id into sid from public.space_invites i where i.email = owner_clean;

  if sid is null then
    insert into public.couple_spaces default values returning id into sid;
    insert into public.space_invites (email, space_id) values (owner_clean, sid);
  end if;

  if partner_clean is not null and partner_clean <> '' and partner_clean <> owner_clean then
    insert into public.space_invites (email, space_id)
    values (partner_clean, sid)
    on conflict (email) do nothing;
  end if;

  return sid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists couple_spaces_touch on public.couple_spaces;
create trigger couple_spaces_touch before update on public.couple_spaces
  for each row execute function public.touch_updated_at();

drop trigger if exists couple_members_limit on public.couple_members;
create trigger couple_members_limit before insert on public.couple_members
  for each row execute function public.enforce_two_members();

drop trigger if exists space_invites_limit on public.space_invites;
create trigger space_invites_limit before insert on public.space_invites
  for each row execute function public.enforce_two_invites();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for any users that already exist.
insert into public.profiles (id)
select u.id from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Function permissions
-- (Supabase grants EXECUTE to anon/authenticated by default — take it back.)
-- ---------------------------------------------------------------------------

revoke all on function public.touch_updated_at()                from public, anon, authenticated;
revoke all on function public.enforce_two_members()             from public, anon, authenticated;
revoke all on function public.enforce_two_invites()             from public, anon, authenticated;
revoke all on function public.handle_new_user()                 from public, anon, authenticated;
revoke all on function public.setup_couple_space(text, text)    from public, anon, authenticated;

revoke all on function public.is_space_member(uuid)             from public, anon;
revoke all on function public.is_space_member_path(text)        from public, anon;
revoke all on function public.shares_space(uuid)                from public, anon;
revoke all on function public.claim_membership()                from public, anon;

grant execute on function public.is_space_member(uuid)          to authenticated;
grant execute on function public.is_space_member_path(text)     to authenticated;
grant execute on function public.shares_space(uuid)             to authenticated;
grant execute on function public.claim_membership()             to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles       enable row level security;
alter table public.couple_spaces  enable row level security;
alter table public.couple_members enable row level security;
alter table public.space_invites  enable row level security;

-- Table privileges: nothing for visitors, the minimum for signed-in users.
revoke all on table public.profiles, public.couple_spaces, public.couple_members, public.space_invites
  from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

grant select on table public.couple_spaces to authenticated;
grant update (name, first_met_on, welcome_greeting, featured_message)
  on table public.couple_spaces to authenticated;

grant select on table public.couple_members to authenticated;
-- space_invites: intentionally no grants and no policies.

-- profiles
drop policy if exists "profiles: read self and partner" on public.profiles;
create policy "profiles: read self and partner" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_space(id));

drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- couple_spaces
drop policy if exists "spaces: members read" on public.couple_spaces;
create policy "spaces: members read" on public.couple_spaces
  for select to authenticated
  using (public.is_space_member(id));

drop policy if exists "spaces: members update settings" on public.couple_spaces;
create policy "spaces: members update settings" on public.couple_spaces
  for update to authenticated
  using (public.is_space_member(id))
  with check (public.is_space_member(id));

-- couple_members (read-only for the app; rows are created by claim_membership)
drop policy if exists "members: read own space" on public.couple_members;
create policy "members: read own space" on public.couple_members
  for select to authenticated
  using (public.is_space_member(space_id));
