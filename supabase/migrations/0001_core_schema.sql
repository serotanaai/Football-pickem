-- College Football Pick'em — core schema
-- Reference data (conferences, teams, games) is written by the service role only.

create extension if not exists pgcrypto;

create type public.league_scope as enum ('conference', 'all_fbs', 'top25');
create type public.member_role  as enum ('commissioner', 'member');
create type public.game_state   as enum ('scheduled', 'in_progress', 'final', 'postponed', 'canceled');

-- ---------------------------------------------------------------- reference

create table public.conferences (
  id          integer primary key,              -- ESPN group id
  name        text not null,
  short_name  text,
  abbreviation text,
  logo        text
);

create table public.teams (
  id            integer primary key,            -- ESPN team id
  slug          text,
  school        text not null,                  -- "Ohio State"
  mascot        text,                           -- "Buckeyes"
  display_name  text not null,                  -- "Ohio State Buckeyes"
  abbreviation  text,
  color         text,
  alt_color     text,
  logo          text,
  conference_id integer references public.conferences (id) on delete set null,
  is_fbs        boolean not null default true,
  updated_at    timestamptz not null default now()
);
create index teams_conference_idx on public.teams (conference_id);

create table public.games (
  id              bigint primary key,           -- ESPN event id
  season          integer not null,
  week            integer not null,
  season_type     integer not null default 2,   -- 2 = regular season
  start_time      timestamptz not null,
  name            text,
  short_name      text,
  neutral_site    boolean not null default false,
  conference_game boolean not null default false,
  home_team_id    integer not null references public.teams (id),
  away_team_id    integer not null references public.teams (id),
  home_score      integer,
  away_score      integer,
  home_rank       integer,                      -- null when unranked
  away_rank       integer,
  status          public.game_state not null default 'scheduled',
  completed       boolean not null default false,
  winner_team_id  integer references public.teams (id),
  status_detail   text,
  venue           text,
  broadcast       text,
  odds_details    text,
  over_under      numeric,
  updated_at      timestamptz not null default now()
);
create index games_season_week_idx on public.games (season, season_type, week);
create index games_start_time_idx  on public.games (start_time);

create table public.rankings (
  season     integer not null,
  week       integer not null,
  poll       text    not null,                  -- 'ap' | 'cfp' | 'coaches'
  rank       integer not null,
  team_id    integer not null references public.teams (id),
  points     integer,
  updated_at timestamptz not null default now(),
  primary key (season, week, poll, rank)
);

-- --------------------------------------------------------------- user data

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

create table public.leagues (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (char_length(trim(name)) between 3 and 60),
  slug                     text not null unique,
  description              text,
  owner_id                 uuid not null references public.profiles (id) on delete cascade,
  season                   integer not null,
  scope                    public.league_scope not null default 'all_fbs',
  conference_id            integer references public.conferences (id),
  max_games_per_week       integer not null default 12 check (max_games_per_week between 3 and 60),
  start_week               integer not null default 1,
  regular_season_end_week  integer not null default 12,
  playoff_teams            integer not null default 4 check (playoff_teams in (0, 2, 4, 8)),
  invite_code              text not null unique,
  is_public                boolean not null default false,
  created_at               timestamptz not null default now(),
  constraint conference_scope_needs_conference
    check (scope <> 'conference' or conference_id is not null)
);
create index leagues_owner_idx on public.leagues (owner_id);

create table public.league_members (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  unique (league_id, user_id)
);
create index league_members_user_idx on public.league_members (user_id);

-- One row per league-week: locks in the scope used for that week's board.
create table public.league_weeks (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues (id) on delete cascade,
  week          integer not null,
  scope         public.league_scope not null,
  conference_id integer references public.conferences (id),
  lock_at       timestamptz,
  game_count    integer not null default 0,
  is_playoff    boolean not null default false,
  playoff_round integer,
  unique (league_id, week)
);

create table public.league_week_games (
  league_week_id uuid   not null references public.league_weeks (id) on delete cascade,
  game_id        bigint not null references public.games (id) on delete cascade,
  primary key (league_week_id, game_id)
);

create table public.picks (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid   not null references public.leagues (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete cascade,
  week       integer not null,
  game_id    bigint not null references public.games (id) on delete cascade,
  team_id    integer not null references public.teams (id),
  is_correct boolean,
  points     integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, user_id, game_id)
);
create index picks_league_week_idx on public.picks (league_id, week);
create index picks_game_idx on public.picks (game_id);

create table public.playoff_matchups (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid    not null references public.leagues (id) on delete cascade,
  round         integer not null,
  week          integer not null,
  slot          integer not null,
  home_user_id  uuid references public.profiles (id) on delete cascade,
  away_user_id  uuid references public.profiles (id) on delete cascade,
  home_seed     integer,
  away_seed     integer,
  home_points   integer,
  away_points   integer,
  winner_user_id uuid references public.profiles (id) on delete cascade,
  is_final      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (league_id, round, slot)
);
