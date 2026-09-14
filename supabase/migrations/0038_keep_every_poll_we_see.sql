-- ---------------------------------------------------------------------------
-- Keep every poll we are ever shown.
--
-- public.rankings is a working set: one row per season-week-poll-rank, upserted
-- on every sync. That makes it the current answer and nothing else. Twice now
-- that has cost us. Week 2's AP poll was overwritten with the poll published
-- *after* week 2, so what was true while week 2 was being picked is simply
-- gone and cannot be recovered -- ESPN will not serve it again. And a ranked
-- team missing from public.teams is dropped by the foreign key before it is
-- ever stored, so thirty of them vanished without a record.
--
-- This table is the other thing: append-only, no foreign keys, one row per
-- distinct poll we have ever observed. It is not read by the app. It exists so
-- that "what did the AP have for week 4 on the Sunday" has an answer, and so a
-- corrupted working set can be rebuilt from it.
--
-- The digest is over the ordered rank:team list, so the hourly cron re-seeing
-- the same poll writes nothing. A row appears only when the content actually
-- differs -- a new poll, a correction, or us overwriting something we should
-- not have. Each of those is worth a row, and none of them destroys the last.
--
-- The teams travel as jsonb rather than rows on purpose: it keeps the capture
-- atomic, and it keeps the entries the working set has to discard. The raw
-- truth belongs here; the usable subset belongs in public.rankings.
-- ---------------------------------------------------------------------------

create table if not exists public.ranking_history (
  id          bigint generated always as identity primary key,
  season      integer     not null,
  week        integer     not null,
  poll        text        not null,
  /** md5 over 'rank:team_id' in rank order. Equal digest means equal poll. */
  digest      text        not null,
  captured_at timestamptz not null default now(),
  /** [{"rank":1,"team_id":194,"points":1550}, ...] exactly as fetched. */
  teams       jsonb       not null,
  /** How many of those the working set could not keep, and which. */
  skipped     jsonb,
  constraint ranking_history_once unique (season, week, poll, digest)
);

comment on table public.ranking_history is
  'Append-only record of every distinct poll observed. Never upserted, never read by the app, exists so a lost or overwritten poll can be recovered.';
comment on column public.ranking_history.digest is
  'md5 of the ordered rank:team_id list. The hourly re-fetch of an unchanged poll collides here and writes nothing.';

create index if not exists ranking_history_lookup
  on public.ranking_history (season, week, poll, captured_at desc);

alter table public.ranking_history enable row level security;
-- No policies. The service role writes it; a person reads it with a direct
-- query when something has gone wrong. Nothing here belongs to a member.

grant select on public.ranking_history to service_role;


-- Rebuild public.rankings for one season-week-poll from the newest capture.
--
-- The recovery path, written down now rather than reconstructed under pressure
-- on a Sunday. Only restores teams the working set can actually hold, which is
-- what the foreign key demands, and says how many it had to leave behind.
create or replace function public.restore_rankings_from_history(
  p_season integer,
  p_week   integer,
  p_poll   text default 'ap'
)
returns table (restored integer, dropped integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_teams jsonb;
begin
  select h.teams into v_teams
    from public.ranking_history h
   where h.season = p_season and h.week = p_week and h.poll = p_poll
   order by h.captured_at desc
   limit 1;

  if v_teams is null then
    raise exception 'No capture for season % week % poll %.', p_season, p_week, p_poll;
  end if;

  delete from public.rankings r
   where r.season = p_season and r.week = p_week and r.poll = p_poll;

  with candidate as (
    select (e ->> 'rank')::int    as rank,
           (e ->> 'team_id')::int as team_id,
           (e ->> 'points')::int  as points
      from jsonb_array_elements(v_teams) e
  ),
  kept as (
    insert into public.rankings (season, week, poll, rank, team_id, points, updated_at)
    select p_season, p_week, p_poll, c.rank, c.team_id, c.points, now()
      from candidate c
     where exists (select 1 from public.teams t where t.id = c.team_id)
    returning 1
  )
  select (select count(*) from kept)::int,
         (select count(*) from candidate c
           where not exists (select 1 from public.teams t where t.id = c.team_id))::int
    into restored, dropped;

  return next;
end
$fn$;

comment on function public.restore_rankings_from_history(integer, integer, text) is
  'Rebuilds public.rankings for one season-week-poll from its newest capture. Returns rows restored and rows dropped for want of a teams row.';

grant execute on function public.restore_rankings_from_history(integer, integer, text) to service_role;
