-- ---------------------------------------------------------------------------
-- An all-FBS board keeps the week's best game.
--
-- set_featured_game can only choose from the board it is given, and an all-FBS
-- board is the only one that is a selection rather than the whole qualifying
-- set: top25 and conference leagues carry every game that qualifies, so the
-- marquee matchup is always on them. All-FBS is capped at max_games_per_week
-- and filled by team exposure and a per-league shuffle — deliberately, so the
-- same ten teams do not appear every week — and rank never entered into it. So
-- the biggest game of the week landed on an all-FBS board only by luck.
--
-- In week 2 that showed: every top25 league featured #1 Ohio State at #5 Texas,
-- while five of six all-FBS leagues featured a ranked side against an unranked
-- one — Notre Dame–Rice, Georgia–Western Kentucky — because Ohio State–Texas
-- was not on their board at all.
--
-- The fix is one reserved seat rather than a new sort. Ordering the whole board
-- by rank would get the featured game right and quietly undo the rotation, and
-- a league that follows all of FBS would spend the season watching the same
-- dozen ranked teams. So the marquee game is seated first and the rest of the
-- board fills in behind it exactly as before, one slot lighter.
-- ---------------------------------------------------------------------------

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

  if p_reset then
    delete from public.picks p
     using public.games g
     where p.league_id = p_league_id and p.week = p_week
       and g.id = p.game_id and g.start_time > now();

    delete from public.league_week_games lwg
     using public.games g
     where lwg.league_week_id = w.id and g.id = lwg.game_id and g.start_time > now();
  end if;

  -- The reserved seat. Taken before the count below, so it costs one of the
  -- league's slots rather than widening the board past its cap.
  --
  -- Only games that have not kicked off yet: a board built mid-week must not
  -- seat a 2.5x game nobody in the league could still pick.
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
