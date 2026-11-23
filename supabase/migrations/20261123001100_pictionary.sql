-- ============================================================================
-- Our Little Vrindavan — Pictionary for the Games corner.
-- Run AFTER 20261119001000_games.sql. Safe to run more than once.
-- Adds only; existing data is not changed.
--
-- How a round works: the drawer picks a word (kept in game_secrets, readable
-- only by the drawer), draws (each finished line is saved, so it can be watched
-- live or replayed later), and the guesser guesses. Guesses are checked HERE on
-- the server, so the guesser's screen never knows the word until the round ends.
-- ============================================================================

-- Allow the new kind of game. (Re-adding the check keeps every existing game valid.)
do $$
declare
  con oid;
begin
  select c.oid into con from pg_constraint c
  where c.conname = 'games_kind_check' and c.conrelid = 'public.games'::regclass;
  if con is not null and pg_get_constraintdef(con) not like '%pictionary%' then
    alter table public.games drop constraint games_kind_check;
    con := null;
  end if;
  if con is null then
    alter table public.games add constraint games_kind_check
      check (kind in ('sea_battle', 'ludo', 'snakes', 'connect4', 'quiz', 'pictionary'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Your own words (inside jokes and all) — shared by the two of you.
-- ---------------------------------------------------------------------------
create table if not exists public.pict_words (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.couple_spaces (id) on delete cascade,
  word       text not null check (char_length(btrim(word)) between 1 and 40 and word ~ '[[:alnum:]]'),
  added_by   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index if not exists pict_words_unique_idx on public.pict_words (space_id, lower(btrim(word)));

-- ---------------------------------------------------------------------------
-- The drawings: one row per finished line, per round.
-- points = [x1, y1, x2, y2, ...] in 0..1 so it looks the same on every screen.
-- ---------------------------------------------------------------------------
create table if not exists public.pict_strokes (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  round      integer not null check (round between 1 and 40),
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  color      text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  width      real not null check (width > 0 and width <= 0.05),
  points     real[] not null check (cardinality(points) between 2 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists pict_strokes_game_idx on public.pict_strokes (game_id, round, created_at);

alter table public.pict_words enable row level security;
alter table public.pict_strokes enable row level security;
revoke all on table public.pict_words, public.pict_strokes from anon, authenticated;
grant select, insert, delete on table public.pict_words to authenticated;
grant select, insert, delete on table public.pict_strokes to authenticated;

drop policy if exists "pict words: members read" on public.pict_words;
create policy "pict words: members read" on public.pict_words
  for select to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "pict words: members add" on public.pict_words;
create policy "pict words: members add" on public.pict_words
  for insert to authenticated
  with check (public.is_space_member(space_id) and added_by = (select auth.uid()));

drop policy if exists "pict words: members remove" on public.pict_words;
create policy "pict words: members remove" on public.pict_words
  for delete to authenticated
  using (public.is_space_member(space_id));

drop policy if exists "pict strokes: members watch" on public.pict_strokes;
create policy "pict strokes: members watch" on public.pict_strokes
  for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and public.is_space_member(g.space_id)));

-- Only the drawer of the round being played can add lines to it.
drop policy if exists "pict strokes: the drawer draws" on public.pict_strokes;
create policy "pict strokes: the drawer draws" on public.pict_strokes
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.games g
      where g.id = game_id
        and g.kind = 'pictionary'
        and g.status = 'active'
        and g.state ->> 'phase' = 'drawing'
        and (g.state ->> 'round')::integer = round
        and (select auth.uid()) = (case when g.state ->> 'drawer' = 'p1' then g.p1_id else g.p2_id end)
    )
  );

-- Undo / clear: your own lines, and only while that round is still being played.
drop policy if exists "pict strokes: the drawer erases" on public.pict_strokes;
create policy "pict strokes: the drawer erases" on public.pict_strokes
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.games g
      where g.id = game_id
        and g.status = 'active'
        and g.state ->> 'phase' = 'drawing'
        and (g.state ->> 'round')::integer = round
    )
  );

-- ---------------------------------------------------------------------------
-- Helpers (not callable directly)
-- ---------------------------------------------------------------------------

