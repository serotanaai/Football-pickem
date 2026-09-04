-- Row level security. Reference data is world-readable; everything else is
-- scoped to league membership, and picks stay hidden until kickoff.

alter table public.conferences       enable row level security;
alter table public.teams             enable row level security;
alter table public.games             enable row level security;
alter table public.rankings          enable row level security;
alter table public.profiles          enable row level security;
alter table public.leagues           enable row level security;
alter table public.league_members    enable row level security;
alter table public.league_weeks      enable row level security;
alter table public.league_week_games enable row level security;
alter table public.picks             enable row level security;
alter table public.playoff_matchups  enable row level security;

create policy "conferences are public" on public.conferences
  for select to anon, authenticated using (true);
create policy "teams are public" on public.teams
  for select to anon, authenticated using (true);
create policy "games are public" on public.games
  for select to anon, authenticated using (true);
create policy "rankings are public" on public.rankings
  for select to anon, authenticated using (true);

create policy "read profiles in shared leagues" on public.profiles
  for select to authenticated using (public.shares_league_with(id));
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "read leagues you belong to" on public.leagues
  for select to authenticated using (is_public or public.is_league_member(id));
create policy "commissioner updates league" on public.leagues
  for update to authenticated
  using (public.is_league_commissioner(id))
  with check (public.is_league_commissioner(id));
create policy "commissioner deletes league" on public.leagues
  for delete to authenticated using (owner_id = auth.uid());

create policy "read members of your leagues" on public.league_members
  for select to authenticated using (public.is_league_member(league_id));
create policy "commissioner removes members" on public.league_members
  for delete to authenticated
  using (public.is_league_commissioner(league_id) and user_id <> auth.uid());

create policy "read weeks of your leagues" on public.league_weeks
  for select to authenticated using (public.is_league_member(league_id));

create policy "read slates of your leagues" on public.league_week_games
  for select to authenticated using (
    exists (select 1 from public.league_weeks lw
             where lw.id = league_week_id and public.is_league_member(lw.league_id)));

create policy "read own picks and revealed picks" on public.picks
  for select to authenticated using (
    user_id = auth.uid()
    or (public.is_league_member(league_id)
        and exists (select 1 from public.games g
                     where g.id = game_id and g.start_time <= now())));
create policy "insert own picks" on public.picks
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_league_member(league_id));
create policy "update own picks" on public.picks
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "delete own picks" on public.picks
  for delete to authenticated using (user_id = auth.uid());

create policy "read playoff bracket of your leagues" on public.playoff_matchups
  for select to authenticated using (public.is_league_member(league_id));

-- Postgres grants EXECUTE to PUBLIC by default; strip that and re-grant deliberately.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.create_league(text, integer, public.league_scope, integer, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.join_league_by_code(text)                                   to authenticated;
grant execute on function public.league_preview_by_code(text)                                to authenticated;
grant execute on function public.regenerate_invite_code(uuid)                                to authenticated;
grant execute on function public.leave_league(uuid)                                          to authenticated;
grant execute on function public.generate_week_board(uuid, integer, boolean)                 to authenticated;
grant execute on function public.set_week_scope(uuid, integer, public.league_scope, integer) to authenticated;
grant execute on function public.seed_playoffs(uuid)                                         to authenticated;

-- Required by the policies above, which are evaluated as the calling role. Each
-- only reports on the caller's own membership.
grant execute on function public.is_league_member(uuid)        to authenticated;
grant execute on function public.is_league_commissioner(uuid)  to authenticated;
grant execute on function public.shares_league_with(uuid)      to authenticated;

-- grade_picks, advance_playoffs and member_week_points stay service-role only:
-- the sync job runs them after ingesting scores.
