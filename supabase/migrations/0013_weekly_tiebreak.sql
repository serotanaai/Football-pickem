-- Break weekly ties, once, in one place.
--
-- rank() over (order by points desc) gave every tied member rank 1, so a
-- three-way tie handed out three weekly wins. Weekly wins seed the bracket, so
-- a tie did not just look wrong, it moved people up the seeding.
--
-- Points cannot be the only test: every correct pick is worth the same 100, so
-- "most points" and "most correct" are the same number. The tiebreak is the
-- submission itself — whoever committed to their card earliest takes the week,
-- having chosen with the least information. Members who never submitted sort
-- last, and user_id settles the remainder so the order is total and stable.
-- Every member can read every submission in their league, so the same member
-- wins the week no matter who is looking.
--
-- "Who won the week" was written three times — here, in league_standings, and
-- again inline in seed_playoffs, which is how two of them drifted apart on
-- whether a zero-point week counts as a win. It is now one column, week_won,
-- and the other two read it.
create or replace view public.weekly_results_ranked
with (security_invoker = true) as
  select
    r.league_id,
    r.week,
    r.user_id,
    r.picks_made,
    r.correct,
    r.incorrect,
    r.points,
    r.week_rank,
    -- A week nobody scored in has no winner.
    (r.week_rank = 1 and r.points > 0) as week_won
  from (
    select
      wr.league_id,
      wr.week,
      wr.user_id,
      wr.picks_made,
      wr.correct,
      wr.incorrect,
      wr.points,
      rank() over (
        partition by wr.league_id, wr.week
        order by wr.points desc, s.submitted_at asc nulls last, wr.user_id
      )::int as week_rank
    from public.weekly_results wr
    left join public.pick_submissions s
      on  s.league_id = wr.league_id
      and s.user_id   = wr.user_id
      and s.week      = wr.week
  ) r;

create or replace view public.league_standings
with (security_invoker = true) as
  select
    r.league_id,
    r.user_id,
    sum(r.points)::integer                       as points,
    sum(r.correct)::integer                      as correct,
    sum(r.incorrect)::integer                    as incorrect,
    sum(r.picks_made)::integer                   as picks_made,
    count(*) filter (where r.week_won)::integer  as weekly_wins,
    case when (sum(r.correct) + sum(r.incorrect)) > 0
         then round(sum(r.correct)::numeric / (sum(r.correct) + sum(r.incorrect))::numeric, 4)
         else null::numeric end                  as win_pct
  from public.weekly_results_ranked r
  group by r.league_id, r.user_id;

-- Unchanged except for the seeding query, which now reads week_won from the
-- view instead of re-ranking picks with its own untied rank().
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
             count(*) filter (where wrr.week_won)  as weekly_wins,
             coalesce(sum(wrr.points), 0)          as points
        from public.league_members m
        left join public.weekly_results_ranked wrr
               on  wrr.league_id = m.league_id
               and wrr.user_id   = m.user_id
               and wrr.week between l.start_week and l.regular_season_end_week
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
