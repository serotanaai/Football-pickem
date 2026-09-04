-- Aggregate pick counts for a week, with no user ids in the result.
--
-- Once you have submitted, seeing the league's split cannot help you: your own
-- picks are already sealed. So the gate is "you submitted this week, or the
-- game has kicked off" — rather than kickoff alone. Individual picks stay
-- governed by the picks policy either way; this only ever returns counts.

create or replace function public.week_consensus(
  p_league_id uuid,
  p_week      integer
) returns table (game_id bigint, team_id integer, picks integer)
language sql stable security definer set search_path = public as $$
  select p.game_id, p.team_id, count(*)::int
    from public.picks p
    join public.games g on g.id = p.game_id
   where p.league_id = p_league_id
     and p.week = p_week
     and public.is_league_member(p_league_id)
     and (
       g.start_time <= now()
       or exists (
         select 1
           from public.pick_submissions s
          where s.league_id = p_league_id
            and s.user_id   = auth.uid()
            and s.week      = p_week
       )
     )
   group by p.game_id, p.team_id;
$$;

revoke execute on function public.week_consensus(uuid, integer) from public, anon;
grant  execute on function public.week_consensus(uuid, integer) to authenticated;
