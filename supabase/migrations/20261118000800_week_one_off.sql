-- ============================================================================
-- Our Little Vrindavan — one-off times in "Our week".
-- A block with on_date set happens only on that date (in its owner's time zone);
-- without it, it repeats every week as before. Adds only; existing data unchanged.
-- Run AFTER 20261118000700_presence_seen.sql. Safe to run more than once.
-- ============================================================================

alter table public.schedule_blocks add column if not exists on_date date;

grant update (label, weekday, start_minute, end_minute, tz, on_date) on table public.schedule_blocks to authenticated;

create index if not exists schedule_blocks_on_date_idx on public.schedule_blocks (space_id, on_date) where on_date is not null;
