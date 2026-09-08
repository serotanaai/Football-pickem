-- ---------------------------------------------------------------------------
-- A week's board waits for the poll, and a top25 board follows it afterwards.
--
-- Two problems, one cause: boards were built from whatever ranks happened to be
-- on the games table at the moment somebody asked for them, days or weeks
-- before the poll that decides the week.
--
--   1. A top25 board is "every game with a ranked team". Built early, that is
--      last week's twenty-five. The weekly top-up then only ever ADDED newly
--      ranked games and never dropped a team that had fallen out, so the board
--      drifted into the union of every poll since it was created.
--
--   2. The 2.5x game is frozen when the board is built, deliberately, so that
--      it cannot move under somebody who has already picked. Frozen against a
--      stale poll, it froze the wrong game.
--
-- So a week now waits. Its board is not built until the AP poll for that week
-- is in, and while there are no picks on it a top25 board is re-cut every time
-- the poll moves.
--
-- The wait fails OPEN, which matters more than it looks. The poll is fetched
-- from a third party that can change shape, rate-limit, or simply be down, and
-- syncRankings has been swallowing its own errors since it was written — the
-- rankings table is empty today and nothing ever said so. A gate that waits for
-- a signal that never comes would hold every week of the season and take the
-- product off the air. So the board also opens on a deadline, and the poll only
-- decides whether it opens EARLIER than that.
-- ---------------------------------------------------------------------------

-- Is the AP poll for this week published?
create or replace function public.ap_poll_published(p_season integer, p_week integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.rankings
     where season = p_season and week = p_week and poll = 'ap'
  );
$fn$;

comment on function public.ap_poll_published(integer, integer) is
  'Whether the AP Top 25 for a given week has been stored yet.';


