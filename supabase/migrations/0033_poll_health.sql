-- ---------------------------------------------------------------------------
-- Somewhere to read whether the poll pipeline is alive.
--
-- The boards now wait on the AP Top 25, which makes a third-party fetch load
-- bearing. That fetch has already failed silently for a whole season once, and
-- the only reason anybody found out is that somebody went looking. A dependency
-- the product waits on should not need an investigation to check.
--
-- So each run writes down what happened, and one view answers the question a
-- person actually has on a Sunday afternoon: is the poll in yet, and if not, is
-- that because it has not been published or because we cannot fetch it?
-- ---------------------------------------------------------------------------

create table if not exists public.sync_health (
  kind     text primary key,
  ran_at   timestamptz not null default now(),
  ok       boolean not null,
  detail   jsonb
);

comment on table public.sync_health is
  'Last outcome per background job. One row per kind, overwritten each run.';

alter table public.sync_health enable row level security;
-- No policies: the service role writes it, and it is read with a direct query
-- rather than by the app. Nothing here belongs to a member.


-- The Sunday-afternoon question, as one row.
create or replace view public.poll_status
with (security_invoker = true) as
  select
    (select ran_at from public.sync_health where kind = 'rankings')        as last_run_at,
    (select ok     from public.sync_health where kind = 'rankings')        as last_run_ok,
    (select detail from public.sync_health where kind = 'rankings')        as last_run_detail,
    -- Whether the gate is armed at all. False means every week is open
    -- regardless, because a pipeline that has never delivered is not one to
    -- hold a season on.
    public.ap_poll_ever_seen(d.season)                                     as pipeline_proven,
    d.season,
    (select array_agg(distinct r.week order by r.week)
       from public.rankings r
      where r.season = d.season and r.poll = 'ap')                         as weeks_with_ap_poll
  from (select max(season) as season from public.games) d;

comment on view public.poll_status is
  'Is the AP poll in, and if not, is that AP or us? Read this before debugging a held week.';

grant select on public.poll_status to service_role;
