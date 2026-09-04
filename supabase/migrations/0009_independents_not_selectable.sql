-- FBS Independents stays a real conference — Notre Dame and UConn must still
-- count as FBS, and their games still belong on an all-FBS or top-25 board —
-- but a league cannot scope itself to it: real 2026 data has it at 1-2 games
-- a week, all season.

alter table public.conferences
  add column if not exists selectable boolean not null default true;

update public.conferences set selectable = false where id = 18;

-- create_league rejects an unselectable conference, so the rule holds even if
-- the request does not come from the app's own picker.
create or replace function public.create_league(
  p_name           text,
  p_season         integer,
  p_scope          public.league_scope,
  p_conference_id  integer default null,
  p_max_games      integer default 12,
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
    p_max_games, p_start_week, p_end_week, p_playoff_teams, v_code)
  returning * into v_league;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_uid, 'commissioner');

  return v_league;
end $$;

revoke execute on function public.create_league(text, integer, public.league_scope, integer, integer, integer, integer, integer, text) from public, anon;
grant  execute on function public.create_league(text, integer, public.league_scope, integer, integer, integer, integer, integer, text) to authenticated;
