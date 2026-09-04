-- Three leagues per account per season.
--
-- The cap sits on league_members rather than inside create_league and
-- join_league_by_code, so it holds for every path into the table — including
-- any added later. Creating a league inserts a commissioner row through the
-- same door, so "created or joined" is counted the same way, whichever came
-- first.
--
-- It counts the season being joined, not all time, so a member is not locked
-- out of next season by leagues they played in this one.

create or replace function public.enforce_league_cap()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_limit  constant integer := 3;
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
end $$;

drop trigger if exists league_members_cap on public.league_members;

create trigger league_members_cap
  before insert on public.league_members
  for each row execute function public.enforce_league_cap();

-- The trigger counts a member's leagues on every join; without this it is a
-- sequential scan of every membership in the system.
create index if not exists league_members_user_league_idx
  on public.league_members (user_id, league_id);
