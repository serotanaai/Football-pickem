# PickemWeekly — College Football Pick'em

A web app for running a weekly college football pick'em league with friends. Pick a slate
each week — one conference, all of FBS, or only games with a ranked team — and the app
handles schedules, scoring, weekly winners and a fantasy-football-style playoff bracket.

Built with Next.js (App Router) and Supabase. Game data comes from ESPN's public college
football API, FBS-first: only a top-25 slate reaches outside FBS, and only to keep a ranked
team's game against an FCS opponent on the board.

---

## What it does

**Leagues.** Anyone signed in can create a league and becomes its commissioner. Every league
gets a private invite link (`/join/ABCD2345`); friends who follow it sign up with an email
address and land straight in the league.

**Season slate.** A league picks one slate when it is created and follows it every week, so
the rules never shift mid-season. It can be corrected up until the first pick is made, and is
frozen after that:

| Slate | What lands on the board |
| --- | --- |
| `conference` | Every game involving a team from the chosen conference |
| `all_fbs` | The full FBS schedule for that week |
| `top25` | Only games with at least one team ranked in the top 25 |

When more games qualify than the league's `max_games_per_week`, ranked matchups are taken
first, then earliest kickoff. Rankings come from the game's own weekly `curatedRank`, so a
top-25 slate follows the poll as it moves.

`conference` and `all_fbs` slates are FBS-on-FBS only. A `top25` slate keeps a ranked team's
game even when the opponent is FCS — otherwise September boards would have holes in them.

**Picks.** **100 points per correct pick**, straight up — no spreads. **Submitting a week is
final**: the app asks for confirmation, then seals it, and the pick trigger refuses any further
write for that member and week. Until you submit, **each game locks at its own kickoff.** You can keep submitting picks through the week right up until the last game
starts, but every game that has already begun is gone: turn up after 5 of 10 games have
kicked off and the most you can win that week is 500. A pick reveals to the rest of the league
at the same moment it locks. Both rules live in Postgres (a trigger and a row-level-security
policy), not in the interface, so they hold even against direct API access.

**Weekly results.** Every week has its own leaderboard and winner. Season standings track
total points, record and weekly wins.

**Playoffs.** Set a field of 2, 4 or 8. When the regular season ends the commissioner seeds
the bracket on **weekly wins, with cumulative points breaking ties** — weekly wins act as the
W-L record, total points as points-for; the following weeks become head-to-head matchups on
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
current and previous week, grading picks and settling playoff matchups. On Vercel, set
`CRON_SECRET` to the same value as `SYNC_SECRET` so the platform's `Authorization: Bearer`
header is accepted.

**Scheduling.** `vercel.json` deliberately declares no cron. Vercel's Hobby plan restricts
cron jobs enough to be more trouble than they are worth, and daily runs would leave Saturday
scores stale for hours regardless. Drive the sync externally instead:

- Point a scheduler (cron-job.org, GitHub Actions, an uptime monitor) at
  `https://<your-domain>/api/cron?secret=<SYNC_SECRET>` every 10–15 minutes. The route is
  idempotent, so running it often is harmless.
- Or, on Vercel Pro, add a `crons` block back to `vercel.json`:
  `{ "crons": [{ "path": "/api/cron", "schedule": "0 */2 * * *" }] }`

---

## How the data flows

```
ESPN scoreboard ──▶ /api/sync/games ──▶ games, teams, rankings
                                          │
                                          ├─▶ grade_picks()          100 points per correct pick
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
| `grade_picks` | Marks picks correct or wrong once a game is final |
| `submit_week_picks` | Saves a week's picks and seals it, in one transaction |
| `seed_playoffs` | Seeds the bracket on weekly wins, then cumulative points |
| `advance_playoffs` | Scores a round and builds the next one |

The `validate_pick` trigger rejects any pick placed into an already-submitted week, after that
game has kicked off, on a team that is not in the game, or on a game that is not on that
league's slate for the week.

**League consensus.** The overview lists the week's slate in kickoff order with the split of
how the league picked each game. Those percentages only appear once a game has started,
because the picks policy returns nothing but your own row before then — showing a pre-kickoff
percentage would mean weakening that policy, which in a six-person league would effectively
expose individual picks.
`freeze_league_slate` stops the slate, conference or season changing once picks exist.

### ESPN endpoints

All public, no key required. Group `80` is FBS; each conference is a child group.

Host matters. `site.api.espn.com` sits behind an Akamai rule that returns **403 to
datacenter IPs** — confirmed by calling it from Supabase, and it would have hit Vercel the
same way. `site.web.api.espn.com` serves the identical paths and payloads with no such block,
so that is what the adapter uses.

```
/scoreboard?groups=80&dates=<season>&seasontype=2&week=<n>&limit=400
/rankings?year=<season>&week=<n>&seasontype=2
```

The scoreboard carries `conferenceId` on every team, so conference membership and FBS status
come free with the games — which is just as well, because `/teams` ignores its `groups`
filter on this host and will happily return Division III schools. Conference group ids are in
`src/lib/espn.ts` and `supabase/migrations/0005`.

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
