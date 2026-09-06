-- ---------------------------------------------------------------------------
-- Matchup of the week.
--
-- One game on each league's board each week is worth two and a half times the
-- rest. Which one is chosen from that league's own board — featuring a game
-- nobody in the league can pick would be pointless — and it is frozen onto the
-- league-week rather than recomputed, because the AP poll moves on Sundays and
-- a 2.5x game that changes after people have picked is how a league ends.
-- ---------------------------------------------------------------------------

alter table public.league_weeks
  add column if not exists featured_game_id bigint references public.games(id) on delete set null;

comment on column public.league_weeks.featured_game_id is
  'The 2.5x game for this league-week. Set once, when the board is built.';


-- How marquee a game is, lowest first.
--
-- A ladder rather than an average. Both teams ranked is the real signal, and
-- within that the WORSE of the two ranks decides — #3 vs #7 is a bigger game
-- than #1 vs #25, which an average gets backwards. Averaging also forces you to
-- invent a number for "unranked", and since both sides are ranked in only one
-- to five games a week, that invented number would be deciding most weeks.
--
-- Below the ranked rungs it falls to who is carrying the game. Most conference
-- boards have no ranked team at all — the MAC and the Mountain West had none in
-- week 2 — so the fallback is not a corner case, it is the common path.
create or replace function public.marquee_rank(
  p_home_rank integer,
  p_away_rank integer,
  p_broadcast text,
  p_start timestamptz
) returns numeric
language sql
immutable
as $fn$
  select case
    when p_home_rank is not null and p_away_rank is not null
      then 1000 + greatest(p_home_rank, p_away_rank) * 100 + least(p_home_rank, p_away_rank)
    when coalesce(p_home_rank, p_away_rank) is not null
      then 100000 + coalesce(p_home_rank, p_away_rank)
    else 1000000
       + case
           when p_broadcast in ('ABC','CBS','NBC','FOX') then 0
           when p_broadcast in ('ESPN','ESPN2','FS1','TNT','USA Net','CW') then 10000
           else 20000
         end
       - least(extract(epoch from p_start)::numeric / 86400, 9000)
  end;
$fn$;


create or replace function public.set_featured_game(p_league_id uuid, p_week integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_week    public.league_weeks;
  v_game_id bigint;
begin
  select * into v_week
    from public.league_weeks
   where league_id = p_league_id and week = p_week;
  if not found then return null; end if;

  -- Already chosen, or somebody has already picked this week: leave it alone.
  -- The multiplier has to be knowable before anyone commits to a card.
  if v_week.featured_game_id is not null then return v_week.featured_game_id; end if;
  if exists (
    select 1 from public.picks
     where league_id = p_league_id and week = p_week
  ) then return null; end if;

  select g.id into v_game_id
    from public.league_week_games lwg
    join public.games g on g.id = lwg.game_id
   where lwg.league_week_id = v_week.id
     and g.status <> 'canceled'
   order by public.marquee_rank(g.home_rank, g.away_rank, g.broadcast, g.start_time), g.id
   limit 1;

  update public.league_weeks
     set featured_game_id = v_game_id
   where id = v_week.id;

  return v_game_id;
end $fn$;

revoke all on function public.set_featured_game(uuid, integer) from public, anon;
grant execute on function public.set_featured_game(uuid, integer) to authenticated, service_role;


-- Chosen the moment a board exists, rather than by editing generate_week_board:
-- a statement trigger on the slate keeps the choice next to the thing it
-- depends on, and picks it up whoever builds the board.
create or replace function public.feature_new_board()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.set_featured_game(lw.league_id, lw.week)
     from (select distinct league_week_id from new_rows) n
     join public.league_weeks lw on lw.id = n.league_week_id;
  return null;
end $fn$;

drop trigger if exists league_week_games_feature on public.league_week_games;
create trigger league_week_games_feature
after insert on public.league_week_games
referencing new table as new_rows
for each statement execute function public.feature_new_board();


-- Two and a half times, on the one game.
--
-- Applied at scoring time rather than stored on the pick, so a board rebuilt
-- before kickoff re-scores correctly and nothing has to be migrated when the
-- number changes.
create or replace function public.grade_picks()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  n integer;
begin
  update public.picks p
     set is_correct = (p.team_id = g.winner_team_id),
         points = case
           when p.team_id = g.winner_team_id then
             case when exists (
               select 1 from public.league_weeks lw
                where lw.league_id = p.league_id
                  and lw.week = p.week
                  and lw.featured_game_id = p.game_id
             ) then 250 else 100 end
           else 0
         end,
         updated_at = now()
    from public.games g
   where g.id = p.game_id
     and g.completed
     and g.winner_team_id is not null
     and (
       p.is_correct is distinct from (p.team_id = g.winner_team_id)
       or p.points is distinct from (
         case
           when p.team_id = g.winner_team_id then
             case when exists (
               select 1 from public.league_weeks lw
                where lw.league_id = p.league_id
                  and lw.week = p.week
                  and lw.featured_game_id = p.game_id
             ) then 250 else 100 end
           else 0
         end
       )
     );
  get diagnostics n = row_count;
  return n;
end $fn$;
