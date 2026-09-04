-- Helpers, profile bootstrapping, pick validation, and league RPCs.

create or replace function public.slugify(t text)
returns text language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(
    nullif(trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g')), ''),
    'league');
$$;

create or replace function public.gen_invite_code()
returns text language plpgsql volatile set search_path = pg_catalog, public as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result   text := '';
  i        int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end $$;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.league_members
     where league_id = p_league_id and user_id = auth.uid());
$$;

create or replace function public.is_league_commissioner(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.league_members
     where league_id = p_league_id and user_id = auth.uid() and role = 'commissioner');
$$;

create or replace function public.shares_league_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user = auth.uid() or exists (
    select 1 from public.league_members a
      join public.league_members b on b.league_id = a.league_id
     where a.user_id = auth.uid() and b.user_id = p_user);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A pick is only accepted before kickoff, for a game actually on the league's slate.
-- Re-checked only when the pick itself changes, so score grading can still write to the row.
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
      raise exception 'Picks for this game locked at kickoff.';
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

drop trigger if exists picks_validate on public.picks;
create trigger picks_validate
  before insert or update on public.picks
  for each row execute function public.validate_pick();

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

create or replace function public.join_league_by_code(p_code text)
returns public.leagues
language plpgsql security definer set search_path = public as $$
declare
  v_league public.leagues;
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then raise exception 'You must be signed in to join a league.'; end if;

  select * into v_league from public.leagues
   where upper(invite_code) = upper(trim(p_code));
  if not found then raise exception 'That invite link is not valid.'; end if;

  insert into public.profiles (id, email)
  select v_uid, u.email from auth.users u where u.id = v_uid
  on conflict (id) do nothing;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_uid, 'member')
  on conflict (league_id, user_id) do nothing;

  return v_league;
end $$;

create or replace function public.league_preview_by_code(p_code text)
returns table (
  league_id       uuid,
  name            text,
  slug            text,
  description     text,
  season          integer,
  scope           public.league_scope,
  conference_name text,
  member_count    bigint,
  already_member  boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.name, l.slug, l.description, l.season, l.scope, c.name,
         (select count(*) from public.league_members m where m.league_id = l.id),
         exists (select 1 from public.league_members m
                  where m.league_id = l.id and m.user_id = auth.uid())
    from public.leagues l
    left join public.conferences c on c.id = l.conference_id
   where upper(l.invite_code) = upper(trim(p_code));
$$;

create or replace function public.regenerate_invite_code(p_league_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can reset the invite link.';
  end if;
  loop
    v_code := public.gen_invite_code();
    exit when not exists (select 1 from public.leagues where invite_code = v_code);
  end loop;
  update public.leagues set invite_code = v_code where id = p_league_id;
  return v_code;
end $$;

create or replace function public.leave_league(p_league_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.is_league_commissioner(p_league_id) then
    raise exception 'The commissioner cannot leave their own league.';
  end if;
  delete from public.league_members where league_id = p_league_id and user_id = auth.uid();
end $$;
