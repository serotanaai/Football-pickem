-- Wrapping auth.uid() in a scalar subquery makes Postgres evaluate it once per
-- statement instead of once per row.

drop policy "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy "commissioner deletes league" on public.leagues;
create policy "commissioner deletes league" on public.leagues
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy "commissioner removes members" on public.league_members;
create policy "commissioner removes members" on public.league_members
  for delete to authenticated
  using (public.is_league_commissioner(league_id) and user_id <> (select auth.uid()));

drop policy "read own picks and revealed picks" on public.picks;
create policy "read own picks and revealed picks" on public.picks
  for select to authenticated using (
    user_id = (select auth.uid())
    or (public.is_league_member(league_id)
        and exists (select 1 from public.games g
                     where g.id = game_id and g.start_time <= now())));

drop policy "insert own picks" on public.picks;
create policy "insert own picks" on public.picks
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_league_member(league_id));

drop policy "update own picks" on public.picks;
create policy "update own picks" on public.picks
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy "delete own picks" on public.picks;
create policy "delete own picks" on public.picks
  for delete to authenticated using (user_id = (select auth.uid()));

-- Covering indexes for the foreign keys the app actually joins and cascades on.
create index if not exists games_home_team_idx         on public.games (home_team_id);
create index if not exists games_away_team_idx         on public.games (away_team_id);
create index if not exists games_winner_team_idx       on public.games (winner_team_id);
create index if not exists league_week_games_game_idx  on public.league_week_games (game_id);
create index if not exists league_weeks_conference_idx on public.league_weeks (conference_id);
create index if not exists leagues_conference_idx      on public.leagues (conference_id);
create index if not exists picks_user_idx              on public.picks (user_id);
create index if not exists picks_team_idx              on public.picks (team_id);
create index if not exists playoff_home_user_idx       on public.playoff_matchups (home_user_id);
create index if not exists playoff_away_user_idx       on public.playoff_matchups (away_user_id);
create index if not exists playoff_winner_user_idx     on public.playoff_matchups (winner_user_id);
create index if not exists rankings_team_idx           on public.rankings (team_id);
