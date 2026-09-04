-- Three rule changes:
--   1. A correct pick is worth 100 points.
--   2. Each game locks at its own kickoff, so a late entrant can still pick the
--      games that have not started — they simply forfeit the ones that have.
--   3. Playoff seeding runs on weekly wins first, cumulative points as tiebreak.

create or replace function public.grade_picks()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.picks p
     set is_correct = (p.team_id = g.winner_team_id),
         points     = case when p.team_id = g.winner_team_id then 100 else 0 end,
         updated_at = now()
    from public.games g
   where g.id = p.game_id
     and g.completed
     and g.winner_team_id is not null
     and (p.is_correct is distinct from (p.team_id = g.winner_team_id)
          or p.points is distinct from
             (case when p.team_id = g.winner_team_id then 100 else 0 end));
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.validate_pick()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g  record;
  ok boolean;
begin
  if tg_op = 'INSERT'
     or new.game_id is distinct from old.game_id
     or new.team_id is distinct from old.team_id then

    select * into g from public.games where id = new.game_id;
    if not found then
      raise exception 'Unknown game.';
    end if;
    if g.start_time <= now() then
      raise exception 'This game kicked off already — that one is gone.';
    end if;
    if new.team_id not in (g.home_team_id, g.away_team_id) then
      raise exception 'That team is not playing in this game.';
    end if;

    new.week := g.week;

    select exists (
      select 1
        from public.league_weeks lw
        join public.league_week_games lwg on lwg.league_week_id = lw.id
       where lw.league_id = new.league_id and lw.week = g.week and lwg.game_id = g.id)
      into ok;
    if not ok then
      raise exception 'That game is not on this league''s board for week %.', g.week;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

-- Picks lock game by game, so they reveal game by game too — otherwise a pick
-- you can still make would already be visible to everyone else.
drop policy "read own picks and revealed picks" on public.picks;
create policy "read own picks and revealed picks" on public.picks
  for select to authenticated using (
    user_id = (select auth.uid())
    or (public.is_league_member(league_id)
        and exists (select 1 from public.games g
                     where g.id = game_id and g.start_time <= now())));

-- Weekly wins act as the W-L record, cumulative points as points-for.
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

  select array_agg(s.user_id order by s.weekly_wins desc, s.points desc, s.user_id)
    into v_seeds
    from (
      select m.user_id,
             coalesce(t.points, 0)      as points,
             coalesce(t.weekly_wins, 0) as weekly_wins
        from public.league_members m
        left join (
          select r.user_id,
                 sum(r.pts)                                      as points,
                 count(*) filter (where r.rnk = 1 and r.pts > 0) as weekly_wins
            from (
              select p.user_id,
                     p.week,
                     sum(p.points) as pts,
                     rank() over (partition by p.week order by sum(p.points) desc) as rnk
                from public.picks p
               where p.league_id = p_league_id
                 and p.week between l.start_week and l.regular_season_end_week
               group by p.user_id, p.week
            ) r
           group by r.user_id
        ) t on t.user_id = m.user_id
       where m.league_id = p_league_id
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
