-- ---------------------------------------------------------------------------
-- The landing ticker and the picks counter.
--
-- Two things the front page needs that nothing else did: the period and clock
-- of a game in progress, and a count of picks that someone with no account can
-- read.
-- ---------------------------------------------------------------------------

-- status_detail already carries ESPN's own wording ("4:22 - 3rd Quarter"), but
-- the ticker interpolates period and clock into its own sentence, and parsing a
-- display string back apart is the wrong direction. Both come off the same
-- status object the sync already reads.
alter table public.games
  add column if not exists period smallint,
  add column if not exists clock  text;

comment on column public.games.period is
  'Quarter (or overtime period) in play, from the ESPN scoreboard status.';
comment on column public.games.clock is
  'Game clock as ESPN displays it, e.g. 4:22. Null outside a live game.';


-- The picks table is readable only by the person who made a pick and by league
-- members after kickoff, which is right — but it makes a platform-wide count
-- unreadable to a signed-out visitor, who is exactly who the number is for. A
-- definer function publishes the total and nothing else.
create or replace function public.platform_picks_count(p_season integer)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::int
    from public.picks p
    join public.games g on g.id = p.game_id
   where g.season = p_season;
$fn$;

revoke all on function public.platform_picks_count(integer) from public;
grant execute on function public.platform_picks_count(integer) to anon, authenticated;
