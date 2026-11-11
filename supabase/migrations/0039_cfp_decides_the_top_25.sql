-- ---------------------------------------------------------------------------
-- The committee decides the top 25, and the board waits for the committee.
--
-- Once the College Football Playoff committee is publishing, its ranking is the
-- one that matters, and it comes out on Tuesday. The AP poll comes out on
-- Sunday. Building next week's board from Sunday's AP poll meant building it
-- from the wrong ranking -- and in practice it was worse than that: ESPN's
-- scoreboard carries the latest *committee* ranking as curatedRank, so week 11's
-- board was cut on Sunday from the CFP published on 3 November, before week 10
-- had been played. All 25 ranked slots on week 11's games matched that stale
-- ranking; one matched the AP poll the gate had opened on.
--
-- So in committee season a week's board waits for that week's committee
-- ranking: nothing is built between the last game on Saturday and the Tuesday
-- release. Before the committee publishes at all, the AP poll decides as it
-- always has -- there is nothing else to wait for.
--
-- Three things make that safe, and each answers something the schedule does:
--
--   1. Every remaining week starts on Tuesday at 7pm ET with MACtion, the same
--      evening the committee publishes. A board built after that included the
--      games already under way, so its lock_at -- the first kickoff -- was in the
--      past the moment it existed, and due_emails drops any week whose lock_at
--      has passed. Those leagues would have had no preview and no reminders.
--      The builder now only takes games that have not kicked off.
--
--   2. ESPN's scoreboard can lag its rankings endpoint. The run that first sees
--      the new committee ranking is the run that opens the gate and cuts the
--      board, and if curatedRank still held last week's ranking at that moment,
--      the board -- and its 2.5x game, frozen at the first pick -- would be cut
--      from it. apply_cfp_ranks writes the week's own committee ranking onto its
--      games before any board is built, so the cut is made from the ranking that
--      opened the gate, not whatever the scoreboard says yet.
--
--   3. A gate that waits for a feed can wait forever. On the evening of 10
--      November the committee ranking was still absent from the feed two hours
--      after kickoff. If it never arrives, the board opens at Wednesday noon ET
--      on whatever the games carry, rather than costing the league the week.
-- ---------------------------------------------------------------------------

-- Has the committee's ranking for this week been stored?
create or replace function public.cfp_published(p_season integer, p_week integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.rankings
     where season = p_season and week = p_week and poll = 'cfp'
  );
$fn$;

-- Was the committee already publishing before this week? That is what makes
-- this a committee-season week: the first committee week itself cannot know
-- in advance that a ranking is coming, so it is built from AP as before.
create or replace function public.cfp_season(p_season integer, p_week integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.rankings
     where season = p_season and week < p_week and poll = 'cfp'
  );
$fn$;

-- Wednesday noon ET of the week: the latest a board waits for the committee.
--
-- Anchored on the week's last kickoff, pulled back six hours so a late game
-- listed at midnight still counts as Saturday's.
create or replace function public.cfp_backstop(p_season integer, p_week integer)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $fn$
  select coalesce(
    (date_trunc('day', (max(g.start_time) at time zone 'America/New_York') - interval '6 hours')
       - interval '3 days' + interval '12 hours') at time zone 'America/New_York',
    now())
    from public.games g
   where g.season = p_season
     and g.season_type = 2
     and g.week = p_week
     and g.status <> 'canceled';
$fn$;

-- What, if anything, is a week's board waiting for? 'cfp', 'ap', or null when
-- it may be built. The page reads this so it can say which ranking and when.
create or replace function public.week_board_waiting_on(p_season integer, p_week integer)
returns text
language sql
stable
set search_path = public, pg_temp
as $fn$
  select case
    when public.cfp_published(p_season, p_week) then null
    when public.cfp_season(p_season, p_week) then
      case when now() >= public.cfp_backstop(p_season, p_week) then null else 'cfp' end
    when public.ap_poll_published(p_season, p_week) then null
    -- A season whose poll pipeline has never delivered is not one to hold on.
    when not public.ap_poll_ever_seen(p_season) then null
    else 'ap'
  end;
$fn$;

