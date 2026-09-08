-- ---------------------------------------------------------------------------
-- due_emails has never once run from the application.
--
-- The function decides who is owed a message, and part of that decision lives
-- in auth.users: an address is only mailable once it is confirmed, and the
-- seed accounts are excluded by a flag that sits in raw_app_meta_data. Both
-- columns are in the auth schema.
--
-- It was written without SECURITY DEFINER, so it runs as whoever calls it.
-- Every check of it up to now went through a privileged console session, where
-- reading auth.users is free, and it looked correct every time. The one caller
-- that matters is the cron route, which arrives as service_role through
-- PostgREST -- and service_role has usage on the auth schema but no select on
-- auth.users. So the real call path has only ever returned:
--
--   due_emails: permission denied for table users
--
-- which runEmailSequence records in summary.errors and turns into an empty
-- run. Nothing raised, nothing retried, nobody mailed. The email system was
-- wired up to a function that could not answer, and would have stayed that way
-- silently for as long as anyone left it alone.
--
-- The function is owned by postgres, which can read auth.users, so running it
-- as its owner is all that is needed. That is safe here for a reason worth
-- stating: execute is already granted to postgres and service_role only --
-- anon and authenticated cannot call it -- so definer rights do not hand a
-- member a way to read the league's email addresses. The grants below restate
-- that rather than widen it, and search_path is pinned so the elevated body
-- cannot be redirected at a shadowed table.
--
-- The body is unchanged from 0034. Only the security clause is new.
-- ---------------------------------------------------------------------------

create or replace function public.due_emails(
  p_now   timestamp with time zone default now(),
  p_limit integer default 500
)
returns table(
  kind        public.email_kind,
  user_id     uuid,
  email       text,
  display_name text,
  league_id   uuid,
  league_name text,
  league_slug text,
  week        integer,
  lock_at     timestamp with time zone
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with
  const as (
    select interval '72 hours' as results_window,
           interval '36 hours' as preview_delay,
           interval '48 hours' as reminder_before_lock,
           interval '5 hours'  as last_call_before_lock,
           -- A week finishes late on Saturday night, so "as soon as it settles"
           -- is three in the morning. The two messages that are news rather
           -- than a deadline wait for a civil hour; the two that are deadlines
           -- do not, because a board that locks at 8am has to be able to say so
           --  at 3am.
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
       -- Behind the preview, and not on its heels. A week that locks on a
       -- Tuesday puts lock-minus-48h behind the preview entirely, and without
       -- this the two would land within the hour and read as a double send.
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
$function$;

comment on function public.due_emails(timestamp with time zone, integer) is
  'Who is owed which message right now. Definer rights: the answer depends on auth.users, which the service role cannot read.';

-- Restate the existing grants. Definer rights make execute the whole story, so
-- it is worth being explicit that members are not on this list.
revoke execute on function public.due_emails(timestamp with time zone, integer) from public;
revoke execute on function public.due_emails(timestamp with time zone, integer) from anon, authenticated;
grant  execute on function public.due_emails(timestamp with time zone, integer) to service_role;
