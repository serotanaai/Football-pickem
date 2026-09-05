-- ---------------------------------------------------------------------------
-- Demo leagues
--
-- An empty Join page is the reason someone bounces, so the app launches with
-- leagues already on it. This builds 18 public leagues across all three slates,
-- 85 accounts to fill them to 50-67% of the 24-member ceiling, and a random
-- week-1 card for every member.
--
-- Everything here is identifiable and reversible. Seed accounts carry
-- raw_app_meta_data->>'seed' = 'true' and an @seed.pickemweekly.com address,
-- and teardown_demo.sql removes the lot in one statement.
--
-- The picks are random but the scores are not: grade_picks() reads the real
-- results off the real games, so nothing here invents an outcome.
--
-- Run against the project database (psql, or Supabase's SQL editor).
-- ---------------------------------------------------------------------------

-- 1. Accounts ---------------------------------------------------------------
--
-- The insert goes into auth.users rather than profiles, because profiles.id
-- references it and the on_auth_user_created trigger is what builds the
-- profile — running the app's own username rules over each name on the way.

with candidates(n) as (values
 ('boomer_sooner'),('roll_tide_ryan'),('hokie_hank'),('buckeye_brian'),('dawg_pound_dan'),
 ('gator_gabe'),('vol_navy_vic'),('bayou_bengal'),('big_blue_ben'),('sparty_sam'),
 ('wolverine_wes'),('husker_hal'),('jayhawk_jay'),('cyclone_cy'),('horned_frog_hal'),
 ('red_raider_rob'),('sooner_sue'),('longhorn_luke'),('aggie_ace'),('razorback_ray'),
 ('tide_tyler'),('hail_state_hal'),('rebel_rick'),('war_eagle_will'),('commodore_cal'),
 ('spurs_up_gus'),('tiger_walk_ty'),('palmetto_pete'),('seminole_sean'),('hurricane_hugo'),
 ('cavalier_cody'),('tar_heel_theo'),('wolfpack_walt'),('blue_devil_bo'),('deacon_drew'),
 ('cardinal_carl'),('panther_pat'),('orange_owen'),('eagle_eddie'),('terrapin_tim'),
 ('nittany_nate'),('badger_bill'),('hawkeye_hank'),('gopher_greg'),('boiler_bo'),
 ('hoosier_hugh'),('illini_ian'),('knight_kevin'),('duck_dylan'),('beaver_bret'),
 ('husky_hutch'),('coug_cole'),('bruin_brad'),('trojan_troy'),('sun_devil_sid'),
 ('wildcat_wade'),('buffalo_bo'),('ute_ulysses'),('ram_randy'),('falcon_finn'),
 ('bronco_bryce'),('rebel_reno'),('aztec_alex'),('lobo_leo'),('zip_zack'),
 ('rocket_ronnie'),('bearcat_bart'),('shocker_shane'),('mustang_mack'),('owl_oscar'),
 ('miner_mitch'),('roadrunner_rob'),('bull_bennett'),('knights_nolan'),('memphis_marcus'),
 ('tulane_tucker'),('app_state_andy'),('coastal_chase'),('herd_harlan'),('blazer_blake'),
 ('saturday_sal'),('gameday_gina'),('kickoff_kate'),('tailgate_tess'),('bowl_week_bo')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  n || '@seed.pickemweekly.com',
  -- Not a bcrypt hash, so no password can ever verify against it: these
  -- accounts exist to populate leagues, not to be signed into.
  'SEED-ACCOUNT-NO-LOGIN',
  now() - interval '10 days', now() - interval '10 days', now() - interval '10 days',
  jsonb_build_object('provider','email','providers',jsonb_build_array('email'),'seed',true),
  jsonb_build_object('display_name', n, 'seed', true)
from candidates;


-- 2. Leagues ----------------------------------------------------------------
--
-- create_league() reads auth.uid(), which is null outside a request, so the
-- insert is written out here instead. All of them are public: a league nobody
-- can find is not seed data, it is clutter.

with spec(ord, name, scope, conf, descr, owner) as (values
 (1,'SEC Saturdays','conference',8,'Every SEC game, every week.','roll_tide_ryan'),
 (2,'Big Ten Bragging Rights','conference',5,'Winner picks the tailgate spot.','buckeye_brian'),
 (3,'Big 12 Backyard','conference',4,'Wide open conference, wide open league.','longhorn_luke'),
 (4,'ACC After Dark','conference',1,'Late kicks and bad decisions.','seminole_sean'),
 (5,'Pac-12 Late Night','conference',9,'West coast games nobody else stays up for.','duck_dylan'),
 (6,'Sun Belt Slate','conference',37,'The best value in college football.','app_state_andy'),
 (7,'MAC Action','conference',15,'Weeknight football is real football.','rocket_ronnie'),
 (8,'Mountain West Weekly','conference',17,'Altitude and upsets.','bronco_bryce'),
 (9,'American Weekly','conference',151,'Every American game on the board.','bearcat_bart'),
 (10,'Top 25 Only','top25',null,'If nobody is ranked, it is not on the board.','aggie_ace'),
 (11,'Ranked Games Club','top25',null,'Just the games that move the poll.','gameday_gina'),
 (12,'Poll Watchers','top25',null,'We argue about the AP poll all week.','kickoff_kate'),
 (13,'Saturday Top 25','top25',null,'Ranked matchups, nothing else.','commodore_cal'),
 (14,'Chaos Watch','top25',null,'Here for the upsets.','wildcat_wade'),
 (15,'Full Slate Saturdays','all_fbs',null,'A fresh mix of FBS games every week.','saturday_sal'),
 (16,'Coast to Coast','all_fbs',null,'Noon kicks to west coast finishes.','tailgate_tess'),
 (17,'Tailgate League','all_fbs',null,'Loser buys wings.','bowl_week_bo'),
 (18,'Kickoff Club','all_fbs',null,'New every week, no repeats if we can help it.','husky_hutch')
), made as (
  insert into public.leagues (
    name, slug, description, owner_id, season, scope, conference_id,
    max_games_per_week, start_week, regular_season_end_week, playoff_teams,
    invite_code, is_public, created_at)
  select s.name,
         public.slugify(s.name),
         s.descr,
         p.id,
         2026,
         s.scope::league_scope,
         s.conf,
         case when s.scope = 'all_fbs' then 8 + (s.ord % 5) else 10 end,
         1, 12, 4,
         upper(substr(md5('seed-league-' || s.ord::text), 1, 8)),
         true,
         now() - ((20 - s.ord) || ' days')::interval
    from spec s
    join public.profiles p on p.display_name = s.owner
  returning id, owner_id
)
insert into public.league_members (league_id, user_id, role, joined_at)
select id, owner_id, 'commissioner', now() - interval '9 days' from made;


-- 3. Members ----------------------------------------------------------------
--
-- 12 to 16 of the 24 places, varied per league. The five-league cap is the
-- app's own rule and the seed lives under it rather than switching it off, so
-- who is eligible is re-checked on every insert.

do $seed$
declare
  lg record; usr record; target int; have int;
begin
  for lg in
    select l.id, l.slug, row_number() over (order by l.created_at) as ord
      from public.leagues l
      join public.profiles p on p.id = l.owner_id
     where p.email like '%@seed.pickemweekly.com'
     order by l.created_at
  loop
    target := 12 + ((lg.ord * 7) % 5);
    select count(*) into have from public.league_members where league_id = lg.id;

    for usr in
      select p.id
        from public.profiles p
       where p.email like '%@seed.pickemweekly.com'
         and not exists (
           select 1 from public.league_members m
            where m.league_id = lg.id and m.user_id = p.id)
         and (select count(*) from public.league_members m2
                join public.leagues l2 on l2.id = m2.league_id
               where m2.user_id = p.id and l2.season = 2026) < 5
       order by md5(lg.slug || ':' || p.id::text)
    loop
      exit when have >= target;
      insert into public.league_members (league_id, user_id, role, joined_at)
      values (lg.id, usr.id, 'member', now() - interval '9 days' + (have || ' hours')::interval);
      have := have + 1;
    end loop;
  end loop;
end $seed$;


-- 4. Week 1 boards ----------------------------------------------------------

do $b$
declare lg record; n int;
begin
  for lg in
    select l.id from public.leagues l
    join public.profiles p on p.id = l.owner_id and p.email like '%@seed.pickemweekly.com'
  loop
    n := public.generate_week_board(lg.id, 1, false);
  end loop;
end $b$;


-- 5. Picks ------------------------------------------------------------------
--
-- Week 1 is already under way, so validate_pick would refuse most of these
-- games. What these rows stand in for is picks made before kickoff — which is
-- what their created_at says — so the check is stood down for this insert and
-- put back before the block ends, including on the way out of an error.

do $p$
begin
  alter table public.picks disable trigger picks_validate;

  insert into public.picks (league_id, user_id, week, game_id, team_id, created_at, updated_at)
  select m.league_id, m.user_id, 1, g.id,
         -- A coin flip that is stable per person per game rather than a
         -- different answer on every run.
         case when ('x' || substr(md5(m.user_id::text || ':' || g.id::text), 1, 8))::bit(32)::int % 2 = 0
              then g.home_team_id else g.away_team_id end,
         g.start_time - interval '2 hours',
         g.start_time - interval '2 hours'
    from public.league_members m
    join public.leagues l      on l.id = m.league_id
    join public.profiles owner on owner.id = l.owner_id
                              and owner.email like '%@seed.pickemweekly.com'
    join public.league_weeks lw       on lw.league_id = l.id and lw.week = 1
    join public.league_week_games lwg on lwg.league_week_id = lw.id
    join public.games g               on g.id = lwg.game_id
  on conflict (league_id, user_id, game_id) do nothing;

  alter table public.picks enable trigger picks_validate;
exception when others then
  alter table public.picks enable trigger picks_validate;
  raise;
end $p$;

insert into public.pick_submissions (league_id, user_id, week, pick_count, submitted_at)
select p.league_id, p.user_id, 1, count(*)::int, min(p.created_at)
  from public.picks p
  join public.leagues l      on l.id = p.league_id
  join public.profiles owner on owner.id = l.owner_id
                            and owner.email like '%@seed.pickemweekly.com'
 where p.week = 1
 group by p.league_id, p.user_id
on conflict do nothing;

-- Real results, not invented ones.
select public.grade_picks();
