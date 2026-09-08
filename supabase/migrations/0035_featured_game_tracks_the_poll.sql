-- ---------------------------------------------------------------------------
-- The 2.5x game follows the poll until somebody commits to it.
--
-- A board opens when the poll is in, but it is cut from the ranks on the games
-- rows, and those come from a different ESPN endpoint than the poll does. So
-- the run that first sees a new poll can still be holding last week's ranks,
-- and the marquee game it seats would have stayed wrong all week — the choice
-- was frozen from the moment it was made.
--
-- That was the wrong moment to freeze. What must not happen is the multiplier
-- moving under a member who has already picked; until then, re-choosing every
-- run is what makes a stale build correct itself on the next pass.
--
-- Proven on live data: a league with no picks had its featured game forced to
-- the worst on its board and the next build put #1 Ohio State at #5 Texas back;
-- a league with thirteen picks kept the game it had.
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

  -- The 2.5x game follows the poll until somebody commits to it.
  --
  -- It was frozen from the moment it was chosen, which is the wrong moment. The
  -- invariant that matters is that the multiplier cannot move under a member who
  -- has already picked, so the freeze belongs at the first pick, not at
  -- creation. Before then, re-choosing on every run is what lets a slate built
  -- from a half-updated scoreboard correct itself an hour later rather than
  -- carry the wrong marquee game all week.
  if not v_picked and not v_locked then
    update public.league_weeks set featured_game_id = null where id = w.id;
    perform public.set_featured_game(p_league_id, p_week);
  end if;

  return v_count;
end
$function$;
