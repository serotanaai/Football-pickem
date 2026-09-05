-- Let a commissioner remove someone, and make leaving mean the same thing.
--
-- Deleting the membership row alone leaves a ghost: the standings are built
-- from picks, not from the member list, so someone removed mid-season would
-- keep appearing on the leaderboard with no way to reach them. Removal takes
-- the picks with it.
--
-- That does rewrite the season a little — a week the removed member won is a
-- week somebody else won now — which is the honest consequence of them not
-- having been in the league. It is also why this is refused once the bracket
-- exists: seeds are already drawn from those totals by then, and a seeded
-- player vanishing would leave a matchup pointing at nobody.

create or replace function public.purge_league_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.picks
   where league_id = p_league_id and user_id = p_user_id;
  delete from public.pick_submissions
   where league_id = p_league_id and user_id = p_user_id;
  delete from public.league_members
   where league_id = p_league_id and user_id = p_user_id;
end $fn$;

-- Internal only: the two callers below decide who is allowed to do this.
revoke execute on function public.purge_league_member(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.remove_league_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_role public.member_role;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Only the commissioner can remove a member.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot remove yourself from a league you run.';
  end if;

  select m.role into v_role
    from public.league_members m
   where m.league_id = p_league_id and m.user_id = p_user_id;

  if not found then
    raise exception 'That person is not in this league.';
  end if;

  if v_role = 'commissioner' then
    raise exception 'A commissioner cannot be removed.';
  end if;

  if exists (select 1 from public.playoff_matchups where league_id = p_league_id) then
    raise exception
      'The playoffs have started, so members cannot be removed — the bracket is already seeded.';
  end if;

  perform public.purge_league_member(p_league_id, p_user_id);
end $fn$;

revoke execute on function public.remove_league_member(uuid, uuid) from public, anon;
grant  execute on function public.remove_league_member(uuid, uuid) to authenticated;

-- Leaving now clears the same things, so a league someone left does not keep
-- scoring them.
create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if public.is_league_commissioner(p_league_id) then
    raise exception 'The commissioner cannot leave their own league.';
  end if;
  perform public.purge_league_member(p_league_id, auth.uid());
end $fn$;
