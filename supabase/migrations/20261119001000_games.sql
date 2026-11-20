-- ============================================================================
-- Our Little Vrindavan — the Games corner: Sea battle, Ludo, Snakes & ladders,
-- Connect four, and "How well do you know me?".
-- Run AFTER 20261119000900_storage_usage.sql. Safe to run more than once.
-- Adds only; existing data is not changed.
--
-- Every change goes through the functions below, which check that it is really
-- your turn and that nobody else's move slipped in first. Secret things (your
-- fleet, your quiz answers) live in game_secrets, readable only by their owner.
-- ============================================================================

create table if not exists public.games (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.couple_spaces (id) on delete cascade,
  kind       text not null check (kind in ('sea_battle', 'ludo', 'snakes', 'connect4', 'quiz')),
  status     text not null default 'active' check (status in ('setup', 'active', 'finished', 'abandoned')),
  p1_id      uuid not null references public.profiles (id) on delete cascade,
  p2_id      uuid not null references public.profiles (id) on delete cascade,
  turn_id    uuid references public.profiles (id) on delete set null,
  winner_id  uuid references public.profiles (id) on delete set null,
  state      jsonb not null default '{}'::jsonb check (pg_column_size(state) < 65536),
  version    integer not null default 0,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (p1_id <> p2_id)
);

create index if not exists games_space_kind_idx on public.games (space_id, kind, created_at desc);

drop trigger if exists games_touch on public.games;
create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();

create table if not exists public.game_secrets (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  secret  jsonb not null check (pg_column_size(secret) < 16384),
  primary key (game_id, user_id)
);

alter table public.games enable row level security;
alter table public.game_secrets enable row level security;
revoke all on table public.games, public.game_secrets from anon, authenticated;
grant select on table public.games to authenticated;
grant select on table public.game_secrets to authenticated;

