-- Weekly slate generation, pick grading, standings views, and the playoff bracket.

create or replace function public.generate_week_board(
  p_league_id uuid,
  p_week      integer,
  p_reset     boolean default false
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  l          public.leagues;
  w          public.league_weeks;
  v_existing integer;
  v_count    integer;
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
  on conflict (league_id, week) do nothing;

  select * into w from public.league_weeks where league_id = p_league_id and week = p_week;

  -- A reset only touches games that have not kicked off, so finished weeks stay intact.
  if p_reset then
    delete from public.picks p
     using public.games g
     where p.league_id = p_league_id and p.week = p_week
       and g.id = p.game_id and g.start_time > now();

    delete from public.league_week_games lwg
     using public.games g
     where lwg.league_week_id = w.id and g.id = lwg.game_id and g.start_time > now();
  end if;

  select count(*) into v_existing
    from public.league_week_games where league_week_id = w.id;

  insert into public.league_week_games (league_week_id, game_id)
  select w.id, g.id
    from public.games g
    join public.teams ht on ht.id = g.home_team_id
    join public.teams at on at.id = g.away_team_id
   where g.season = l.season
     and g.season_type = 2
     and g.week = p_week
     and ht.is_fbs and at.is_fbs
     and g.status <> 'canceled'
     and not exists (
       select 1 from public.league_week_games x
        where x.league_week_id = w.id and x.game_id = g.id)
     and (
       w.scope = 'all_fbs'
       or (w.scope = 'top25'
           and (coalesce(g.home_rank, 99) <= 25 or coalesce(g.away_rank, 99) <= 25))
       or (w.scope = 'conference'
           and (ht.conference_id = w.conference_id or at.conference_id = w.conference_id))
     )
   order by
     least(coalesce(g.home_rank, 99), coalesce(g.away_rank, 99)) asc,
     g.start_time asc,
     g.id asc
   limit greatest(l.max_games_per_week - v_existing, 0)
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
end $$;

create or replace function public.set_week_scope(
  p_league_id     uuid,
  p_week          integer,
  p_scope         public.league_scope,
  p_conference_id integer default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare l public.leagues;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can change the weekly slate.';
  end if;
  if p_scope = 'conference' and p_conference_id is null then
    raise exception 'Pick a conference for a conference-only week.';
  end if;

  select * into l from public.leagues where id = p_league_id;

  insert into public.league_weeks (league_id, week, scope, conference_id, is_playoff, playoff_round)
  values (
    p_league_id, p_week, p_scope,
    case when p_scope = 'conference' then p_conference_id end,
    l.playoff_teams > 0 and p_week > l.regular_season_end_week,
    case when l.playoff_teams > 0 and p_week > l.regular_season_end_week
         then p_week - l.regular_season_end_week end)
  on conflict (league_id, week) do update
    set scope = excluded.scope,
        conference_id = excluded.conference_id;

  return public.generate_week_board(p_league_id, p_week, true);
end $$;

create or replace function public.grade_picks()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.picks p
     set is_correct = (p.team_id = g.winner_team_id),
         points     = case when p.team_id = g.winner_team_id then 1 else 0 end,
         updated_at = now()
    from public.games g
   where g.id = p.game_id
     and g.completed
     and g.winner_team_id is not null
     and p.is_correct is distinct from (p.team_id = g.winner_team_id);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.member_week_points(
  p_league_id uuid, p_user uuid, p_week integer)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(points), 0)::int
    from public.picks
   where league_id = p_league_id and user_id = p_user and week = p_week;
$$;

-- security_invoker keeps the picks RLS policy in force: nobody sees an ungraded
-- week's totals for anyone but themselves.
create or replace view public.weekly_results
with (security_invoker = true) as
  select
    p.league_id,
    p.week,
    p.user_id,
    count(*)::int                                        as picks_made,
    count(*) filter (where p.is_correct)::int            as correct,
    count(*) filter (where p.is_correct = false)::int    as incorrect,
    coalesce(sum(p.points), 0)::int                      as points
  from public.picks p
  group by p.league_id, p.week, p.user_id;

create or replace view public.weekly_results_ranked
with (security_invoker = true) as
  select
    wr.*,
    rank() over (partition by wr.league_id, wr.week order by wr.points desc)::int as week_rank
  from public.weekly_results wr;

create or replace view public.league_standings
with (security_invoker = true) as
  select
    r.league_id,
    r.user_id,
    sum(r.points)::int                              as points,
    sum(r.correct)::int                             as correct,
    sum(r.incorrect)::int                           as incorrect,
    sum(r.picks_made)::int                          as picks_made,
    count(*) filter (where r.week_rank = 1)::int    as weekly_wins,
    case when sum(r.correct) + sum(r.incorrect) > 0
         then round(sum(r.correct)::numeric / (sum(r.correct) + sum(r.incorrect)), 4)
         else null end                              as win_pct
  from public.weekly_results_ranked r
  group by r.league_id, r.user_id;

-- Seeds the bracket from regular-season points; 1 plays N, 2 plays N-1, and so on.
create or replace function public.seed_playoffs(p_league_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l       public.leagues;
  v_seeds uuid[];
  cnt     integer;
  n       integer;
  rounds  integer;
  i       integer;
  r       integer;
begin
  select * into l from public.leagues where id = p_league_id;
  if not found then raise exception 'League not found.'; end if;
  if auth.uid() is not null and not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can start the playoffs.';
  end if;
  if l.playoff_teams = 0 then raise exception 'Playoffs are turned off for this league.'; end if;

  select array_agg(s.user_id order by s.points desc, s.correct desc, s.user_id)
    into v_seeds
    from (
      select m.user_id,
             coalesce(sum(p.points), 0)                 as points,
             count(*) filter (where p.is_correct)       as correct
        from public.league_members m
        left join public.picks p
               on p.league_id = m.league_id
              and p.user_id   = m.user_id
              and p.week between l.start_week and l.regular_season_end_week
       where m.league_id = p_league_id
       group by m.user_id
    ) s;

  cnt := coalesce(array_length(v_seeds, 1), 0);
  n   := l.playoff_teams;
  if cnt < n then
    raise exception 'This league needs % members for a %-team playoff (it has %).', n, n, cnt;
  end if;

  rounds := case n when 2 then 1 when 4 then 2 when 8 then 3 else 0 end;

  delete from public.playoff_matchups where league_id = p_league_id;

  for i in 1..(n / 2) loop
    insert into public.playoff_matchups
      (league_id, round, week, slot, home_user_id, away_user_id, home_seed, away_seed)
    values
      (p_league_id, 1, l.regular_season_end_week + 1, i,
       v_seeds[i], v_seeds[n + 1 - i], i, n + 1 - i);
  end loop;

  for r in 1..rounds loop
    perform public.generate_week_board(p_league_id, l.regular_season_end_week + r, false);
    update public.league_weeks
       set is_playoff = true, playoff_round = r
     where league_id = p_league_id and week = l.regular_season_end_week + r;
  end loop;

  return n;
end $$;

create or replace function public.advance_playoffs(p_league_id uuid, p_week integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  l         public.leagues;
  v_round   integer;
  rounds    integer;
  n         integer;
  v_slot    integer;
  v_updated integer := 0;
begin
  select * into l from public.leagues where id = p_league_id;
  if not found then raise exception 'League not found.'; end if;

  update public.playoff_matchups pm
     set home_points = public.member_week_points(p_league_id, pm.home_user_id, p_week),
         away_points = public.member_week_points(p_league_id, pm.away_user_id, p_week)
   where pm.league_id = p_league_id and pm.week = p_week;

  select min(round) into v_round
    from public.playoff_matchups
   where league_id = p_league_id and week = p_week;
  if v_round is null then return 0; end if;

  -- Only lock in a winner once every game on that week's slate is final.
  if exists (
    select 1
      from public.league_weeks lw
      join public.league_week_games lwg on lwg.league_week_id = lw.id
      join public.games g on g.id = lwg.game_id
     where lw.league_id = p_league_id and lw.week = p_week and not g.completed
  ) or not exists (
    select 1 from public.league_weeks lw
     where lw.league_id = p_league_id and lw.week = p_week and lw.game_count > 0
  ) then
    return 0;
  end if;

  -- Home is always the better seed, so a tie goes to the higher seed.
  update public.playoff_matchups
     set winner_user_id = case
           when coalesce(home_points, 0) >= coalesce(away_points, 0)
           then home_user_id else away_user_id end,
         is_final = true
   where league_id = p_league_id
     and week = p_week
     and home_user_id is not null
     and away_user_id is not null;
  get diagnostics v_updated = row_count;

  n      := l.playoff_teams;
  rounds := case n when 2 then 1 when 4 then 2 when 8 then 3 else 0 end;
  if v_round >= rounds then return v_updated; end if;

  for v_slot in 1..(n / (2 ^ (v_round + 1))::int) loop
    insert into public.playoff_matchups
      (league_id, round, week, slot, home_user_id, away_user_id, home_seed, away_seed)
    select
      p_league_id, v_round + 1, p_week + 1, v_slot,
      a.winner_user_id, b.winner_user_id,
      case when a.winner_user_id = a.home_user_id then a.home_seed else a.away_seed end,
      case when b.winner_user_id = b.home_user_id then b.home_seed else b.away_seed end
    from public.playoff_matchups a, public.playoff_matchups b
    where a.league_id = p_league_id and a.round = v_round and a.slot = v_slot * 2 - 1
      and b.league_id = p_league_id and b.round = v_round and b.slot = v_slot * 2
      and a.winner_user_id is not null and b.winner_user_id is not null
    on conflict (league_id, round, slot) do update
      set home_user_id = excluded.home_user_id,
          away_user_id = excluded.away_user_id,
          home_seed    = excluded.home_seed,
          away_seed    = excluded.away_seed;
  end loop;

  return v_updated;
end $$;
