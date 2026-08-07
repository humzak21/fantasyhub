# §2 — P0 Security

The phase the refactor deferred at every stage. **§2.2** (privileged RPCs),
**§2.3** (RLS disabled), **§2.4** (always-true policies), **§2.5** (definer
views, mutable search paths) and **§2.6** (client-side-only admin enforcement)
are done. §2.1 — the ESPN credential — is code-side done and rotation-pending;
see [`05-open-items.md`](05-open-items.md) item 1.

- **Date:** 2026-08-06
- **Migrations applied to production:** 9

| | Before | After |
|---|---:|---:|
| Supabase security lints | 169 | **52** |
| — of which ERROR | 2 | **0** |
| Functions with mutable `search_path` | 62 | **0** |
| SECURITY DEFINER fns callable by `anon` | 48 | 21 (all reads) |
| Tables writable by any authenticated user | 16 | **0** |

---

## 1. The trap that shaped everything: `is_admin()` is false for the backend

The obvious guard — `if not public.is_admin() then raise` — would have been
wrong, and wrong in the direction that breaks production silently.

`is_admin()` compares the JWT's email claim to the admin address. **The service
role has no email claim**, so `select public.is_admin()` under `service_role`
returns FALSE. Dropping that guard into the privileged functions would have
locked out `scripts/sync-week.js` and every other script — the automation §7
had just finished building — while reading as obviously correct.

So authority is `can_write_league()`: the admin's browser session, *or* a
trusted backend.

### And a second trap inside the first

The first version of `can_write_league()` tested
`current_user in ('service_role','postgres','supabase_admin')`. That is wrong in
the fail-open direction: **inside a `SECURITY DEFINER` function `current_user`
is the function owner**, not the caller. The check was true for everybody,
including anonymous visitors.

It was caught by a probe that called `disable_roster_trigger()` as `anon` and
asserted a denial. The call succeeded.

`session_user` is no better — every PostgREST request arrives on the
`authenticator` role whichever API key was used. The JWT is the only thing that
distinguishes callers; its *absence* means nothing is proxying, i.e. a direct
psql/migration connection, which is already privileged.

Final authority matrix, verified against production by setting
`request.jwt.claims` per caller:

| caller | `is_admin()` | `can_write_league()` |
|---|---|---|
| anon | false | **false** |
| authenticated (not admin) | false | **false** |
| authenticated (admin) | true | **true** |
| service_role | **false** | **true** |
| direct backend, no JWT | false | **true** |

## 2. Privileged RPCs (§2.2)

Any visitor could `POST /rest/v1/rpc/<name>` against 48 SECURITY DEFINER
functions that ran with owner rights and bypassed RLS — including
`execute_trade`, `drop_player_from_roster`, and `disable_roster_trigger`, which
ran `ALTER TABLE` with **no authorization check of any kind**.

Two mechanisms, because grants cannot express "only this one person" — the
admin is just an `authenticated` user:

- **Revoked** on 37 functions the browser never calls. `service_role` keeps
  EXECUTE, which is how the scripts reach them.
- **Guarded** with `can_write_league()` on the six the admin UI does call:
  `disable_roster_trigger`, `enable_roster_trigger`, `update_game_result`,
  `create_pick_em_week`, `get_users_for_admin`, `assign_schedule_to_season`.

`assign_schedule_to_season` has a ~130-line body that writes `games`. Rather
than retype it around a guard, the guard was **injected into the existing
definition programmatically** (`pg_get_functiondef` → insert after `BEGIN` →
`execute`), so the body is preserved byte-for-byte. Verified afterwards: guard
present, `INSERT INTO games` still present, definition 6,536 chars.

### The revoke that silently did nothing

The first revoke migration ran `revoke execute ... from anon, authenticated` and
the verification query still reported **every** function as anon-callable.

The reason is in the ACL: Postgres grants EXECUTE on new functions to **PUBLIC**
by default, which appears as the empty-grantee entry `=X/postgres`. `anon`
inherits it, so revoking its explicit grant changes nothing. Revoking a role you
never granted to is a silent no-op, so this failed without erroring — it would
have shipped as "done" on the strength of the migration succeeding.

`revoke ... from public, anon, authenticated` is what actually closes it.

### Pick submissions

