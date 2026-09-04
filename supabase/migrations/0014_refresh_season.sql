-- Refresh every league in one round trip.
--
-- The cron used to pull the league list into Node and then call
-- generate_week_board (and advance_playoffs) over HTTP, once per league per
-- week. The SQL was never the cost — the round trip was. At 30ms each, a
-- thousand leagues over two weeks is about two minutes of pure latency inside
-- a function that gets killed at five, and when it dies scores stop updating
-- for every league at once, not just the big ones.
--
-- The same loop runs here instead, so the whole refresh is one request.
--
-- A league that throws must not take the rest of the season down with it, so
-- each one is attempted in its own block and failures are counted and
-- returned rather than swallowed — a silent zero is how this would rot.
create or replace function public.refresh_season(p_season integer, p_weeks integer[])
returns jsonb
language plpgsql
security definer
set search_path = public as $$
declare
  l          record;
  v_week     integer;
  v_rounds   integer;
  v_final    integer;
  v_leagues  integer := 0;
  v_boards   integer := 0;
  v_advanced integer := 0;
  v_failed   integer := 0;
  v_first    text;
  v_adv      integer;
begin
  -- The scheduled run holds the service role, where auth.uid() is null. A
  -- signed-in caller has no business rebuilding every league in the season.
  if auth.uid() is not null then
    raise exception 'refresh_season runs on the schedule, not from the app.';
  end if;

  for l in
    select id, start_week, regular_season_end_week, playoff_teams
      from public.leagues
     where season = p_season
     order by created_at
  loop
    v_leagues := v_leagues + 1;
    v_rounds  := case l.playoff_teams when 8 then 3 when 4 then 2 when 2 then 1 else 0 end;
    v_final   := l.regular_season_end_week + v_rounds;

    foreach v_week in array p_weeks loop
      if v_week < l.start_week or v_week > v_final then continue; end if;

      begin
        perform public.generate_week_board(l.id, v_week, false);
        v_boards := v_boards + 1;

        if l.playoff_teams > 0 and v_week > l.regular_season_end_week then
          v_adv := public.advance_playoffs(l.id, v_week);
          v_advanced := v_advanced + coalesce(v_adv, 0);
        end if;
      exception when others then
        v_failed := v_failed + 1;
        if v_first is null then
          v_first := format('league %s week %s: %s', l.id, v_week, sqlerrm);
        end if;
      end;
    end loop;
  end loop;

  return jsonb_build_object(
    'leagues',          v_leagues,
    'boards',           v_boards,
    'advancedMatchups', v_advanced,
    'failed',           v_failed,
    'firstError',       v_first);
end $$;

-- Service role only. The default grant is to PUBLIC, so revoking from the two
-- API roles alone would leave it callable.
revoke execute on function public.refresh_season(integer, integer[]) from public, anon, authenticated;

-- The per-league scan above runs once per refresh.
create index if not exists leagues_season_idx on public.leagues (season);
