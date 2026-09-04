-- Three rule changes:
--   1. A week locks as a whole at its first kickoff, not game by game.
--   2. A league follows one slate all season; per-week overrides are gone.
--   3. A top-25 slate keeps a ranked team's game even against an FCS opponent.

create or replace function public.validate_pick()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g      record;
  v_lock timestamptz;
  ok     boolean;
begin
  if tg_op = 'INSERT'
     or new.game_id is distinct from old.game_id
     or new.team_id is distinct from old.team_id then

    select * into g from public.games where id = new.game_id;
    if not found then
      raise exception 'Unknown game.';
    end if;
    if new.team_id not in (g.home_team_id, g.away_team_id) then
      raise exception 'That team is not playing in this game.';
    end if;

    new.week := g.week;

    select lw.lock_at into v_lock
      from public.league_weeks lw
     where lw.league_id = new.league_id and lw.week = g.week;

    if v_lock is not null then
      if now() >= v_lock then
        raise exception 'Week % locked when its first game kicked off.', g.week;
      end if;
    elsif g.start_time <= now() then
      -- No slate built yet; fall back to the game's own kickoff.
      raise exception 'That game has already kicked off.';
    end if;

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

-- Every pick locks at the same moment, so they all reveal at that moment too.
drop policy "read own picks and revealed picks" on public.picks;
create policy "read own picks and revealed picks" on public.picks
  for select to authenticated using (
    user_id = (select auth.uid())
    or (public.is_league_member(league_id)
        and exists (
          select 1 from public.league_weeks lw
           where lw.league_id = picks.league_id
             and lw.week      = picks.week
             and lw.lock_at is not null
             and lw.lock_at <= now())));

drop function if exists public.set_week_scope(uuid, integer, public.league_scope, integer);

-- The slate can still be corrected before anyone has picked, never after.
create or replace function public.freeze_league_slate()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.scope         is distinct from old.scope
   or new.conference_id is distinct from old.conference_id
   or new.season        is distinct from old.season)
   and exists (select 1 from public.picks where league_id = old.id) then
    raise exception
      'This league is already under way — its slate and season are locked in.';
  end if;
  return new;
end $$;

drop trigger if exists leagues_freeze_slate on public.leagues;
create trigger leagues_freeze_slate
  before update on public.leagues
  for each row execute function public.freeze_league_slate();

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

  -- The week always follows the league's season-long slate.
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
     and g.status <> 'canceled'
     and not exists (
       select 1 from public.league_week_games x
        where x.league_week_id = w.id and x.game_id = g.id)
     and (
       (w.scope = 'all_fbs' and ht.is_fbs and at.is_fbs)
       -- A ranked team's game counts whoever the opponent is.
       or (w.scope = 'top25'
           and (coalesce(g.home_rank, 99) <= 25 or coalesce(g.away_rank, 99) <= 25))
       or (w.scope = 'conference' and ht.is_fbs and at.is_fbs
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

revoke execute on function public.generate_week_board(uuid, integer, boolean) from public, anon;
grant  execute on function public.generate_week_board(uuid, integer, boolean) to authenticated;
