-- ============================================================================
-- Our Little Vrindavan — how much photo/video storage your space uses.
-- Run AFTER 20261118000800_week_one_off.sql. Safe to run more than once.
-- Read-only: adds one function, changes no data.
-- ============================================================================

-- Totals for the signed-in person's space only (files under <space_id>/ in the
-- private "memories" bucket). Videos are .mp4/.mov/.webm; everything else counts
-- as photos (including the small preview copies).
create or replace function public.space_storage_usage()
returns table (photo_bytes bigint, video_bytes bigint, photo_files bigint, video_files bigint)
language plpgsql
stable
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
  return query
    select
      coalesce(sum((o.metadata ->> 'size')::bigint) filter (where o.name !~* '\.(mp4|mov|webm)\Z'), 0)::bigint,
      coalesce(sum((o.metadata ->> 'size')::bigint) filter (where o.name ~* '\.(mp4|mov|webm)\Z'), 0)::bigint,
      count(*) filter (where o.name !~* '\.(mp4|mov|webm)\Z' and o.name !~* '_thumb\.jpg\Z')::bigint,
      count(*) filter (where o.name ~* '\.(mp4|mov|webm)\Z')::bigint
    from storage.objects o
    where o.bucket_id = 'memories'
      and o.name like sid::text || '/%';
end;
$$;

revoke all on function public.space_storage_usage() from public, anon;
grant execute on function public.space_storage_usage() to authenticated;
