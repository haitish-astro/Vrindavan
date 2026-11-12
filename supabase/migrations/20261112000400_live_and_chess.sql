-- ============================================================================
-- Our Little Vrindavan — live presence (cursors, typing, "here now") and chess.
-- Run AFTER 20261112000300_letters_chat.sql. Safe to run more than once.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Private live channels
-- The app talks live on channels named  space:<space_id>:<room>  and marks them
-- private. These policies let only the two members of that space listen or speak.
-- Everyone else is refused by Supabase Realtime itself.
-- ---------------------------------------------------------------------------

drop policy if exists "vrindavan live: members listen" on realtime.messages;
create policy "vrindavan live: members listen" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'space'
    and public.is_space_member_path(split_part((select realtime.topic()), ':', 2))
  );

drop policy if exists "vrindavan live: members speak" on realtime.messages;
create policy "vrindavan live: members speak" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'space'
    and public.is_space_member_path(split_part((select realtime.topic()), ':', 2))
  );

-- ---------------------------------------------------------------------------
-- Chess
-- ---------------------------------------------------------------------------

create table if not exists public.chess_games (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.couple_spaces (id) on delete cascade,
  white_id         uuid not null references public.profiles (id) on delete cascade,
  black_id         uuid not null references public.profiles (id) on delete cascade,
  fen              text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
                     check (char_length(fen) <= 100),
  moves            text[] not null default '{}' check (cardinality(moves) <= 1200),
  last_move        text check (last_move ~ '^[a-h][1-8][a-h][1-8][qrbn]?\Z'),
  status           text not null default 'active'
                     check (status in ('active', 'checkmate', 'stalemate', 'draw', 'resigned', 'abandoned')),
  winner_id        uuid references public.profiles (id) on delete set null,
  draw_offered_by  uuid references public.profiles (id) on delete set null,
  created_by       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (white_id <> black_id)
);

create index if not exists chess_games_space_idx on public.chess_games (space_id, created_at desc);

drop trigger if exists chess_games_touch on public.chess_games;
create trigger chess_games_touch before update on public.chess_games
  for each row execute function public.touch_updated_at();

alter table public.chess_games enable row level security;
revoke all on table public.chess_games from anon, authenticated;
grant select on table public.chess_games to authenticated;

drop policy if exists "chess: members watch" on public.chess_games;
create policy "chess: members watch" on public.chess_games
  for select to authenticated
  using (public.is_space_member(space_id));

-- Every change goes through the functions below, which check whose turn it is.

-- Start a new game (any unfinished one is set aside). play_as: 'white', 'black' or 'random'.
create or replace function public.chess_new_game(play_as text default 'random')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid     uuid := auth.uid();
  sid     uuid;
  partner uuid;
  me_white boolean;
  gid     uuid;
begin
  select m.space_id into sid from public.couple_members m where m.user_id = uid;
  if sid is null then
    raise exception 'Not a member';
  end if;
  select m.user_id into partner from public.couple_members m where m.space_id = sid and m.user_id <> uid;
  if partner is null then
    raise exception 'Your love has not joined yet';
  end if;

  me_white := case play_as when 'white' then true when 'black' then false else random() < 0.5 end;

  update public.chess_games g set status = 'abandoned'
  where g.space_id = sid and g.status = 'active';

  insert into public.chess_games (space_id, white_id, black_id, created_by)
  values (
    sid,
    case when me_white then uid else partner end,
    case when me_white then partner else uid end,
    uid
  )
  returning id into gid;
  return gid;
end;
$$;

-- Make a move. expected_ply guards against two moves racing each other.
-- Legality is checked in the app (chess.js) on both screens; here we check turn,
-- order and format so the stored game can never be scrambled.
create or replace function public.chess_move(
  game_id      uuid,
  expected_ply integer,
  san          text,
  uci          text,
  new_fen      text,
  new_status   text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  g     public.chess_games;
  mover uuid;
begin
  select * into g from public.chess_games c where c.id = game_id for update;
  if not found or not public.is_space_member(g.space_id) then
    raise exception 'Game not found';
  end if;
  if g.status <> 'active' then
    raise exception 'This game is already over';
  end if;
  if cardinality(g.moves) <> expected_ply then
    raise exception 'stale: the board changed';
  end if;
  mover := case when expected_ply % 2 = 0 then g.white_id else g.black_id end;
  if mover <> uid then
    raise exception 'It is not your turn';
  end if;
  if san !~ '^[A-Za-z0-9+#=-]{2,10}\Z' or uci !~ '^[a-h][1-8][a-h][1-8][qrbn]?\Z' then
    raise exception 'Invalid move';
  end if;
  if char_length(new_fen) > 100
     or new_fen !~ '^[pnbrqkPNBRQK1-8/]+ [wb] (-|[KQkq]+) (-|[a-h][36]) [0-9]+ [0-9]+\Z'
     or split_part(new_fen, ' ', 2) <> case when (expected_ply + 1) % 2 = 0 then 'w' else 'b' end then
    raise exception 'Invalid position';
  end if;
  if new_status not in ('active', 'checkmate', 'stalemate', 'draw') then
    raise exception 'Invalid status';
  end if;

  update public.chess_games c
  set fen = new_fen,
      moves = c.moves || san,
      last_move = uci,
      status = new_status,
      winner_id = case when new_status = 'checkmate' then uid else null end,
      draw_offered_by = null
  where c.id = game_id;
end;
$$;

create or replace function public.chess_resign(game_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g   public.chess_games;
begin
  select * into g from public.chess_games c where c.id = game_id for update;
  if not found or uid not in (g.white_id, g.black_id) then
    raise exception 'Game not found';
  end if;
  if g.status <> 'active' then
    raise exception 'This game is already over';
  end if;
  update public.chess_games c
  set status = 'resigned',
      winner_id = case when uid = g.white_id then g.black_id else g.white_id end,
      draw_offered_by = null
  where c.id = game_id;
end;
$$;

-- A draw needs both: one offers, the other accepts.
create or replace function public.chess_draw(game_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  g   public.chess_games;
begin
  select * into g from public.chess_games c where c.id = game_id for update;
  if not found or uid not in (g.white_id, g.black_id) then
    raise exception 'Game not found';
  end if;
  if g.status <> 'active' then
    raise exception 'This game is already over';
  end if;
  if g.draw_offered_by is not null and g.draw_offered_by <> uid then
    update public.chess_games c set status = 'draw', draw_offered_by = null where c.id = game_id;
    return 'agreed';
  end if;
  update public.chess_games c set draw_offered_by = uid where c.id = game_id;
  return 'offered';
end;
$$;

revoke all on function public.chess_new_game(text)                                   from public, anon;
revoke all on function public.chess_move(uuid, integer, text, text, text, text)      from public, anon;
revoke all on function public.chess_resign(uuid)                                     from public, anon;
revoke all on function public.chess_draw(uuid)                                       from public, anon;
grant execute on function public.chess_new_game(text)                              to authenticated;
grant execute on function public.chess_move(uuid, integer, text, text, text, text) to authenticated;
grant execute on function public.chess_resign(uuid)                                to authenticated;
grant execute on function public.chess_draw(uuid)                                  to authenticated;

-- Live board updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chess_games'
     ) then
    alter publication supabase_realtime add table public.chess_games;
  end if;
end;
$$;
