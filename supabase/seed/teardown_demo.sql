-- Remove everything demo_leagues.sql created.
--
-- One delete does it: profiles.id references auth.users on delete cascade, and
-- leagues, memberships, picks and submissions all cascade from there.
--
-- Careful in one respect — a seeded league is owned by a seed account, so
-- dropping the accounts drops those leagues too, and with them any real
-- person's membership and picks inside one. Check before running:
--
--   select l.name, count(*) filter (where pr.email not like '%@seed.pickemweekly.com')
--     from public.leagues l
--     join public.league_members m on m.league_id = l.id
--     join public.profiles pr on pr.id = m.user_id
--     join public.profiles o on o.id = l.owner_id
--    where o.email like '%@seed.pickemweekly.com'
--    group by l.name having count(*) filter (where pr.email not like '%@seed.pickemweekly.com') > 0;
--
-- Anything that comes back is a real player who would lose a league.

delete from auth.users where raw_app_meta_data ->> 'seed' = 'true';
