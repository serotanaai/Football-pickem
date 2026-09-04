# Hail Mary — College Football Pick'em

A web app for running a weekly college football pick'em league with friends. Pick a slate
each week — one conference, all of FBS, or only games with a ranked team — and the app
handles schedules, scoring, weekly winners and a fantasy-football-style playoff bracket.

Built with Next.js (App Router) and Supabase. Game data comes from ESPN's public college
football API. **FBS teams only.**

---

## What it does

**Leagues.** Anyone signed in can create a league and becomes its commissioner. Every league
gets a private invite link (`/join/ABCD2345`); friends who follow it sign up with an email
address and land straight in the league.

**Weekly slates.** A league has a default slate type, and the commissioner can override any
individual week:

| Slate | What lands on the board |
| --- | --- |
| `conference` | Every game involving a team from the chosen conference |
| `all_fbs` | The full FBS schedule for that week |
| `top25` | Only games with at least one team ranked in the top 25 |

When more games qualify than the league's `max_games_per_week`, ranked matchups are taken
first, then earliest kickoff. Games with a non-FBS opponent never make a slate.

**Picks.** One point per correct pick, straight up — no spreads. Each game locks at its own
kickoff, and **nobody can see anyone else's pick on a game until it starts**. That rule is a
row-level-security policy in Postgres, not a UI convention, so it holds even against direct
API access.

**Weekly results.** Every week has its own leaderboard and winner. Season standings track
total points, record and weekly wins.

**Playoffs.** Set a field of 2, 4 or 8. When the regular season ends the commissioner seeds
the bracket from regular-season points; the following weeks become head-to-head matchups on
that week's picks. The higher seed wins a tie. Winners advance automatically once every game
on a round's slate is final.

---

## Setup

### 1. Supabase

The schema lives in `supabase/migrations/`, applied in filename order. With the
[Supabase CLI](https://supabase.com/docs/guides/local-development):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file into the SQL editor in order (`0001` → `0005`).

Then, under **Authentication → URL Configuration**, set the site URL to your deployed origin
and add these redirect URLs:

```
http://localhost:3000/auth/callback
http://localhost:3000/auth/confirm
https://<your-domain>/auth/callback
https://<your-domain>/auth/confirm
```

Email sign-up works out of the box with Supabase's built-in email. That sender is rate
limited and meant for development — wire up your own SMTP provider under **Authentication →
Emails** before inviting a real league.

### 2. Environment

```bash
cp .env.example .env.local
```

`.env.example` already carries this project's URL and publishable key, so the app
boots as soon as you copy it. Fill the remaining two in when you want game data:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The publishable key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server only**, never ship to the browser |
| `SYNC_SECRET` | Any random string: `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | Public origin, used to build invite links |
| `NEXT_PUBLIC_DEFAULT_SEASON` | Season new leagues default to |

### 3. Run it

```bash
npm install
npm run dev
```

### 4. Load the games

Nothing appears on a slate until the ESPN data is pulled in. Seed the team list once, then
pull the weeks you want:

```bash
# FBS conferences and teams — run once per season
curl -X POST "http://localhost:3000/api/sync/teams?secret=$SYNC_SECRET"

# A single week, a range, or whatever ESPN says is current
curl -X POST "http://localhost:3000/api/sync/games?secret=$SYNC_SECRET&season=2026&week=5"
curl -X POST "http://localhost:3000/api/sync/games?secret=$SYNC_SECRET&season=2026&weeks=1-15"
curl -X POST "http://localhost:3000/api/sync/games?secret=$SYNC_SECRET"
```

`/api/cron` does all of it in one call — seeding teams if the table is empty, pulling the
current and previous week, grading picks and settling playoff matchups. `vercel.json`
schedules it every two hours. On Vercel, set `CRON_SECRET` to the same value as `SYNC_SECRET`
so the platform's `Authorization: Bearer` header is accepted.

---

## How the data flows

```
ESPN scoreboard ──▶ /api/sync/games ──▶ games, teams, rankings
                                          │
                                          ├─▶ grade_picks()          one point per correct pick
                                          ├─▶ generate_week_board()  tops up each league's slate
                                          └─▶ advance_playoffs()     settles finished bracket rounds
```

Everything meaningful happens in Postgres functions rather than application code, so the
rules hold no matter what talks to the database:

| Function | Does |
| --- | --- |
| `create_league` | Creates a league, slug and invite code, and enrols the commissioner |
| `join_league_by_code` | Redeems an invite link |
| `generate_week_board` | Builds a week's slate from its scope, capped at `max_games_per_week` |
| `set_week_scope` | Commissioner switches a single week between the three slate types |
| `grade_picks` | Marks picks correct or wrong once a game is final |
| `seed_playoffs` | Seeds the bracket from regular-season points |
| `advance_playoffs` | Scores a round and builds the next one |

The `validate_pick` trigger rejects any pick placed after kickoff, on a team that is not in
the game, or on a game that is not on that league's slate for the week.

### ESPN endpoints

All public, no key required. Group `80` is FBS; each conference is a child group.

```
/teams?groups=<conference id>          team list for one conference
/scoreboard?groups=80&dates=<season>&seasontype=2&week=<n>
/rankings?year=<season>&week=<n>&seasontype=2
```

Conference group ids are in `src/lib/espn.ts` and `supabase/migrations/0005`.

---

## Deploying

Any Node host works; Vercel is the shortest path. Set the six environment variables plus
`CRON_SECRET`, point `NEXT_PUBLIC_SITE_URL` at the deployed origin, and add that origin to
the Supabase redirect URLs above.

## Layout

```
src/
  app/
    api/sync/{teams,games}/   ESPN ingest, guarded by SYNC_SECRET
    api/cron/                 scheduled: sync + grade + advance
    auth/                     email confirm, magic link, sign out
    join/[code]/              invite landing
    leagues/[slug]/           overview, picks, results, playoffs, settings
    leagues/new/              league creation
  lib/
    espn.ts                   ESPN adapter
    sync.ts                   ingest + post-ingest league refresh
    board.ts                  slate loading
    league.ts                 league access + week resolution
    supabase/                 browser, server and service-role clients
supabase/migrations/          schema, RLS, functions
```
