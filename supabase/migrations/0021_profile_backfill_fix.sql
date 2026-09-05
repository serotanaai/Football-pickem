-- Repair league creation and joining.
--
-- Both carried a defensive "make sure a profile exists" insert:
--
--   insert into public.profiles (id, email) ... on conflict (id) do nothing;
--
-- which was harmless until display_name became NOT NULL. A NOT NULL constraint
-- is checked while the row is being formed, before ON CONFLICT gets a chance
-- to skip it, so that line started throwing on every call even though the
-- profile it was guarding against was already there. Creating a league and
-- joining by invite link both failed with a not-null violation on a column the
-- caller never mentioned.
--
-- The guard is now a real one: it only inserts when the profile is genuinely
-- missing, and supplies a name when it does. In practice it never fires —
-- handle_new_user has created a profile for every account since the schema was
-- laid down — but a safety net that breaks the path it is protecting is worse
-- than no safety net.

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
language plpgsql security definer set search_path = public as $fn$
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

  insert into public.profiles (id, email, display_name)
  select v_uid, u.email, public.normalize_username(split_part(u.email, '@', 1))
    from auth.users u
   where u.id = v_uid
     and not exists (select 1 from public.profiles p where p.id = v_uid);

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
end $fn$;

revoke execute on function public.create_league(text, integer, public.league_scope, integer, integer, integer, integer, integer, text) from public, anon;
grant  execute on function public.create_league(text, integer, public.league_scope, integer, integer, integer, integer, integer, text) to authenticated;

create or replace function public.join_league_by_code(p_code text)
returns public.leagues
language plpgsql security definer set search_path = public as $fn$
declare
  v_league public.leagues;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then raise exception 'You must be signed in to join a league.'; end if;

  select * into v_league from public.leagues
   where upper(invite_code) = upper(trim(p_code));
  if not found then raise exception 'That invite link is not valid.'; end if;

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

revoke execute on function public.join_league_by_code(text) from public, anon;
grant  execute on function public.join_league_by_code(text) to authenticated;
