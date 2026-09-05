-- Five leagues per account per season, up from three.
--
-- Raising a cap needs no backfill: every existing membership was legal under
-- the smaller number and stays legal under the larger one. Only the constant
-- moves.
create or replace function public.enforce_league_cap()
returns trigger
language plpgsql
security definer
set search_path = public as $fn$
declare
  v_limit  constant integer := 5;
  v_season integer;
  v_count  integer;
begin
  -- join_league_by_code re-inserts on every visit and leans on ON CONFLICT DO
  -- NOTHING. A BEFORE INSERT trigger fires ahead of that conflict, so without
  -- this a member at the cap would be refused their own league.
  if exists (
    select 1 from public.league_members
     where league_id = new.league_id and user_id = new.user_id
  ) then
    return new;
  end if;

  select season into v_season from public.leagues where id = new.league_id;

  select count(*) into v_count
    from public.league_members m
    join public.leagues l on l.id = m.league_id
   where m.user_id = new.user_id
     and l.season  = v_season;

  if v_count >= v_limit then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'You are in %s leagues for the %s season, which is the limit. Leave one to make room.',
        v_count, v_season);
  end if;

  return new;
end $fn$;
