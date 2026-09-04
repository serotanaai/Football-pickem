-- Twenty-four to a league.
--
-- The ceiling is not the database, it is the scoring. A ten-game week has
-- eleven possible scores and pick'em accuracy clusters high, so the top score
-- is routinely shared; ties break on who submitted earliest, and weekly wins
-- seed the bracket. Past a couple of dozen members that turns the season into
-- a submission-time race rather than a contest about picking well. An eight
-- team bracket also strands most of a large league for the final weeks.
--
-- Enforced on league_members like the per-account cap, so it holds for every
-- path into the table rather than only the two that exist today.

create or replace function public.enforce_league_size()
returns trigger
language plpgsql
security definer
set search_path = public as $$
declare
  v_limit constant integer := 24;
  v_count integer;
begin
  -- join_league_by_code re-inserts on every visit behind ON CONFLICT DO
  -- NOTHING, and a BEFORE INSERT trigger fires ahead of that conflict. Without
  -- this, revisiting your own invite link to a full league would be refused.
  if exists (
    select 1 from public.league_members
     where league_id = new.league_id and user_id = new.user_id
  ) then
    return new;
  end if;

  select count(*) into v_count
    from public.league_members
   where league_id = new.league_id;

  if v_count >= v_limit then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'This league is full: %s of %s members. The commissioner would need to remove someone first.',
        v_count, v_limit);
  end if;

  return new;
end $$;

drop trigger if exists league_members_size on public.league_members;

-- Fires after league_members_cap by name, so a member who is both at their own
-- three-league limit and looking at a full league hears about their own limit
-- first, which is the one they can do something about.
create trigger league_members_size
  before insert on public.league_members
  for each row execute function public.enforce_league_size();

-- The size check counts a league's members on every join.
create index if not exists league_members_league_idx
  on public.league_members (league_id);