-- "_ _ _ _" with the revealed letters filled in; spaces and punctuation shown as they are.
create or replace function public.pict_mask(word text, shown jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  out text := '';
  ch  text;
  i   integer;
begin
  for i in 1 .. char_length(word) loop
    ch := substr(word, i, 1);
    if ch ~ '[[:alnum:]]' and not (coalesce(shown, '[]'::jsonb) @> to_jsonb(i)) then
      out := out || '_';
    else
      out := out || ch;
    end if;
  end loop;
  return out;
end;
$$;

-- Letters and digits only, lower case: "Ice-cream!" -> "icecream"
create or replace function public.pict_norm(t text)
returns text
language sql
immutable
set search_path = ''
as $$ select lower(regexp_replace(coalesce(t, ''), '[^[:alnum:]]', '', 'g')) $$;

-- Close the round (guessed or given up): record it, add the points, then
-- either set up the next round or finish the match.
create or replace function public.pict_next(gid uuid, word text, guesser_points integer, drawer_points integer, how text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g        public.games;
  drawer   text;
  guesser  text;
  scores   jsonb;
  rnd      integer;
  total    integer;
  winner   uuid;
  s1       integer;
  s2       integer;
  next_drawer uuid;
begin
  select * into g from public.games x where x.id = gid for update;
  drawer := g.state ->> 'drawer';
  guesser := (case when drawer = 'p1' then 'p2' else 'p1' end);
  rnd := (g.state ->> 'round')::integer;
  total := (g.state ->> 'rounds')::integer;
  scores := coalesce(g.state -> 'scores', '{"p1":0,"p2":0}'::jsonb);
  scores := scores
    || jsonb_build_object(drawer, coalesce((scores ->> drawer)::integer, 0) + drawer_points)
    || jsonb_build_object(guesser, coalesce((scores ->> guesser)::integer, 0) + guesser_points);

  g.state := g.state
    || jsonb_build_object(
      'scores', scores,
      'history', coalesce(g.state -> 'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'round', rnd,
        'drawer', drawer,
        'word', word,
        'how', how,
        'wrong', jsonb_array_length(coalesce(g.state -> 'guesses', '[]'::jsonb)),
        'hints', coalesce((g.state ->> 'hints')::integer, 0),
        'guesser_points', guesser_points,
        'drawer_points', drawer_points
      )),
      'last', jsonb_build_object('round', rnd, 'word', word, 'how', how, 'guesser_points', guesser_points, 'drawer_points', drawer_points)
    );

  if rnd >= total then
    s1 := coalesce((scores ->> 'p1')::integer, 0);
    s2 := coalesce((scores ->> 'p2')::integer, 0);
    winner := (case when s1 > s2 then g.p1_id when s2 > s1 then g.p2_id else null end);
    update public.games x
    set state = g.state || jsonb_build_object('phase', 'done', 'mask', null, 'guesses', '[]'::jsonb, 'shown', '[]'::jsonb),
        status = 'finished', turn_id = null, winner_id = winner, version = x.version + 1
    where x.id = gid;
  else
    next_drawer := (case when guesser = 'p1' then g.p1_id else g.p2_id end);
    update public.games x
    set state = g.state || jsonb_build_object(
          'round', rnd + 1, 'drawer', guesser, 'phase', 'choosing',
          'mask', null, 'guesses', '[]'::jsonb, 'shown', '[]'::jsonb, 'hints', 0),
        turn_id = next_drawer, version = x.version + 1
    where x.id = gid;
  end if;
end;
$$;

-- Loads the game for an action and checks who you are in it. Returns the game.
create or replace function public.pict_load(gid uuid, need_phase text, need_role text)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g   public.games;
  drawer_id uuid;
begin
  select * into g from public.games x where x.id = gid for update;
  if not found or uid is null or uid not in (g.p1_id, g.p2_id) then
    raise exception 'Game not found';
  end if;
  if g.kind <> 'pictionary' then
    raise exception 'Game not found';
  end if;
  if g.status <> 'active' then
    raise exception 'This game is already over';
  end if;
  if g.state ->> 'phase' is distinct from need_phase then
    raise exception 'stale: the round moved on';
  end if;
  drawer_id := (case when g.state ->> 'drawer' = 'p1' then g.p1_id else g.p2_id end);
  if need_role = 'drawer' and uid <> drawer_id then
    raise exception 'It is not your turn to draw';
  end if;
  if need_role = 'guesser' and uid = drawer_id then
    raise exception 'You are the one drawing this round';
  end if;
  return g;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions
-- ---------------------------------------------------------------------------

-- Start a match of `rounds` rounds (you take turns drawing).
create or replace function public.pict_new(rounds integer)
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
  if rounds is null or rounds < 2 or rounds > 20 then
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
  where g.space_id = sid and g.kind = 'pictionary' and g.status in ('setup', 'active');

  first := (case when random() < 0.5 then uid else partner end);
  insert into public.games (space_id, kind, status, p1_id, p2_id, turn_id, state, created_by)
  values (
    sid, 'pictionary', 'active', uid, partner, first,
    jsonb_build_object(
      'rounds', rounds, 'round', 1, 'phase', 'choosing',
      'drawer', (case when first = uid then 'p1' else 'p2' end),
      'first', first, 'scores', jsonb_build_object('p1', 0, 'p2', 0),
      'history', '[]'::jsonb, 'guesses', '[]'::jsonb, 'shown', '[]'::jsonb, 'hints', 0, 'mask', null
    ),
    uid
  )
  returning id into gid;
  return gid;
end;
$$;

-- The drawer picks the word. Only the length pattern is shared.
create or replace function public.pict_choose(gid uuid, word text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
  w text;
begin
  g := public.pict_load(gid, 'choosing', 'drawer');
  w := btrim(regexp_replace(coalesce(word, ''), '\s+', ' ', 'g'));
  if char_length(w) < 1 or char_length(w) > 40 or w !~ '[[:alnum:]]' then
    raise exception 'Pick a word of 1 to 40 letters';
  end if;

  insert into public.game_secrets (game_id, user_id, secret)
  values (gid, auth.uid(), jsonb_build_object('round', g.state -> 'round', 'word', w))
  on conflict (game_id, user_id) do update set secret = excluded.secret;

  update public.games x
  set state = x.state || jsonb_build_object(
        'phase', 'drawing', 'mask', public.pict_mask(w, '[]'::jsonb),
        'shown', '[]'::jsonb, 'guesses', '[]'::jsonb, 'hints', 0, 'started_at', now()),
      turn_id = (case when x.p1_id = auth.uid() then x.p2_id else x.p1_id end),
      version = x.version + 1
  where x.id = gid;
end;
$$;

-- The drawer changes their mind: wipe this round's drawing and pick again.
create or replace function public.pict_rechoose(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
begin
  g := public.pict_load(gid, 'drawing', 'drawer');
  if jsonb_array_length(coalesce(g.state -> 'guesses', '[]'::jsonb)) > 0 or coalesce((g.state ->> 'hints')::integer, 0) > 0 then
    raise exception 'They have already started guessing this one';
  end if;
  delete from public.pict_strokes s where s.game_id = gid and s.round = (g.state ->> 'round')::integer;
  update public.games x
  set state = x.state || jsonb_build_object('phase', 'choosing', 'mask', null, 'shown', '[]'::jsonb),
      turn_id = auth.uid(), version = x.version + 1
  where x.id = gid;
end;
$$;

-- A guess. Returns { right, word?, points? }. Fewer wrong guesses and hints = more points.
create or replace function public.pict_guess(gid uuid, guess text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g       public.games;
  w       text;
  t       text;
  a       text;
  b       text;
  wrong   integer;
  hints   integer;
  gp      integer;
  dp      integer;
  drawer_id uuid;
begin
  g := public.pict_load(gid, 'drawing', 'guesser');
  t := btrim(regexp_replace(coalesce(guess, ''), '\s+', ' ', 'g'));
  if char_length(t) < 1 or char_length(t) > 60 then
    raise exception 'Type a guess (up to 60 letters)';
  end if;
  wrong := jsonb_array_length(coalesce(g.state -> 'guesses', '[]'::jsonb));
  if wrong >= 30 then
    raise exception 'That is a lot of guesses! Ask for a hint or give up on this one';
  end if;

  drawer_id := (case when g.state ->> 'drawer' = 'p1' then g.p1_id else g.p2_id end);
  select s.secret ->> 'word' into w from public.game_secrets s
  where s.game_id = gid and s.user_id = drawer_id and (s.secret ->> 'round')::integer = (g.state ->> 'round')::integer;
  if w is null then
    raise exception 'The word is missing — ask them to pick again';
  end if;

  a := public.pict_norm(t);
  b := public.pict_norm(w);
  if a = b or (char_length(b) > 3 and (a = b || 's' or a || 's' = b or a = b || 'es' or a || 'es' = b)) then
    hints := coalesce((g.state ->> 'hints')::integer, 0);
    gp := greatest(2, 10 - 2 * wrong - 3 * hints);
    dp := (gp + 1) / 2;
    perform public.pict_next(gid, w, gp, dp, 'guessed');
    return jsonb_build_object('right', true, 'word', w, 'points', gp, 'drawer_points', dp);
  end if;

  update public.games x
  set state = x.state || jsonb_build_object('guesses', coalesce(x.state -> 'guesses', '[]'::jsonb) || to_jsonb(t)),
      version = x.version + 1
  where x.id = gid;
  return jsonb_build_object('right', false);
end;
$$;

-- A hint: reveals one more letter (costs points). At most 3, and never the last letter.
create or replace function public.pict_hint(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g       public.games;
  w       text;
  shown   jsonb;
  hidden  integer[];
  pick    integer;
  drawer_id uuid;
begin
  g := public.pict_load(gid, 'drawing', 'guesser');
  if coalesce((g.state ->> 'hints')::integer, 0) >= 3 then
    raise exception 'No more hints for this one';
  end if;
  drawer_id := (case when g.state ->> 'drawer' = 'p1' then g.p1_id else g.p2_id end);
  select s.secret ->> 'word' into w from public.game_secrets s
  where s.game_id = gid and s.user_id = drawer_id and (s.secret ->> 'round')::integer = (g.state ->> 'round')::integer;
  if w is null then
    raise exception 'The word is missing — ask them to pick again';
  end if;
  shown := coalesce(g.state -> 'shown', '[]'::jsonb);
  select array_agg(i) into hidden
  from generate_series(1, char_length(w)) i
  where substr(w, i, 1) ~ '[[:alnum:]]' and not (shown @> to_jsonb(i));
  if coalesce(array_length(hidden, 1), 0) <= 1 then
    raise exception 'No more hints for this one';
  end if;
  pick := hidden[1 + floor(random() * array_length(hidden, 1))::integer];
  shown := shown || to_jsonb(pick);

  update public.games x
  set state = x.state || jsonb_build_object(
        'shown', shown, 'mask', public.pict_mask(w, shown),
        'hints', coalesce((x.state ->> 'hints')::integer, 0) + 1),
      version = x.version + 1
  where x.id = gid;
end;
$$;

-- The guesser gives up on this word: it is revealed, nobody scores, next round.
create or replace function public.pict_give_up(gid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.games;
  w text;
  drawer_id uuid;
begin
  g := public.pict_load(gid, 'drawing', 'guesser');
  drawer_id := (case when g.state ->> 'drawer' = 'p1' then g.p1_id else g.p2_id end);
  select s.secret ->> 'word' into w from public.game_secrets s
  where s.game_id = gid and s.user_id = drawer_id and (s.secret ->> 'round')::integer = (g.state ->> 'round')::integer;
  perform public.pict_next(gid, coalesce(w, '?'), 0, 0, 'gave_up');
  return w;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions: the helpers are internal; the actions are for signed-in members.
-- ---------------------------------------------------------------------------
revoke all on function public.pict_mask(text, jsonb)                        from public, anon, authenticated;
revoke all on function public.pict_norm(text)                               from public, anon, authenticated;
revoke all on function public.pict_next(uuid, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.pict_load(uuid, text, text)                   from public, anon, authenticated;
revoke all on function public.pict_new(integer)                             from public, anon;
revoke all on function public.pict_choose(uuid, text)                       from public, anon;
revoke all on function public.pict_rechoose(uuid)                           from public, anon;
revoke all on function public.pict_guess(uuid, text)                        from public, anon;
revoke all on function public.pict_hint(uuid)                               from public, anon;
revoke all on function public.pict_give_up(uuid)                            from public, anon;
grant execute on function public.pict_new(integer)       to authenticated;
grant execute on function public.pict_choose(uuid, text) to authenticated;
grant execute on function public.pict_rechoose(uuid)     to authenticated;
grant execute on function public.pict_guess(uuid, text)  to authenticated;
grant execute on function public.pict_hint(uuid)         to authenticated;
grant execute on function public.pict_give_up(uuid)      to authenticated;

-- Live: new lines appear for the guesser even when they open the game later.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pict_strokes'
     ) then
    alter publication supabase_realtime add table public.pict_strokes;
  end if;
end;
$$;