create or replace function public.week_board_open(p_season integer, p_week integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $fn$
  select public.week_board_waiting_on(p_season, p_week) is null;
$fn$;

comment on function public.week_board_open(integer, integer) is
  'A week may be built once its ranking is in: the committee''s in CFP season (backstop Wednesday noon ET), the AP poll before it.';


-- Write the week's committee ranking onto its games.
--
-- Only a complete ranking. The committee always ranks twenty-five; fewer stored
-- means a team was dropped for want of a teams row, and applying a partial
-- ranking would strip a real rank off a real game. Rows already carrying the
-- right ranks are left alone, so once the scoreboard catches up this is a no-op.
create or replace function public.apply_cfp_ranks(p_season integer, p_week integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_n integer := 0;
begin
  if (select count(*) from public.rankings
       where season = p_season and week = p_week and poll = 'cfp') < 25 then
    return 0;
  end if;

  with cfp as (
    select team_id, rank from public.rankings
     where season = p_season and week = p_week and poll = 'cfp'
  ),
  target as (
    select g.id,
           (select c.rank from cfp c where c.team_id = g.home_team_id) as home_rank,
           (select c.rank from cfp c where c.team_id = g.away_team_id) as away_rank
      from public.games g
     where g.season = p_season and g.season_type = 2 and g.week = p_week
  )
  update public.games g
     set home_rank = t.home_rank,
         away_rank = t.away_rank
    from target t
   where g.id = t.id
     and (g.home_rank is distinct from t.home_rank
       or g.away_rank is distinct from t.away_rank);

  get diagnostics v_n = row_count;
  return v_n;
end
$fn$;

comment on function public.apply_cfp_ranks(integer, integer) is
  'Writes a week''s stored committee ranking onto its games, so boards are cut from it rather than from whatever the scoreboard says yet.';


-- refresh_season: unchanged, except that the committee ranking is written onto
-- each week's games before any board for that week is built or re-cut.
create or replace function public.refresh_season(p_season integer, p_weeks integer[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  v_ranked   integer := 0;
begin
  if auth.uid() is not null then
    raise exception 'refresh_season runs on the schedule, not from the app.';
  end if;

  foreach v_week in array p_weeks loop
    v_ranked := v_ranked + public.apply_cfp_ranks(p_season, v_week);
  end loop;

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
    'firstError',       v_first,
    'cfpRanksApplied',  v_ranked);
end $function$;


-- generate_week_board: unchanged, except the main insert now only takes games
-- that have not kicked off. See (1) above. Already-started games could never be
-- picked anyway; adding them only dragged lock_at into the past.
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

  if w.scope = 'top25' and not v_picked and not v_locked then
    delete from public.league_week_games lwg
     using public.games g
     where lwg.league_week_id = w.id
       and g.id = lwg.game_id
       and g.start_time > now()
       and coalesce(g.home_rank, 99) > 25
       and coalesce(g.away_rank, 99) > 25;
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
       -- Only games somebody can still pick. A board built on Tuesday night,
       -- after the week's 7pm kickoffs, would otherwise open with a lock_at
       -- already behind it and fall straight out of the email sequence.
       and g.start_time > now()
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

  -- The 2.5x game follows the poll until somebody commits to it.
  --
  -- It was frozen from the moment it was chosen, which is the wrong moment. The
  -- invariant that matters is that the multiplier cannot move under a member
  -- who has already picked — so the freeze belongs at the first pick, not at
  -- creation. Before then, re-choosing every run is what makes a slate built
  -- from a half-updated scoreboard correct itself an hour later instead of
  -- carrying the wrong marquee game all week.
  if not v_picked and not v_locked then
    update public.league_weeks set featured_game_id = null where id = w.id;
    perform public.set_featured_game(p_league_id, p_week);
  end if;

  return v_count;
end
$function$;


grant execute on function public.cfp_published(integer, integer)         to anon, authenticated, service_role;
grant execute on function public.cfp_season(integer, integer)            to anon, authenticated, service_role;
grant execute on function public.cfp_backstop(integer, integer)          to anon, authenticated, service_role;
grant execute on function public.week_board_waiting_on(integer, integer) to anon, authenticated, service_role;
grant execute on function public.week_board_open(integer, integer)       to anon, authenticated, service_role;

-- Writes to games with definer rights: the schedule only, never a member.
revoke execute on function public.apply_cfp_ranks(integer, integer) from public, anon, authenticated;
grant  execute on function public.apply_cfp_ranks(integer, integer) to service_role;
