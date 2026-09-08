-- ---------------------------------------------------------------------------
-- No board without the poll.
--
-- 0031 held a week until its AP Top 25 landed, but opened it anyway three days
-- before kickoff so that a broken poll fetch could not take the product off the
-- air. That deadline is now gone: a week waits for its poll, full stop, whatever
-- scope the league follows. A conference board does not choose its games by
-- rank, but it does choose its 2.5x game by rank, so it waits too.
--
-- The deadline is replaced by a narrower guard against the same disaster.
--
-- The poll is fetched from a third party, and syncRankings swallowed its own
-- errors for long enough that the rankings table sat empty all season with
-- nothing saying so. A gate that waits for a signal which has never once
-- arrived would not hold week 3 — it would hold every week of the season, and
-- the first anybody would know is a league asking why it cannot pick.
--
-- So the gate arms itself. Until this season has stored at least one AP poll,
-- the pipeline is unproven and the gate stands aside. The moment a poll lands,
-- the pipeline is proven, and from then on a week with no poll means the poll
-- is genuinely not out yet — which is exactly the case worth holding for.
--
-- The practical difference is small and the failure modes are not. Once the
-- first poll of the season is in, this behaves exactly as "no board without the
-- poll", every week, for every league. Before it, the alternative was not a
-- stricter product, it was a dead one.
-- ---------------------------------------------------------------------------

-- Has this season ever produced an AP poll?
create or replace function public.ap_poll_ever_seen(p_season integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.rankings where season = p_season and poll = 'ap'
  );
$fn$;

comment on function public.ap_poll_ever_seen(integer) is
  'Whether the poll pipeline has ever delivered for this season. Arms the board gate.';


create or replace function public.week_board_open(p_season integer, p_week integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select public.ap_poll_published(p_season, p_week)
      or not public.ap_poll_ever_seen(p_season);
$fn$;

comment on function public.week_board_open(integer, integer) is
  'A week may be built once its AP Top 25 is stored. Stands aside only while the season has never stored one at all.';

grant execute on function public.ap_poll_ever_seen(integer) to anon, authenticated, service_role;