`submit_pick_em_picks` and `submit_playoff_picks` already did the important
thing correctly — both write `auth.uid()` rather than a caller-supplied user id,
which is exactly what §2.2 asks for. The gap was only the grant: both were
callable by `anon`, for whom `auth.uid()` is NULL. Now `authenticated` only.

## 3. RLS policies (§2.4, §2.6)

"Authorization" on league data was `auth.uid() IS NOT NULL` — any logged-in user
could rewrite seasons, teams, games, weeks, rosters, ESPN staging and ranking
history. `divisions` and `transactions_2025_legacy` were at a literal
`USING (true)`. `pick_em_submissions` carried an `ALL` policy scoped only to
"is logged in", so **any user could edit anyone else's picks**.

All 16 are now public-read / `is_admin()`-write. The policies that inlined
`'humzak2001@gmail.com'` are repointed at `is_admin()`, so who the admin is has
one definition.

Two checks were run *before* applying, because both could have broken the site:

- **Every affected table already had its own SELECT policy** — dropping an `ALL`
  policy also drops the read it implied.
- **`pick_em_submissions_backup`'s INSERT policy** is used by a trigger. The
  trigger function is SECURITY DEFINER owned by `postgres` and the table does
  not `FORCE` row security, so it still inserts with the policy tightened.

`players` had a policy named "Only admins can modify players" defined as
`USING (false)` — it denied everyone including the admin. It now matches its
name.

Verified by impersonating each caller against production:

- **anon** reads all 15 league tables (seasons 6, teams 84, games 703, …) and
  writes nothing
- **authenticated non-admin**: game score update, team rename, division delete
  and editing someone else's picks all filtered to 0 rows
- **authenticated admin**: writes succeed

## 4. Views and search paths (§2.5)

`roster_stats` — the last advisor ERROR — evaluated with the creator's
permissions. Its two sources carry public-read policies, so `security_invoker`
returns the same rows to anon without being an RLS bypass (checked: still 84
rows as anon). The other two definer views went with ffAnalytics in §7.4.

All 62 functions with mutable `search_path` are pinned, applied by
`ALTER FUNCTION ... SET search_path` rather than by rewriting bodies, so no
function's behaviour could shift as a side effect.

## 5. Two hardcoded-2025 survivors found in SQL

§4 swept the JavaScript. These were in function bodies and were missed:

- **`create_pick_em_week`** defaulted every deadline from the literal
  `'2025-09-02 03:00:00-05'`. It now derives from `season_week_start()` and the
  `pickem_*_offset_days` / `pickem_*_time` columns P1 added. It also fixes a
  latent bug: `v_week_start_date` was assigned only inside the
  `p_submission_opens_at is null` branch, so passing an explicit open time with
  a null close time produced a NULL deadline.
- **`submit_playoff_picks`** fell back to `'2025-12-12 20:15:00-05'` when a
  season had no configured deadline — and it fails **closed**: for any 2026
  season without a `playoff_config` row, `now() > deadline` is already true and
  every submission would be rejected with "Submission deadline has passed". It
  now coalesces to `'infinity'`, matching what the `playoff_picks` RLS policy
  already did.

## 6. Bug found while verifying

`db.rosters.getTeamRoster` ordered embedded columns as `.order('player.position')`.
PostgREST needs `.order('position', { referencedTable: 'player' })`; written the
other way it emits a literal order key and the request 400s with "failed to
parse order (...)". **Every call failed**, and `hooks/queries/useLeague.js`
calls it from `useTeamRoster`. Pre-existing since the §5 split, unrelated to the
security work, found because the verification sweep exercised the read paths.
Fixed; the call now returns 13 players.

## 7. What is left

- **Leaked-password protection** is still disabled. It is an Auth dashboard
  toggle (Authentication → Policies → Password protection), not something SQL
  or the API can set.
- **21 SECURITY DEFINER functions remain callable by `anon`.** All are reads the
  public site depends on, plus `is_admin`/`can_write_league` themselves. Listed
  and reviewed individually.
- **3 materialised views are selectable over the API**
  (`mv_franchise_career_stats`, `mv_season_leaderboards`,
  `mv_transaction_leaderboards`). §2.5 calls this fine if intentionally public,
  which it is — the History tab renders them.
- **The ESPN credential is still unrotated**, item 1 of open items.
