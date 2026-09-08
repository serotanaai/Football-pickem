-- ---------------------------------------------------------------------------
-- Two corrections to when the sequence fires. Net of both changes; the live
-- database took them as separate steps.
--
-- 1. "Unsubmitted" is the absence of a submission, not a board short of picks.
--
--    Submission is one shot: the row lands, the picks_validate trigger refuses
--    every further pick for that week, and each game closes at its own kickoff.
--    So somebody who turns up on Saturday submits only what has not started and
--    is FINISHED with fewer picks than the board has games. On live data that is
--    17 of 22 real submissions. Counting games would have chased 77% of the
--    people who had already picked, for picks the database refuses to accept.
--
-- 2. The two messages that are news wait for a civil hour.
--
--    A week's last game kicks off around midnight, so "as soon as it settles"
--    put the results mail at three in the morning — measured, not guessed: every
--    league's week 2 settles between 3:00 and 3:59am ET. Results and the preview
--    now go out between 8am and 8pm Eastern.
--
--    The last call does not wait, and must not: a board that locks at 8am has to
--    be able to say so at 3am. And the reminder now sits at least twelve hours
--    behind the preview — a week that locks on a Tuesday puts lock-minus-48h
--    behind the preview entirely, and the two would otherwise arrive within the
--    hour and read as a double send.
-- ---------------------------------------------------------------------------

create or replace function public.due_emails(
  p_now   timestamptz default now(),
  p_limit integer     default 500
)
returns table (
  kind         public.email_kind,
  user_id      uuid,
  email        text,
  display_name text,
  league_id    uuid,
  league_name  text,
  league_slug  text,
  week         integer,
  lock_at      timestamptz
)
language sql
stable
as $fn$
  with
  const as (
    select interval '72 hours' as results_window,
           interval '36 hours' as preview_delay,
           interval '48 hours' as reminder_before_lock,
           interval '5 hours'  as last_call_before_lock,
           interval '12 hours' as preview_to_reminder_gap
  ),
  civil as (
    select extract(hour from (p_now at time zone 'America/New_York')) between 8 and 20 as ok
  ),
  recipient as (
    select m.league_id,
           m.user_id,
           p.email,
           coalesce(p.display_name, split_part(p.email, '@', 1)) as display_name
      from public.league_members m
      join public.profiles p  on p.id = m.user_id
      join auth.users u       on u.id = m.user_id
     where p.email is not null
       and p.email_opt_out = false
       and u.email_confirmed_at is not null
       and coalesce(u.raw_app_meta_data ->> 'seed', '') <> 'true'
  ),
  board as (
    select lw.id,
           lw.league_id,
           lw.week,
           lw.lock_at,
           lw.game_count,
           max(g.start_time) as last_kickoff,
           bool_and(g.completed or g.status = 'canceled') as settled
      from public.league_weeks lw
      join public.league_week_games lwg on lwg.league_week_id = lw.id
      join public.games g               on g.id = lwg.game_id
     group by lw.id, lw.league_id, lw.week, lw.lock_at, lw.game_count
    having count(*) > 0
  ),
  results_due as (
    select 'results'::public.email_kind as kind, r.user_id, b.league_id, b.week, b.lock_at
      from board b
      cross join const c
      cross join civil
      join recipient r on r.league_id = b.league_id
     where b.settled
       and b.last_kickoff > p_now - c.results_window
       and civil.ok
  ),
  upcoming as (
    select distinct on (b.league_id)
           b.league_id, b.week, b.lock_at, b.game_count
      from board b
     where b.lock_at > p_now
     order by b.league_id, b.lock_at
  ),
  preview_due as (
    select 'preview'::public.email_kind as kind, r.user_id, u.league_id, u.week, u.lock_at
      from upcoming u
      cross join const c
      cross join civil
      join recipient r on r.league_id = u.league_id
     where civil.ok
       and p_now >= coalesce(
             (select max(e.sent_at) + c.preview_delay
                from public.email_log e
               where e.league_id = u.league_id
                 and e.kind = 'results'
                 and e.week < u.week),
             u.lock_at - interval '5 days')
  ),
  unfilled as (
    select u.league_id, u.week, u.lock_at, r.user_id
      from upcoming u
      join recipient r on r.league_id = u.league_id
     where not exists (
       select 1 from public.pick_submissions s
        where s.league_id = u.league_id
          and s.user_id   = r.user_id
          and s.week      = u.week)
  ),
  reminder_due as (
    select 'reminder'::public.email_kind as kind, f.user_id, f.league_id, f.week, f.lock_at
      from unfilled f
      cross join const c
      cross join civil
     where civil.ok
       and p_now >= f.lock_at - c.reminder_before_lock
       and exists (select 1
                     from public.email_log e
                    where e.user_id   = f.user_id
                      and e.league_id = f.league_id
                      and e.week      = f.week
                      and e.kind      = 'preview'
                      and e.sent_at   <= p_now - c.preview_to_reminder_gap)
       and p_now < f.lock_at - c.last_call_before_lock
  ),
  last_call_due as (
    select 'last_call'::public.email_kind as kind, f.user_id, f.league_id, f.week, f.lock_at
      from unfilled f
      cross join const c
     where p_now >= f.lock_at - c.last_call_before_lock
  ),
  candidate as (
    select * from results_due
    union all select * from preview_due
    union all select * from reminder_due
    union all select * from last_call_due
  )
  select cand.kind,
         cand.user_id,
         r.email,
         r.display_name,
         cand.league_id,
         l.name as league_name,
         l.slug as league_slug,
         cand.week,
         cand.lock_at
    from candidate cand
    join public.leagues l  on l.id = cand.league_id
    join recipient r       on r.league_id = cand.league_id and r.user_id = cand.user_id
   where not exists (select 1
                       from public.email_log e
                      where e.user_id   = cand.user_id
                        and e.league_id = cand.league_id
                        and e.week      = cand.week
                        and e.kind      = cand.kind)
   order by cand.lock_at
   limit p_limit;
$fn$;

revoke all on function public.due_emails(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.due_emails(timestamptz, integer) to service_role;
