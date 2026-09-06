-- ---------------------------------------------------------------------------
-- A week has no winner until the week is over.
--
-- week_won was (week_rank = 1 and points > 0) with nothing about whether the
-- week had finished. One game going final was enough to crown whoever was top
-- of a board with a single result on it, and league_standings counted that as a
-- weekly win — so the season standings moved on Saturday lunchtime and moved
-- again all afternoon.
--
-- A week is settled when every game on that league's own board for it has gone
-- final. Canceled games never will, so they do not hold the week open.
-- ---------------------------------------------------------------------------

create or replace view public.league_week_settled
with (security_invoker = true) as
  select lw.league_id,
         lw.week,
         count(*) > 0
           and count(*) filter (
                 where not g.completed and g.status <> 'canceled'
               ) = 0 as settled
    from public.league_weeks lw
    join public.league_week_games lwg on lwg.league_week_id = lw.id
    join public.games g               on g.id = lwg.game_id
   group by lw.league_id, lw.week;

comment on view public.league_week_settled is
  'Whether every game on a league''s board for a week has finished.';


create or replace view public.weekly_results_ranked
with (security_invoker = true) as
  select r.league_id,
         r.week,
         r.user_id,
         r.picks_made,
         r.correct,
         r.incorrect,
         r.points,
         r.week_rank,
         -- Top of the board, on the board at all, and the week actually over.
         (r.week_rank = 1 and r.points > 0 and coalesce(s.settled, false)) as week_won,
         coalesce(s.settled, false) as settled
    from (
      select wr.league_id,
             wr.week,
             wr.user_id,
             wr.picks_made,
             wr.correct,
             wr.incorrect,
             wr.points,
             rank() over (
               partition by wr.league_id, wr.week
               order by wr.points desc, s2.submitted_at, wr.user_id
             )::integer as week_rank
        from public.weekly_results wr
        left join public.pick_submissions s2
               on s2.league_id = wr.league_id
              and s2.user_id   = wr.user_id
              and s2.week      = wr.week
    ) r
    left join public.league_week_settled s
           on s.league_id = r.league_id
          and s.week      = r.week;

grant select on public.league_week_settled to anon, authenticated, service_role;
