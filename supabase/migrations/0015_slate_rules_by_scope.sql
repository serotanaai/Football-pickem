-- Each scope gets the slate it promises, and two all-FBS leagues stop getting
-- the same one.
--
-- The old board took the same ordered slice for everybody — ranked games
-- first, then kickoff, then id — with nothing in it that varied by league. Two
-- all-FBS leagues with the same cap therefore got byte-identical boards every
-- week, which is what made the app feel like one league wearing three hats.
--
-- The cap itself only ever made sense for all-FBS, where the pool is fifty-odd
-- games a week. A conference league wants its conference's games, all of them;
-- a top-25 league wants every game with a ranked team in it. Capping those
-- silently dropped matchups the league was created to follow.

-- 5 is enough of a week to be a contest, 15 is about as much as anyone will
-- fill in on a phone. Existing rows are clamped first so the constraint can be
-- trusted rather than merely declared.
update public.leagues
   set max_games_per_week = least(greatest(max_games_per_week, 5), 15)
 where max_games_per_week not between 5 and 15;

alter table public.leagues
  drop constraint if exists leagues_max_games_per_week_check;

alter table public.leagues
  add constraint leagues_max_games_per_week_check
  check (max_games_per_week between 5 and 15);

alter table public.leagues
  alter column max_games_per_week set default 10;

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

  select count(*) into v_existing
    from public.league_week_games where league_week_id = w.id;

  v_cap := least(greatest(l.max_games_per_week, 5), 15);

  -- How often each team has already turned up on this league's boards. Games
  -- involving teams a league has seen least sort first, so the season spreads
  -- itself around instead of replaying the same eight brands every week.
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
        -- Seeded on the league and the week, so the shuffle differs between
        -- leagues but never reshuffles under a league that has already picked.
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
         -- A ranked team's game counts whoever the opponent is.
         or (w.scope = 'top25'
             and (coalesce(g.home_rank, 99) <= 25 or coalesce(g.away_rank, 99) <= 25))
         -- Likewise a conference team's: the league follows the conference, so
         -- a week where half of it is playing FCS opponents should still show
         -- those teams rather than leave them off the card.
         or (w.scope = 'conference'
             and (ht.conference_id = w.conference_id or at.conference_id = w.conference_id))
       )
    ) c
   order by c.exposure asc, c.shuffle asc, c.start_time asc
   -- Only all-FBS is a selection. The other two are the whole qualifying set,
   -- and LIMIT NULL is Postgres for "all of it".
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
end $$;

-- create_league clamps rather than letting the new constraint reject the
-- insert: a form that somehow posts 40 should get a league with 15, not a
-- Postgres check-violation string in the UI.
create or replace function public.create_league(
  p_name           text,
  p_season         integer,
  p_scope          public.league_scope,
  p_conference_id  integer default null,
  p_max_games      integer default 10,
  p_start_week     integer default 1,
  p_end_week       integer default 12,
  p_playoff_teams  integer default 4,
  p_description    text    default null
) returns public.leagues
language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues;
  v_base   text;
  v_slug   text;
  v_code   text;
  v_uid    uuid := auth.uid();
  i        int  := 0;
begin
  if v_uid is null then raise exception 'You must be signed in to create a league.'; end if;

  if p_scope = 'conference' then
    if not exists (
      select 1 from public.conferences where id = p_conference_id and selectable
    ) then
      raise exception 'That conference cannot be picked for a league.';
    end if;
  end if;

  insert into public.profiles (id, email)
  select v_uid, u.email from auth.users u where u.id = v_uid
  on conflict (id) do nothing;

  v_base := public.slugify(p_name);
  v_slug := v_base;
  loop
    exit when not exists (select 1 from public.leagues where slug = v_slug);
    i := i + 1;
    v_slug := v_base || '-' || i::text;
  end loop;

  loop
    v_code := public.gen_invite_code();
    exit when not exists (select 1 from public.leagues where invite_code = v_code);
  end loop;

  insert into public.leagues (
    name, slug, description, owner_id, season, scope, conference_id,
    max_games_per_week, start_week, regular_season_end_week, playoff_teams, invite_code)
  values (
    trim(p_name), v_slug, nullif(trim(coalesce(p_description, '')), ''), v_uid, p_season, p_scope,
    case when p_scope = 'conference' then p_conference_id end,
    least(greatest(coalesce(p_max_games, 10), 5), 15),
    p_start_week, p_end_week, p_playoff_teams, v_code)
  returning * into v_league;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_uid, 'commissioner');

  return v_league;
end $$;

revoke execute on function public.create_league(text, integer, public.league_scope, integer, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.create_league(text, integer, public.league_scope, integer, integer, integer, integer, integer, text) to authenticated;
