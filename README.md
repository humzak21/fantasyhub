# FantasyHub

A companion site for one 14-team ESPN fantasy football league. ESPN already
runs the league — it sets the lineups, scores the games and keeps the rosters.
This app is everything ESPN does not do: a power ranking that explains itself,
a pick'ems game, a predictions board with real money on it, an end-of-season
awards ballot, and a history section that goes back to 2020.

It is a React single-page app on top of Supabase. There is no application
server. The site is a static bundle served by Railway, and the weekly job that
pulls new data out of ESPN runs as a GitHub Actions cron.

**New here?** Start with [Getting set up](#getting-set-up), then read
[How the code is organized](#how-the-code-is-organized) and
[Conventions that will trip you up](#conventions-that-will-trip-you-up).
`CLAUDE.md` in the repo root is the long-form version of that last section, and
it is worth reading before your first PR — most of it exists because something
broke once, and it says which thing.

---

## Getting set up

You need Node 22 or newer.

```bash
git clone https://github.com/humzak21/fantasyhub.git
cd fantasyhub
npm install
cp .env.example .env.local
npm run dev
```

That serves the app on http://localhost:3000.

### What goes in `.env.local`

`.env.example` lists everything with comments. In practice you need two
variables to run the app at all:

| Variable | What it's for |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | The project's anon key |

Anything prefixed `VITE_` is **inlined into the browser bundle at build time**,
so it is public by definition. Never put a secret behind a `VITE_` name.

Two more are only needed if you're working on the ESPN sync scripts:

| Variable | What it's for |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Lets `scripts/` write past row-level security. Server-side only — never expose it to the browser. |
| `ESPN_S2` / `ESPN_SWID` | ESPN session cookies, needed to read a private league. Pull them from a logged-in browser's DevTools → Application → Cookies → espn.com. |

Ask for the Supabase project credentials rather than pointing at your own
project — the app expects the league's schema, and there's no seed script.

### A note on `npm install`

Installing runs a `prepare` hook that registers a custom git merge driver for
`package-lock.json`. That's deliberate: the lockfile is generated, not written,
and git merges it line by line like prose, so any two branches that both touched
dependencies conflict textually even when they don't actually disagree. The
driver throws both sides away and regenerates from the merged `package.json`,
which is the only resolution that produces a tree npm would really build.

If lockfile conflicts start appearing again, that registration is the first
thing to check:

```bash
git config --get merge.npm-lockfile.driver
```

---

## Who sees what

Three levels, and they matter for reading the rest of this document.

**Anyone with the link** can browse the site without an account — rankings,
stats, the schedule, playoffs, pick'em results. Team and owner names are
replaced with a short id for signed-out visitors, so the league's numbers are
public but the people in it are not.

**League members** (anyone with an account) see real names, submit pick'ems and
playoff brackets, post and fade takes, and vote on the awards ballot. The Takes
board and the History tab are members-only.

**The admin** runs the league: creating seasons, correcting scores, grading
takes, opening and releasing the awards.

There is also a **parlay commissioner** — a role the admin grants in Settings,
not a second admin. It exists so someone can see everyone's touchdown parlay
picks without gaining the ability to change anything.

Access rules are enforced in the database with row-level security, not in the
UI. The browser holds the anon key and talks to Supabase directly, so a rule
that only exists in a component is not a rule. If you add a permission, add it
as a policy first and let the UI describe it.

---

## The tabs

### Power Rankings

The main view. Every team gets a rating out of nine components, each scored
0–100 against the rest of the league and then weighted:

| Component | Weight | What it measures |
|---|---|---|
| Record | 22% | Win percentage, adjusted for how strong the opponents faced were |
| All-Play | 15% | How often you'd have won playing every team every week — record with schedule luck removed |
| Scoring | 13% | Points per game so far |
| Roster Strength | 13% | Points the starting lineup actually produced |
| Recent Form | 10% | Last three games, most recent weighted heaviest |
| Roster Outlook | 9% | Projected points still to come from the current starters |
| Remaining Schedule | 8% | How hard the run-in is |
| Consistency | 5% | Week-to-week scoring variance — steady beats boom-or-bust at the same average |
| Lineup Efficiency | 5% | How much of the best possible lineup you actually started |

The breakdown is visible per team, so a rating is arguable rather than a black
box. A component that can't be computed for a given season is dropped and the
remaining weights are rescaled — the 2020–2025 seasons have no player-level
data, so they rank on the five team components instead of being dragged down by
the four that don't exist.

Rankings are stored week by week, so you can move the week selector back and
see what the table looked like at the time, not what it would look like today
with hindsight.

### Statistics

Charts over the season: weekly scoring trends, points per game, margin of
victory, score distribution, all-play records, and how each team's rank has
moved. Filter to a subset of teams and to a range of weeks.

### Schedule

Every matchup, by week or as the full season. Each game can be expanded to show
both starting lineups with the points each player scored. The admin can correct
a score from here.

### Teams & Rosters

The fourteen teams, their owners, records and current rosters by lineup slot.
Your own team is sorted to the top.

### Pick'ems

The weekly game. Pick a winner in every matchup; one point per correct pick.

- **Make Picks** — the form. Opens Tuesday 4am and closes Thursday 8pm in the
  league's time zone. The window comes from the season's own configuration.
- **Matchup Research** — an optional panel showing who is actually starting
  this week, with projections before the games and real points after. It reads
  the live roster snapshot rather than the weekly stats table, so a waiver
  claim shows up here without waiting for next Tuesday's sync.
- **TD Parlay** — at the foot of the form, each member names one NFL player
  they think scores a touchdown. Nobody can see anyone else's pick until the
  deadline passes; that privacy is a database rule, not a UI one.
- **Results** — everyone's picks and how they scored, once the week reveals.
- **Standings** — the season-long pick'em leaderboard.
- **Submissions** (admin) — who has and hasn't submitted.
- **TD Parlay dashboard** (commissioner) — every member's parlay pick, by week
  and across the season.

The Pick'ems tab shows a notification dot while the window is open and you
haven't submitted.

### Takes

The predictions board. Post a call — "I finish top four", "Humza misses the
playoffs" — and attach a milestone: a specific week, the end of the regular
season, or the end of the season. The board sorts by when each take comes due,
so the next thing to be settled is at the top.

You can attach a stake in plain text: "$20", "40 FAAB", whatever the league
actually bets. A take with a stake can be **faded** — another member presses
Hell Nah, which is them taking the other side and agreeing to cover the wager
if the take hits. You can't fade your own take, and there's nothing to fade on
a take with no stake.

Authors can reword a take for 72 hours after posting, and only the wording —
you can't quietly change what you predicted. Edits are timestamped and shown.
The admin grades each take as correct, incorrect, or a push once its milestone
passes.

Members only.

### Playoffs

The bracket. Before the playoffs start, members pick the winner of every
matchup; afterwards the bracket fills in with real results and shows whose
picks survived. The admin sets up seeds and consolation slots and releases
results.

### Awards

End-of-season awards, in two kinds.

**Computed** — eleven awards derived from the season's games when it's
finalized: League Champion, Best Regular Season Record, Highest Points Scored,
Highest Weekly Score, Most Blowout Wins, Most Consistent, and the less
flattering half (Worst Record, Lowest Points, Lowest Weekly Score, Biggest
Blowout Loss, Most Points Against).

**Voted** — a ballot the league fills in. The admin can't release the results
until every team has voted and the deadline has passed, and until they do,
nobody sees a tally — so there's no watching the count build and voting
strategically. Once released, the Results tab shows the vote breakdown per
award as a pie chart, and the Gallery shows the winners.

The tab itself stays hidden until the season's awards release date, unless the
admin opens voting to the league early or there are past results to browse.

Past seasons' ballots stay readable. The Results tab has a season picker that
lists exactly the years that were actually voted on.

### History

The long view, back to 2020. Members only.

- **Overview** — a timeline of every season and quick league-wide stats.
- **Franchises** — a profile per owner: every season they've played, their
  championships, their career record, their transaction habits. Franchises are
  keyed on the owner, not the team name, so someone who renames their team
  every August is still one continuous history.
- **Head-to-Head** — a matrix of every owner against every other owner, with
  the full matchup log behind each cell.
- **Records** — the record book. Highest score, biggest blowout, longest
  streak, and so on.
- **Awards** — the hall of fame across all seasons.

A season becomes history the moment it's finalized. There's no import step and
no separate archive to fall out of date.

### Standings

A drawer available from the header on any tab: current standings by division,
without leaving the page you're on.

### Week navigator

Also in the header, and shared by every tab. Move to an earlier week and the
whole app follows — rankings, schedule, stats and lineups all show that week as
it stood. Nothing shows you data from a week you haven't navigated to.

---

## Seasons

A season is created by the admin, who sets the year, the number of regular
season and playoff weeks, and the date of week 1. Creating it carries the
previous season's teams and divisions forward — only identity, not stats — so a
new year doesn't mean re-typing fourteen owners.

Ending a season is explicit. Finalizing derives the final placements from the
season's own games, writes each team's playoff finish and final rank, and
computes the eleven awards. It refuses to guess: an unfinished game, a missing
championship game or a malformed bracket stops the run, because a wrong
champion is worse than no champion and everything downstream keys off that
placement.

Activating a new season finalizes the one it replaces, so setting next year up
early is safe.

---

## Where the data comes from

ESPN, on a schedule.

**Weekly** (`npm run sync-week`, or the GitHub Actions cron at 4am ET every
Tuesday): rosters, scores, player-level week stats, transactions, and a power
ranking snapshot for the week just finished. Rosters are refreshed again
mid-week, after waivers — see the scheduled jobs below. It takes no arguments — the active
season row supplies the season, the week, the playoff boundary and the ESPN
league id. Every step is an idempotent upsert, so re-running a failed sync is
the fix. Each run records itself, and player stats and transactions are
non-fatal: losing the week's snapshot to a player-data hiccup would cost more
than the missing rows.

**Start of season** (`npm run sync-schedule`): imports a whole season's teams
and games. Manual only — a schedule is published once a year.

Both accept `--dry-run` to see what they'd do without writing. ESPN needs
cookies that only the scripts have, so nothing can start an import from the
browser.

Every script in `scripts/` guards its entry point, so importing one is safe.
Keep that guard when you add a script — an unguarded import once ran a full
production sync.

---

## How the code is organized

```
src/components/       One tree. Feature folders + ui/ primitives + layout/
hooks/queries/        TanStack Query hooks — one file per domain
services/db/          Data access — one module per domain
services/             Power ranking calculator, ESPN fetchers and mappers
types/index.js        Data models, ranking weights, thresholds
utils/                Season dates and week math, formatting, team colours
supabase/migrations/  Schema, RLS policies, SQL functions
scripts/              ESPN sync and the CI check scripts
e2e/                  Playwright smoke spec
```

Data flows one way: a component calls a hook from `hooks/queries/`, that hook
calls `getDb().<domain>.<method>()` in `services/db/`, and that talks to
Supabase. Components don't reach past the hook layer, and `services/db/` is the
only place that knows about tables.

The files worth opening first:

- `FantasyFootballApp.jsx` — the shell, the tab list and the route guards.
- `hooks/queries/keys.js` — every query key in the app.
- `services/db/index.js` — the data-layer entry point.
- `services/powerRankingCalculator.js` — the ranking algorithm.
- `utils/seasonConfig.js` — the one source for season dates, week math and
  deadlines.

---

## Conventions that will trip you up

These are the ones a new contributor hits first. `CLAUDE.md` has the rest, with
the history behind each.

**There is one component tree.** There used to be a separate mobile app picked
by sniffing the user agent, and it was permanently missing features. Don't
create a `Mobile*` twin of anything — make the component responsive. Prefer
`md:` breakpoints to JavaScript branching; 768px is the structural boundary
everywhere.

**Use semantic tokens, not raw colours.** `bg-card`, `text-muted-foreground`,
`border-border` — never `bg-white` or `text-gray-600`. Status colours are
`success` / `warning` / `info` / `destructive`. The theme lives in
`globals.css`; there is no `tailwind.config.js` (Tailwind v4 reads the theme
from CSS). Never add an `!important` colour override — if a colour isn't
applying, a token is missing.

**Class names can't be built at runtime.** Tailwind scans source text, so
``bg-${color}-500`` generates no CSS at all. Use literal class names.

**Every query key lives in `keys.js`.** Never build one inline — the
invalidation side needs to find it. A mutation invalidates the domains it
actually changed, not everything.

**Errors are thrown, not swallowed.** In `services/db/`, throw `DbError` rather
than returning `[]`. A caller can't tell an empty array from an empty league.

**Rules belong in the database.** The anon key ships in the client bundle, so
permission and deadline logic goes in RLS policies, triggers or SQL functions.
UI code mirrors those rules only so it doesn't offer a button that's going to
fail.

**Tests render through the provider helper.** Anything touching viewer identity,
the viewed week, or TanStack Query uses `src/test/renderWithProviders.jsx`, not
bare `render`.

**jsdom has no layout engine and applies no CSS.** A test that assigns
`window.innerWidth` and asserts a "mobile layout" is asserting nothing — six
such files existed and passed at widths where the page was visibly broken. Real
viewport coverage is the Playwright smoke run.

---

## From a branch to production

### 1. Branch

Branch off `main`. The prefixes in use are `feat/`, `fix/`, `chore/`,
`refactor/` and `copy/` for pure wording changes:

```bash
git checkout -b feat/short-description
```

Commit subjects describe the behaviour change in a sentence, not the files
touched — "Takes: members-only at the database, not just in the nav" rather
than "update RLS".

### 2. Before you push

Run what CI will run. It takes about a minute and saves a round trip:

```bash
npm run type-check
npm run test:run
npm run build
npm run check-css-tokens
npm run check-mobile
npm run check-bundle
```

For anything visual, also run the smoke suite, which needs a build first:

```bash
npm run test:e2e
```

### 3. Open a PR

Opening a PR against `main` triggers `.github/workflows/ci.yml`, which runs
three jobs in parallel.

**Job `check`** — Node 22, `npm ci`, then in order:

| Step | Blocking? | What it catches |
|---|---|---|
| Lint | **No** — advisory | ESLint 9, flat config in `eslint.config.js`. There's a pre-existing backlog from before the 2026 refactor — 6 errors and 212 warnings as of the ESLint 9 migration, and `--max-warnings 0` means the warnings fail the command too — so a hard gate would fail every PR on day one. It's `continue-on-error` until that's worked off. Note that `src/components/ui/**` and `src/components/layout/**` are stricter by config: hook rules and unused vars are errors there, because everything else is built on those files. |
| Type-check | Yes | `tsc --noEmit`. The project is JSDoc + TypeScript checking, not TypeScript source. |
| Tests | Yes | The vitest suite. |
| Build | Yes | `vite build`. |
| Check the bundle is loadable | Yes | A circular static import between eager chunks builds fine and then white-screens in production. That shipped once. |
| Check the Tailwind theme layer | Yes | A missing theme layer is invisible to every other gate — it type-checks, tests and builds clean, and only shows up as a thousand small unstyled places in the browser. That also shipped once. |
| Check mobile conventions | Yes | Greps for the specific mistakes that broke this site on a phone: a disabled viewport zoom, `touch-action: none` on the body, a transform on the app root, inline pixel heights on charts, `justify-center` on a horizontal scroll container. Each rule's failure message names the bug it prevents. |

**Job `smoke`** — installs Chromium, builds with the Supabase secrets from the
repo, then loads every route at 375×667 and 1280×800 and asserts the page does
not scroll sideways. Screenshots and the Playwright report are uploaded as
artifacts whether it passes or fails, with a 7-day retention.

That single assertion is the highest-value gate in the pipeline. It's the one
that would have caught most of the mobile backlog, including a Pick'ems row
whose second team button sat off-screen and unclickable on a phone for months.
It only works because the root `overflow-x: hidden` is gone — don't put it back,
because it hides these bugs from measurement and from the reader alike.

**Job `migrations`** — spins up a throwaway local Postgres with the Supabase
CLI, applies every migration in `supabase/migrations/` in order, and reports
drift between the migrations and the resulting schema. It needs no secrets,
which is why it's a separate job.

This job currently **skips itself** and says so in a GitHub notice. The
project's original tables were built by hand in the SQL editor, so the first
migration is a placeholder rather than a real dump, and the replay would die on
the first `alter table`. Capturing a real baseline needs the database password,
so it can't happen in CI. The moment someone commits a real dump to
`supabase/migrations/00000000000000_baseline_schema.sql`, this becomes a live
gate with no further edits. Until then a skipped check is better than a red X
that trains people to ignore it.

### 4. Merge

PRs merge into `main`. Squash or merge commit both appear in the history; the
existing pattern is a merge commit per PR.

If you hit a `package-lock.json` conflict, the merge driver should handle it
automatically. If it doesn't, settle `package.json` first, then:

```bash
npm install --package-lock-only && git add package-lock.json
```

Never hand-stitch two resolved dependency trees — you can describe a tree npm
would never generate, and it installs fine right up until it doesn't.

### 5. Deploy

Railway is connected to the repo and builds from `main`. `railway.json` points
it at the `Dockerfile`, which is multi-stage:

1. **Build stage** (`node:22-alpine`) — `npm ci`, then `npm run build`. Vite
   inlines the `VITE_*` variables at this point, so Railway passes its service
   variables in as Docker build args. They must exist at build time; setting
   them at runtime does nothing. All of them are public values.
2. **Runtime stage** — copies `dist/` and `package.json`, installs `serve`
   globally, and runs `serve -s dist -l ${PORT:-3000}`. No `node_modules`, no
   application code, no server.

The `-s` flag is the single-page-app fallback, so client-side routes resolve to
`index.html` instead of 404ing.

`package.json` is copied into the runtime stage for one specific reason: Railway's
dashboard can carry its own start command that this repo can't clear, and if it's
set to `npm start` the container needs a `package.json` to read. An earlier
version omitted it and every container died with `ENOENT` and restarted ten
times. `npm start` and the image's `CMD` now resolve to the same thing.

Railway health-checks `/` with a 100-second timeout and restarts on failure up
to ten times.

**Database changes do not deploy with the app.** Railway builds a static bundle
and knows nothing about Postgres. Migrations in `supabase/migrations/` are
applied separately with `npm run db:push`, and they should land *before* the
code that depends on them — otherwise the deployed bundle queries a column that
doesn't exist yet.

**Rolling back** is a redeploy of the previous build from the Railway
dashboard. Since the bundle is static and the database is separate, rolling
back code doesn't roll back a migration; plan migrations to be
backwards-compatible with the currently deployed bundle.

### Scheduled jobs

Two workflows run outside the PR path and write to production directly:

- **`sync-week.yml`** — Tuesdays at 09:00 UTC (4am ET), after Monday night
  football has settled. Also runnable by hand from the Actions tab, with
  optional week and dry-run inputs.
- **`refresh-rosters.yml`** — Wednesdays and Thursdays at 09:00 ET. Runs only
  the roster step of the same script, so the pick'ems research panel reflects
  Wednesday's waiver claims instead of Tuesday morning's rosters.
- **`sync-schedule.yml`** — manual only, for the start-of-season import.

Both read `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ESPN_S2` and
`ESPN_SWID` from repository secrets, and both share a concurrency group named
`espn-write` so a schedule import and a score sync queue rather than race over
the same `games` rows.

If a sync fails, re-run it. Every step is an idempotent upsert, so a re-run is
the fix rather than a risk.

### Dependency updates

Dependabot opens grouped PRs weekly on Mondays — production and development
dependencies in separate groups, since a bad runtime dependency ships to the
league while a bad dev one only breaks a build you're standing in front of.
GitHub Actions updates come monthly.

Majors are deliberately neither grouped nor ignored: they arrive as their own
PR and get their own review. Grouping exists mostly to stop the lockfile moving
on `main` fourteen times a fortnight, which is what manufactures conflicts in
every open branch.

Most Dependabot PRs run stale — check the security alert list rather than the
PR list, and expect a lot of them to be lockfile-only.

---

## Command reference

### Development

```bash
npm run dev            # dev server on localhost:3000
npm run build          # production build
npm run preview        # serve the build locally
npm start              # serve dist/ statically (what the container runs)
npm run clean          # drop build artifacts and the Vite cache
```

### Quality

```bash
npm run lint           # eslint
npm run lint:fix       # eslint with --fix
npm run type-check     # tsc --noEmit
npm test               # vitest, watch mode
npm run test:run       # vitest, once
npm run test:e2e       # Playwright smoke at 375px and 1280px (needs a build)
npm run check-css-tokens   # the Tailwind theme layer reached the built CSS
npm run check-mobile       # grep guards for known mobile regressions
npm run check-bundle       # no circular static imports between eager chunks
npm run capture-screens <dir>   # shoot every tab at 375/768/1280 for before/after diffing
```

### Database

```bash
npm run db:push        # apply migrations in supabase/migrations/
npm run db:push:dry    # ...without writing
npm run db:diff        # diff the local schema against the remote
npm run db:types       # regenerate types/supabase.ts from the live schema
```

### Sync

```bash
npm run sync-week      # sync the current week of the active season from ESPN
npm run sync-schedule  # import a whole season's teams and games
```

Both take `--dry-run`.

---

## Built with

React 18, Vite, React Router, TanStack Query, Tailwind CSS v4, Radix UI
primitives (via shadcn/ui), Recharts, and Supabase for auth, Postgres and
row-level security. Tested with Vitest and Playwright. Hosted on Railway as a
static bundle.

The app is dark-only by design, and responsive rather than having a separate
mobile build — there is one component tree, and it works from a phone up.
