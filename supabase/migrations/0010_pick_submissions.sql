-- Submitting a week is final. One row here closes that member's week, and the
-- pick trigger refuses further writes for it — so the rule holds against a
-- direct API call, not just the interface.

create table public.pick_submissions (
  league_id    uuid    not null references public.leagues (id) on delete cascade,
  user_id      uuid    not null references public.profiles (id) on delete cascade,
  week         integer not null,
  pick_count   integer not null default 0,
  submitted_at timestamptz not null default now(),
  primary key (league_id, user_id, week)
);

alter table public.pick_submissions enable row level security;

-- Members can see who has submitted; that is not the same as seeing what they picked.
create policy "read submissions in your leagues" on public.pick_submissions
  for select to authenticated using (public.is_league_member(league_id));

create index pick_submissions_user_idx on public.pick_submissions (user_id);

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

    if exists (
      select 1 from public.pick_submissions s
       where s.league_id = new.league_id
         and s.user_id   = new.user_id
         and s.week      = g.week
    ) then
      raise exception 'Week % is already submitted — those picks are final.', g.week;
    end if;

    if g.start_time <= now() then
      raise exception 'This game kicked off already — that one is gone.';
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

-- Saving and sealing happen in one transaction, so a half-written week can
-- never end up marked submitted.
create or replace function public.submit_week_picks(
  p_league_id uuid,
  p_week      integer,
  p_picks     jsonb
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'You must be signed in.'; end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'You are not a member of this league.';
  end if;

  if exists (
    select 1 from public.pick_submissions
     where league_id = p_league_id and user_id = v_uid and week = p_week
  ) then
    raise exception 'You already submitted your week % picks.', p_week;
  end if;

  if p_picks is null or jsonb_array_length(p_picks) = 0 then
    raise exception 'Pick at least one game before submitting.';
  end if;

  insert into public.picks (league_id, user_id, week, game_id, team_id)
  select p_league_id, v_uid, p_week,
         (e->>'game_id')::bigint, (e->>'team_id')::int
    from jsonb_array_elements(p_picks) e
  on conflict (league_id, user_id, game_id) do update
    set team_id = excluded.team_id;

  select count(*) into v_count
    from public.picks
   where league_id = p_league_id and user_id = v_uid and week = p_week;

  insert into public.pick_submissions (league_id, user_id, week, pick_count)
  values (p_league_id, v_uid, p_week, v_count);

  return v_count;
end $$;

revoke execute on function public.submit_week_picks(uuid, integer, jsonb) from public, anon;
grant  execute on function public.submit_week_picks(uuid, integer, jsonb) to authenticated;
