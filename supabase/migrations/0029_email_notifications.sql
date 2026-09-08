-- ---------------------------------------------------------------------------
-- The weekly email sequence, and the ledger that keeps it honest.
--
-- Four messages ride one league-week:
--
--   results    the week's board is finished          always
--   preview    36h later, the next week's matchup    always
--   reminder   lock_at - 48h, if the board is unfilled
--   last_call  lock_at - 5h,  if the board is unfilled
--
-- Everything is anchored to the league's own lock_at, which is the kickoff of
-- the first game on that league's board — so a league whose week opens Thursday
-- night is reminded on Tuesday, and one that opens Saturday is reminded on
-- Thursday, without either being told about the other's schedule.
--
-- Two things this has to get right, because email cannot be recalled:
--
--   1. It must not blast a backlog. Every settled week in the season would
--      otherwise read as "results not sent yet" the first time this runs, and
--      a season of them would go out at once. Results are only due while the
--      week is recent (RESULTS_WINDOW below); anything older has missed its
--      moment and stays unsent forever.
--
--   2. It must not send twice. A cron that times out after the provider
--      accepted the message will run again on the next tick, so the ledger
--      carries a unique key per (person, league, week, kind) and the send is
--      recorded against it. A repeat is a constraint violation rather than a
--      second copy in somebody's inbox.
-- ---------------------------------------------------------------------------


-- Who can be written to at all ----------------------------------------------

alter table public.profiles
  add column if not exists email_opt_out boolean not null default false;

-- The unsubscribe link has to work from an inbox, with no session to read. A
-- per-profile secret in the URL is what stands in for one, so it is a random
-- uuid rather than the profile id: the id appears in plenty of other places,
-- and a link that carries it would let anyone holding one silence anyone else.
alter table public.profiles
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_unsubscribe_token_key
  on public.profiles (unsubscribe_token);

comment on column public.profiles.email_opt_out is
  'Set by the unsubscribe link. Silences the weekly sequence; account mail (confirmation, password reset) is unaffected.';


-- The ledger ----------------------------------------------------------------

do $$
begin
  create type public.email_kind as enum ('results', 'preview', 'reminder', 'last_call');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  league_id   uuid not null references public.leagues (id) on delete cascade,
  week        integer not null,
  kind        public.email_kind not null,
  sent_at     timestamptz not null default now(),
  -- Resend's id for the message, so a delivery complaint can be traced back to
  -- the row that caused it.
  provider_id text,
  constraint email_log_once unique (user_id, league_id, week, kind)
);

comment on table public.email_log is
  'One row per message actually handed to the provider. The unique key is what makes a re-run safe.';

alter table public.email_log enable row level security;
-- Deliberately no policies. Only the service role writes or reads this, and a
-- member has no reason to see when anybody else was written to.

create index if not exists email_log_league_week on public.email_log (league_id, week, kind);


-- What is due right now ------------------------------------------------------

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
  -- How long after a week finishes its results are still worth sending. Also
  -- the guard that stops a first run mailing out the whole season.
  const as (
    select interval '72 hours' as results_window,
           interval '36 hours' as preview_delay,
           interval '48 hours' as reminder_before_lock,
           interval '5 hours'  as last_call_before_lock
  ),

  -- Anyone the sequence may write to: a member, with an address, who confirmed
  -- it and has not opted out.
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
       -- The demo accounts are addressed at a subdomain that accepts no mail.
       -- They outnumber the real members four to one, so writing to them would
       -- hard-bounce most of the first run and take the sending domain's
       -- reputation down with it before a single real message landed.
       and coalesce(u.raw_app_meta_data ->> 'seed', '') <> 'true'
  ),

  -- Each league-week with the shape the schedule needs: when it locks, when its
  -- last game was, and how many games are on it.
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

  -- 1. The week is over.
  results_due as (
    select 'results'::public.email_kind as kind, r.user_id, b.league_id, b.week, b.lock_at
      from board b
      cross join const c
      join recipient r on r.league_id = b.league_id
     where b.settled
       and b.last_kickoff > p_now - c.results_window
  ),

  -- The next board is the one still open, and the only one any of the three
  -- forward-looking messages can be about.
  upcoming as (
    select distinct on (b.league_id)
           b.league_id, b.week, b.lock_at, b.game_count
      from board b
     where b.lock_at > p_now
     order by b.league_id, b.lock_at
  ),

  -- 2. 36h after this league's most recent results went out. A league with no
  --    finished week yet — the season opener — has nothing to count from, so
  --    the preview leans on its own lock instead.
  preview_due as (
    select 'preview'::public.email_kind as kind, r.user_id, u.league_id, u.week, u.lock_at
      from upcoming u
      cross join const c
      join recipient r on r.league_id = u.league_id
     where p_now >= coalesce(
             (select max(e.sent_at) + c.preview_delay
                from public.email_log e
               where e.league_id = u.league_id
                 and e.kind = 'results'
                 and e.week < u.week),
             u.lock_at - interval '5 days')
  ),

  -- 3 and 4. Only for a board the member has not finished filling in. A week
  --    they have already picked is a week the sequence has nothing to say
  --    about, and saying it anyway is how a product teaches people to filter it.
  unfilled as (
    select u.league_id, u.week, u.lock_at, r.user_id
      from upcoming u
      join recipient r on r.league_id = u.league_id
     where coalesce(
             (select s.pick_count
                from public.pick_submissions s
               where s.league_id = u.league_id
                 and s.user_id  = r.user_id
                 and s.week     = u.week),
             0) < u.game_count
  ),

  reminder_due as (
    select 'reminder'::public.email_kind as kind, f.user_id, f.league_id, f.week, f.lock_at
      from unfilled f
      cross join const c
     where p_now >= f.lock_at - c.reminder_before_lock
       -- Never ahead of the preview: a short turnaround between weeks would
       -- otherwise put "you have not picked" in front of somebody before the
       -- matchup it is asking them to pick.
       and exists (select 1
                     from public.email_log e
                    where e.user_id   = f.user_id
                      and e.league_id = f.league_id
                      and e.week      = f.week
                      and e.kind      = 'preview')
       -- And never so late that it is just the last call wearing a different
       -- subject line.
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

comment on function public.due_emails(timestamptz, integer) is
  'Every message the weekly sequence owes right now, already filtered against the ledger. Service role only.';

-- Not a definer function, and not for anybody else to call: it runs under the
-- service role, where RLS is bypassed anyway, and it returns other members''
-- email addresses.
revoke all on function public.due_emails(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.due_emails(timestamptz, integer) to service_role;


-- Silencing the sequence from an inbox ---------------------------------------

create or replace function public.unsubscribe_by_token(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_hit boolean;
begin
  update public.profiles
     set email_opt_out = true
   where unsubscribe_token = p_token
  returning true into v_hit;

  return coalesce(v_hit, false);
end;
$fn$;

comment on function public.unsubscribe_by_token(uuid) is
  'Opt a profile out of the weekly sequence using the secret in its unsubscribe link. Definer because the caller has no session.';

revoke all on function public.unsubscribe_by_token(uuid) from public;
grant execute on function public.unsubscribe_by_token(uuid) to anon, authenticated, service_role;