-- May a week's board be built and shown?
--
-- The poll opens it early; the deadline opens it regardless. Three days before
-- the first kickoff is the backstop: far enough ahead that a league still has
-- the week to pick in, late enough that a normal Sunday poll has always won the
-- race and the deadline never fires.
create or replace function public.week_board_open(p_season integer, p_week integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select public.ap_poll_published(p_season, p_week)
      or coalesce(
           (select min(g.start_time) - interval '3 days' <= now()
              from public.games g
             where g.season = p_season
               and g.season_type = 2
               and g.week = p_week
               and g.status <> 'canceled'),
           -- No games on the schedule at all: nothing to hold back, and
           -- refusing forever would be the closed failure this avoids.
           true);
$fn$;

comment on function public.week_board_open(integer, integer) is
  'Whether a week may be built: the AP poll is in, or the backstop deadline has passed.';

grant execute on function public.ap_poll_published(integer, integer) to anon, authenticated, service_role;
grant execute on function public.week_board_open(integer, integer) to anon, authenticated, service_role;


create or replace function public.generate_week_board(
  p_league_id uuid,
  p_week integer,
  p_reset boolean default false
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l          public.leagues;
  w          public.league_weeks;
  v_existing integer;
  v_count    integer;
  v_cap      integer;
  v_locked   boolean;
  v_picked   boolean;
begin
  select * into l from public.leagues where id = p_league_id;
  if not found then raise exception 'League not found.'; end if;

  if auth.uid() is not null and not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league.';
  end if;
  if p_reset and auth.uid() is not null and not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can rebuild a week''s slate.';
  end if;

  insert into public.league_weeks (league_id, week, scope, conference_id, is_playoff, playoff_round)
  values (
    p_league_id, p_week, l.scope, l.conference_id,
    l.playoff_teams > 0 and p_week > l.regular_season_end_week,
    case when l.playoff_teams > 0 and p_week > l.regular_season_end_week
         then p_week - l.regular_season_end_week end)
  on conflict (league_id, week) do update
    set scope = excluded.scope,
        conference_id = excluded.conference_id;

  select * into w from public.league_weeks where league_id = p_league_id and week = p_week;

  select count(*) into v_existing
    from public.league_week_games where league_week_id = w.id;

  -- The hold. Only ever applies to a week with nothing on it yet: once a board
  -- exists people can see it, and taking it away again would be worse than
  -- having shown it early.
  if v_existing = 0 and not p_reset and not public.week_board_open(l.season, p_week) then
    return 0;
  end if;

  if p_reset then
    delete from public.picks p
     using public.games g
     where p.league_id = p_league_id and p.week = p_week
       and g.id = p.game_id and g.start_time > now();

    delete from public.league_week_games lwg
     using public.games g
     where lwg.league_week_id = w.id and g.id = lwg.game_id and g.start_time > now();
  end if;

  v_picked := exists (
    select 1 from public.picks p where p.league_id = p_league_id and p.week = p_week);
  v_locked := coalesce(w.lock_at <= now(), false);

  -- Re-cut a top25 board to the poll as it stands.
  --
  -- Only while the week is untouched: a board somebody has picked on, or one
  -- that has started, is a contract. Dropping a game out from under a pick is
  -- how a league stops trusting the scoreboard.
  if w.scope = 'top25' and not v_picked and not v_locked then
    delete from public.league_week_games lwg
     using public.games g
     where lwg.league_week_id = w.id
       and g.id = lwg.game_id
       and g.start_time > now()
       and coalesce(g.home_rank, 99) > 25
       and coalesce(g.away_rank, 99) > 25;

    -- The 2.5x game may have just been cut with them.
    update public.league_weeks
       set featured_game_id = null
     where id = w.id
       and featured_game_id is not null
       and not exists (select 1 from public.league_week_games x
                        where x.league_week_id = w.id and x.game_id = featured_game_id);
  end if;

  if w.scope = 'all_fbs' then
    insert into public.league_week_games (league_week_id, game_id)
    select w.id, g.id
      from public.games g
      join public.teams ht on ht.id = g.home_team_id
      join public.teams at on at.id = g.away_team_id
     where g.season = l.season
       and g.season_type = 2
       and g.week = p_week
       and g.status <> 'canceled'
       and g.start_time > now()
       and ht.is_fbs
       and at.is_fbs
     order by public.marquee_rank(g.home_rank, g.away_rank, g.broadcast, g.start_time), g.id
     limit 1
    on conflict do nothing;
  end if;

  select count(*) into v_existing
    from public.league_week_games where league_week_id = w.id;

  v_cap := least(greatest(l.max_games_per_week, 5), 15);

  with exposure as (
    select t.team_id, count(*)::int as appearances
      from (
        select g2.home_team_id as team_id
          from public.league_week_games x
          join public.league_weeks lw on lw.id = x.league_week_id
          join public.games g2      on g2.id = x.game_id
         where lw.league_id = p_league_id and lw.week < p_week
        union all
        select g2.away_team_id
          from public.league_week_games x
          join public.league_weeks lw on lw.id = x.league_week_id
          join public.games g2      on g2.id = x.game_id
         where lw.league_id = p_league_id and lw.week < p_week
      ) t
     group by t.team_id
  )
  insert into public.league_week_games (league_week_id, game_id)
  select w.id, c.id
    from (
      select
        g.id,
        coalesce(eh.appearances, 0) + coalesce(ea.appearances, 0) as exposure,
        md5(p_league_id::text || ':' || p_week::text || ':' || g.id::text) as shuffle,
        g.start_time
      from public.games g
      join public.teams ht on ht.id = g.home_team_id
      join public.teams at on at.id = g.away_team_id
      left join exposure eh on eh.team_id = g.home_team_id
      left join exposure ea on ea.team_id = g.away_team_id
     where g.season = l.season
       and g.season_type = 2
       and g.week = p_week
       and g.status <> 'canceled'
       and not exists (
         select 1 from public.league_week_games x
          where x.league_week_id = w.id and x.game_id = g.id)
       and (
         (w.scope = 'all_fbs' and ht.is_fbs and at.is_fbs)
         or (w.scope = 'top25'
             and (coalesce(g.home_rank, 99) <= 25 or coalesce(g.away_rank, 99) <= 25))
         or (w.scope = 'conference'
             and (ht.conference_id = w.conference_id or at.conference_id = w.conference_id))
       )
    ) c
   order by c.exposure asc, c.shuffle asc, c.start_time asc
   limit case when w.scope = 'all_fbs' then greatest(v_cap - v_existing, 0) else null end
  on conflict do nothing;

  select count(*) into v_count from public.league_week_games where league_week_id = w.id;

  update public.league_weeks
     set game_count = v_count,
         lock_at = (select min(g.start_time)
                      from public.league_week_games x
                      join public.games g on g.id = x.game_id
                     where x.league_week_id = w.id)
   where id = w.id;

  return v_count;
end
$function$;
