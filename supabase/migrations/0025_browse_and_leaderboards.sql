-- An open front door: leagues that choose to be listed, and the standings that
-- give a stranger a reason to walk through it.
--
-- Listing is opt-in. leagues.is_public has existed since the first schema and
-- the row policy already reads "is_public or is_league_member(id)" — it was
-- simply never set or shown. Everything below honours it, so a private league
-- stays invisible: not in the browse list, and not in the league standings.
--
-- The player boards are different. They aggregate points across every league a
-- person plays in, private ones included, but publish only a display name and
-- a number. No league is named, so a private league's existence is never
-- disclosed by someone in it doing well.

create or replace function public.browse_leagues(
  p_season integer,
  p_scope  text default null,
  p_search text default null
)
returns table (
  id             uuid,
  name           text,
  slug           text,
  description    text,
  scope          public.league_scope,
  conference     text,
  member_count   integer,
  already_member boolean
)
language sql stable security definer
set search_path = public as $fn$
  select l.id,
         l.name,
         l.slug,
         l.description,
         l.scope,
         c.name,
         (select count(*)::int from public.league_members m where m.league_id = l.id),
         exists (select 1 from public.league_members m
                  where m.league_id = l.id and m.user_id = auth.uid())
    from public.leagues l
    left join public.conferences c on c.id = l.conference_id
   where l.is_public
     and l.season = p_season
     and (p_scope is null or p_scope = 'all' or l.scope::text = p_scope)
     and (
       nullif(trim(coalesce(p_search, '')), '') is null
       or l.name ilike '%' || trim(p_search) || '%'
       or c.name ilike '%' || trim(p_search) || '%'
     )
   order by (select count(*) from public.league_members m where m.league_id = l.id) desc,
            l.created_at
   limit 60;
$fn$;

/* Joining something listed openly needs no invite code — the listing is the
   invitation. The membership triggers still apply, so the per-account cap and
   the 24-member ceiling hold exactly as they do for an invite. */
create or replace function public.join_public_league(p_league_id uuid)
returns public.leagues
language plpgsql security definer
set search_path = public as $fn$
declare
  v_league public.leagues;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then raise exception 'You must be signed in to join a league.'; end if;

  select * into v_league from public.leagues where id = p_league_id and is_public;
  if not found then raise exception 'That league is not open to join.'; end if;

  insert into public.profiles (id, email, display_name)
  select v_uid, u.email, public.normalize_username(split_part(u.email, '@', 1))
    from auth.users u
   where u.id = v_uid
     and not exists (select 1 from public.profiles p where p.id = v_uid);

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_uid, 'member')
  on conflict (league_id, user_id) do nothing;

  return v_league;
end $fn$;

-- The most recent week anyone has actually been scored on, so the week board
-- does not have to be told which week is interesting.
create or replace function public.latest_scored_week(p_season integer)
returns integer
language sql stable security definer
set search_path = public as $fn$
  select max(p.week)
    from public.picks p
    join public.games g on g.id = p.game_id
   where g.season = p_season and p.is_correct is not null;
$fn$;

create or replace function public.leaderboard_week(
  p_season integer,
  p_week   integer default null,
  p_limit  integer default 10
)
returns table (display_name text, points integer, correct integer, week integer)
language sql stable security definer
set search_path = public as $fn$
  with wk as (select coalesce(p_week, public.latest_scored_week(p_season)) as w)
  select pr.display_name,
         coalesce(sum(p.points), 0)::int,
         count(*) filter (where p.is_correct)::int,
         (select w from wk)
    from public.picks p
    join public.games g   on g.id = p.game_id
    join public.profiles pr on pr.id = p.user_id
   where g.season = p_season
     and p.week = (select w from wk)
     and p.is_correct is not null
   group by pr.display_name
   order by 2 desc, 3 desc, pr.display_name
   limit greatest(p_limit, 1);
$fn$;

create or replace function public.leaderboard_players(p_season integer, p_limit integer default 10)
returns table (display_name text, points integer, correct integer, leagues integer)
language sql stable security definer
set search_path = public as $fn$
  select pr.display_name,
         coalesce(sum(p.points), 0)::int,
         count(*) filter (where p.is_correct)::int,
         count(distinct p.league_id)::int
    from public.picks p
    join public.games g    on g.id = p.game_id
    join public.profiles pr on pr.id = p.user_id
   where g.season = p_season
     and p.is_correct is not null
   group by pr.display_name
   order by 2 desc, 3 desc, pr.display_name
   limit greatest(p_limit, 1);
$fn$;

-- Public leagues only: naming a private league here would leak it to everyone.
create or replace function public.leaderboard_leagues(p_season integer, p_limit integer default 5)
returns table (
  name         text,
  slug         text,
  scope        public.league_scope,
  points       integer,
  member_count integer
)
language sql stable security definer
set search_path = public as $fn$
  select l.name,
         l.slug,
         l.scope,
         coalesce(sum(p.points), 0)::int,
         (select count(*)::int from public.league_members m where m.league_id = l.id)
    from public.leagues l
    left join public.picks p on p.league_id = l.id
   where l.is_public and l.season = p_season
   group by l.id, l.name, l.slug, l.scope
   order by 4 desc, 5 desc, l.name
   limit greatest(p_limit, 1);
$fn$;

revoke execute on function public.browse_leagues(integer, text, text)      from public, anon;
revoke execute on function public.join_public_league(uuid)                 from public, anon;
revoke execute on function public.latest_scored_week(integer)              from public, anon;
revoke execute on function public.leaderboard_week(integer, integer, integer)    from public, anon;
revoke execute on function public.leaderboard_players(integer, integer)    from public, anon;
revoke execute on function public.leaderboard_leagues(integer, integer)    from public, anon;

grant execute on function public.browse_leagues(integer, text, text)       to authenticated;
grant execute on function public.join_public_league(uuid)                  to authenticated;
grant execute on function public.latest_scored_week(integer)               to authenticated;
grant execute on function public.leaderboard_week(integer, integer, integer)     to authenticated;
grant execute on function public.leaderboard_players(integer, integer)     to authenticated;
grant execute on function public.leaderboard_leagues(integer, integer)     to authenticated;

-- Browsing filters and orders on this constantly.
create index if not exists leagues_public_season_idx
  on public.leagues (season, scope) where is_public;