drop policy if exists "games: members watch" on public.games;
create policy "games: members watch" on public.games
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "game secrets: only your own" on public.game_secrets;
create policy "game secrets: only your own" on public.game_secrets
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Start a game (an unfinished one of the same kind is set aside).
-- ---------------------------------------------------------------------------
create or replace function public.game_new(which text, initial jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  sid     uuid;
  partner uuid;
  first   uuid;
  gid     uuid;
begin
  if which not in ('sea_battle', 'ludo', 'snakes', 'connect4', 'quiz') then
    raise exception 'Unknown game';
  end if;
  if initial is null or jsonb_typeof(initial) <> 'object' or pg_column_size(initial) > 60000 then
    raise exception 'Invalid game';
  end if;
  select m.space_id into sid from public.couple_members m where m.user_id = uid;
  if sid is null then
    raise exception 'Not a member';
  end if;
  select m.user_id into partner from public.couple_members m where m.space_id = sid and m.user_id <> uid;
  if partner is null then
    raise exception 'Your love has not joined yet';
  end if;

  update public.games g set status = 'abandoned', turn_id = null
  where g.space_id = sid and g.kind = which and g.status in ('setup', 'active');

  first := (case when random() < 0.5 then uid else partner end);

  insert into public.games (space_id, kind, status, p1_id, p2_id, turn_id, state, created_by)
  values (
    sid,
    which,
    (case when which = 'sea_battle' then 'setup' else 'active' end),
    uid,
    partner,
    (case when which in ('sea_battle', 'quiz') then null else first end),
    initial || jsonb_build_object('first', first),
    uid
  )
  returning id into gid;
  return gid;
end;
$$;

-- ---------------------------------------------------------------------------
-- A move in Ludo, Snakes & ladders or Connect four. The rules are checked on
-- both screens; here we check turn, order and size so the game can't be scrambled.
-- outcome: 'continue' (next_turn plays next), 'win' (you won) or 'draw'.
-- ---------------------------------------------------------------------------
create or replace function public.game_move(gid uuid, expected_version integer, new_state jsonb, next_turn uuid, outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g   public.games;
begin
  select * into g from public.games x where x.id = gid for update;
  if not found or uid not in (g.p1_id, g.p2_id) then
    raise exception 'Game not found';
  end if;
  if g.kind not in ('ludo', 'snakes', 'connect4') then
    raise exception 'This game has its own moves';
  end if;
  if g.status <> 'active' then
    raise exception 'This game is already over';
  end if;
  if g.version <> expected_version then
    raise exception 'stale: the board changed';
  end if;
  if g.turn_id is distinct from uid then
    raise exception 'It is not your turn';
  end if;
  if next_turn not in (g.p1_id, g.p2_id) or outcome not in ('continue', 'win', 'draw') then
    raise exception 'Invalid move';
  end if;
  if new_state is null or jsonb_typeof(new_state) <> 'object' or pg_column_size(new_state) > 60000 then
    raise exception 'Invalid move';
  end if;

  update public.games x
  set state = new_state,
      version = x.version + 1,
      turn_id = (case when outcome = 'continue' then next_turn else null end),
      status = (case when outcome = 'continue' then 'active' else 'finished' end),
      winner_id = (case when outcome = 'win' then uid else null end)
  where x.id = gid;
end;
$$;

create or replace function public.game_resign(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g   public.games;
begin
  select * into g from public.games x where x.id = gid for update;
  if not found or uid not in (g.p1_id, g.p2_id) then
    raise exception 'Game not found';
  end if;
  if g.status not in ('setup', 'active') then
    raise exception 'This game is already over';
  end if;
  update public.games x
  set status = 'finished',
      turn_id = null,
      winner_id = (case when uid = g.p1_id then g.p2_id else g.p1_id end),
      state = x.state || jsonb_build_object('resigned', uid),
      version = x.version + 1
  where x.id = gid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sea battle: place your fleet in secret (5, 4, 3, 3 and 2 cells on a 10×10 sea,
-- each in a straight line, no overlaps). Cells are numbered 0–99 (row × 10 + column).
-- ---------------------------------------------------------------------------
create or replace function public.sea_place(gid uuid, ships jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  g         public.games;
  ship      jsonb;
  cells     integer[];
  n         integer;
  lens      integer[] := '{}';
  every     integer[] := '{}';
  me_key    text;
  new_state jsonb;
begin
  select * into g from public.games x where x.id = gid for update;
  if not found or uid not in (g.p1_id, g.p2_id) then
    raise exception 'Game not found';
  end if;
  if g.kind <> 'sea_battle' or g.status <> 'setup' then
    raise exception 'The fleets are already placed';
  end if;
  if ships is null or jsonb_typeof(ships) <> 'array' or jsonb_array_length(ships) <> 5 then
    raise exception 'Invalid fleet';
  end if;

  for ship in select value from jsonb_array_elements(ships) loop
    if jsonb_typeof(ship) <> 'array' then
      raise exception 'Invalid fleet';
    end if;
    select array_agg(v::integer order by v::integer) into cells from jsonb_array_elements_text(ship) v;
    n := coalesce(array_length(cells, 1), 0);
    if n < 2 or exists (select 1 from unnest(cells) c where c < 0 or c > 99) then
      raise exception 'Invalid fleet';
    end if;
    -- straight and touching: same row with a span of n-1, or same column with a span of (n-1)×10
    if not (
      ((cells[n] - cells[1]) = n - 1 and (cells[1] / 10) = (cells[n] / 10))
      or ((cells[n] - cells[1]) = (n - 1) * 10 and not exists (select 1 from unnest(cells) c where (c - cells[1]) % 10 <> 0))
    ) then
      raise exception 'Invalid fleet';
    end if;
    lens := lens || n;
    every := every || cells;
  end loop;

  if (select array_agg(x order by x) from unnest(lens) x) <> '{2,3,3,4,5}'::integer[] then
    raise exception 'Invalid fleet';
  end if;
  if (select count(distinct x) from unnest(every) x) <> 17 then
    raise exception 'Ships cannot overlap';
  end if;

  insert into public.game_secrets (game_id, user_id, secret)
  values (gid, uid, jsonb_build_object('ships', ships))
  on conflict (game_id, user_id) do update set secret = excluded.secret;

  me_key := (case when uid = g.p1_id then 'p1' else 'p2' end);
  new_state := g.state || jsonb_build_object('ready', coalesce(g.state -> 'ready', '{}'::jsonb) || jsonb_build_object(me_key, true));

  if coalesce((new_state -> 'ready' ->> 'p1')::boolean, false) and coalesce((new_state -> 'ready' ->> 'p2')::boolean, false) then
    update public.games x
    set state = new_state, status = 'active', turn_id = coalesce((g.state ->> 'first')::uuid, g.p1_id), version = x.version + 1
    where x.id = gid;
  else
    update public.games x set state = new_state, version = x.version + 1 where x.id = gid;
  end if;
end;
$$;

-- Fire at one cell of their sea. The server looks at their hidden fleet and
-- records only hit / miss / sunk — never where the rest of their ships are.
create or replace function public.sea_fire(gid uuid, expected_version integer, cell integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid       uuid := auth.uid();
  g         public.games;
  me_key    text;
  them      uuid;
  fleet     jsonb;
  ship      jsonb;
  hit       boolean := false;
  sunk      jsonb := null;
  shots     jsonb;
  hits      integer;
  won       boolean;
  new_state jsonb;
begin
  select * into g from public.games x where x.id = gid for update;
  if not found or uid not in (g.p1_id, g.p2_id) then
    raise exception 'Game not found';
  end if;
  if g.kind <> 'sea_battle' or g.status <> 'active' then
    raise exception 'This game is not in battle';
  end if;
  if g.version <> expected_version then
    raise exception 'stale: the board changed';
  end if;
  if g.turn_id is distinct from uid then
    raise exception 'It is not your turn';
  end if;
  if cell is null or cell < 0 or cell > 99 then
    raise exception 'Invalid shot';
  end if;

  me_key := (case when uid = g.p1_id then 'p1' else 'p2' end);
  them := (case when uid = g.p1_id then g.p2_id else g.p1_id end);
  shots := coalesce(g.state -> 'shots' -> me_key, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(shots) s where (s ->> 'c')::integer = cell) then
    raise exception 'You already fired there';
  end if;

  select s.secret -> 'ships' into fleet from public.game_secrets s where s.game_id = gid and s.user_id = them;
  if fleet is null then
    raise exception 'Their fleet is missing';
  end if;

  for ship in select value from jsonb_array_elements(fleet) loop
    if ship @> to_jsonb(cell) then
      hit := true;
      -- sunk when every cell of this ship has now been hit
      if not exists (
        select 1 from jsonb_array_elements_text(ship) c
        where c::integer <> cell
          and not exists (select 1 from jsonb_array_elements(shots) s where (s ->> 'c')::integer = c::integer and (s ->> 'h')::boolean)
      ) then
        sunk := ship;
      end if;
    end if;
  end loop;

  shots := shots || jsonb_build_array(jsonb_build_object('c', cell, 'h', hit));
  hits := (select count(*) from jsonb_array_elements(shots) s where (s ->> 'h')::boolean);
  won := hits >= 17;

  new_state := g.state
    || jsonb_build_object('shots', coalesce(g.state -> 'shots', '{}'::jsonb) || jsonb_build_object(me_key, shots))
    || jsonb_build_object('last', jsonb_build_object('by', me_key, 'c', cell, 'h', hit, 'sunk', sunk is not null));
  if sunk is not null then
    new_state := new_state || jsonb_build_object(
      'sunk', coalesce(g.state -> 'sunk', '{}'::jsonb)
        || jsonb_build_object(me_key, coalesce(g.state -> 'sunk' -> me_key, '[]'::jsonb) || jsonb_build_array(sunk))
    );
  end if;

  update public.games x
  set state = new_state,
      version = x.version + 1,
      turn_id = (case when won then null else them end),
      status = (case when won then 'finished' else 'active' end),
      winner_id = (case when won then uid else null end)
  where x.id = gid;

  return jsonb_build_object('hit', hit, 'sunk', sunk is not null, 'won', won);
end;
$$;

-- ---------------------------------------------------------------------------
-- How well do you know me? Each of you answers about yourself AND guesses the
-- other's answers (choices 0–3). Nothing is revealed until you have both played.
-- ---------------------------------------------------------------------------
create or replace function public.quiz_play(gid uuid, answers jsonb, guesses jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid      uuid := auth.uid();
  g        public.games;
  n        integer;
  me_key   text;
  them     uuid;
  mine     jsonb;
  theirs   jsonb;
  p1s      jsonb;
  p2s      jsonb;
  score1   integer;
  score2   integer;
begin
  select * into g from public.games x where x.id = gid for update;
  if not found or uid not in (g.p1_id, g.p2_id) then
    raise exception 'Game not found';
  end if;
  if g.kind <> 'quiz' or g.status <> 'active' then
    raise exception 'This quiz is already over';
  end if;
  n := jsonb_array_length(coalesce(g.state -> 'questions', '[]'::jsonb));
  if n < 1
     or jsonb_typeof(answers) <> 'array' or jsonb_typeof(guesses) <> 'array'
     or jsonb_array_length(answers) <> n or jsonb_array_length(guesses) <> n
     or exists (select 1 from jsonb_array_elements(answers || guesses) a where jsonb_typeof(a) <> 'number' or (a)::text::integer not between 0 and 3) then
    raise exception 'Invalid answers';
  end if;
  if exists (select 1 from public.game_secrets s where s.game_id = gid and s.user_id = uid) then
    raise exception 'You already played this round';
  end if;

  insert into public.game_secrets (game_id, user_id, secret)
  values (gid, uid, jsonb_build_object('answers', answers, 'guesses', guesses));

  me_key := (case when uid = g.p1_id then 'p1' else 'p2' end);
  them := (case when uid = g.p1_id then g.p2_id else g.p1_id end);
  select s.secret into theirs from public.game_secrets s where s.game_id = gid and s.user_id = them;

  if theirs is null then
    update public.games x
    set state = x.state || jsonb_build_object('submitted', coalesce(x.state -> 'submitted', '{}'::jsonb) || jsonb_build_object(me_key, true)),
        version = x.version + 1
    where x.id = gid;
    return;
  end if;

  -- both have played: reveal everything
  mine := jsonb_build_object('answers', answers, 'guesses', guesses);
  p1s := (case when me_key = 'p1' then mine else theirs end);
  p2s := (case when me_key = 'p1' then theirs else mine end);
  score1 := (select count(*) from generate_series(0, n - 1) i where (p1s -> 'guesses' -> i) = (p2s -> 'answers' -> i));
  score2 := (select count(*) from generate_series(0, n - 1) i where (p2s -> 'guesses' -> i) = (p1s -> 'answers' -> i));

  update public.games x
  set state = x.state || jsonb_build_object(
        'submitted', jsonb_build_object('p1', true, 'p2', true),
        'reveal', jsonb_build_object(
          'answers', jsonb_build_object('p1', p1s -> 'answers', 'p2', p2s -> 'answers'),
          'guesses', jsonb_build_object('p1', p1s -> 'guesses', 'p2', p2s -> 'guesses'),
          'scores', jsonb_build_object('p1', score1, 'p2', score2)
        )
      ),
      version = x.version + 1,
      status = 'finished',
      winner_id = (case when score1 > score2 then g.p1_id when score2 > score1 then g.p2_id else null end)
  where x.id = gid;
end;
$$;

revoke all on function public.game_new(text, jsonb)                               from public, anon;
revoke all on function public.game_move(uuid, integer, jsonb, uuid, text)         from public, anon;
revoke all on function public.game_resign(uuid)                                   from public, anon;
revoke all on function public.sea_place(uuid, jsonb)                              from public, anon;
revoke all on function public.sea_fire(uuid, integer, integer)                    from public, anon;
revoke all on function public.quiz_play(uuid, jsonb, jsonb)                       from public, anon;
grant execute on function public.game_new(text, jsonb)                       to authenticated;
grant execute on function public.game_move(uuid, integer, jsonb, uuid, text) to authenticated;
grant execute on function public.game_resign(uuid)                           to authenticated;
grant execute on function public.sea_place(uuid, jsonb)                      to authenticated;
grant execute on function public.sea_fire(uuid, integer, integer)            to authenticated;
grant execute on function public.quiz_play(uuid, jsonb, jsonb)               to authenticated;

-- Live board updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
     ) then
    alter publication supabase_realtime add table public.games;
  end if;
end;
$$;
