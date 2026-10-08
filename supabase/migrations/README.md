# Database migrations

The production schema (`kvcnijyyfylxfarrlxkv`) is versioned here. Every schema
change is a file in this directory — nothing gets pasted into the Supabase SQL
editor, and nothing is applied through the MCP any more.

## Naming

`<UTC timestamp>_<snake_case_description>.sql`, e.g.
`20260903120000_member_approvals.sql`. Files apply in filename order.
`00000000000000_baseline_schema.sql` is the schema as dumped in August 2026;
everything after it is a change to that.

## How a migration reaches production

1. **On the PR**, CI's `migrations` job (`.github/workflows/ci.yml`) replays
   every file in this directory into a throwaway Postgres, diffs the result
   against the files, and runs the pgTAP tests in `supabase/tests/`. Invalid
   SQL, a wrong order, or a broken constraint fails the PR.
2. **On merge**, `.github/workflows/deploy-migrations.yml` links the production
   project and runs `supabase db push --include-all`. Every file the remote
   ledger (`supabase_migrations.schema_migrations`) has not recorded is
   applied, in filename order, and recorded. The run's summary lists what it
   applied.

So a migration is validated before it lands and applied the moment it does.
Do not also apply it by hand: a second apply records a second version and the
next push errors on it.

`--include-all` is deliberate, in the workflow and in `npm run db:push`. The
CLI's default pushes only files newer than the newest recorded version and
errors on an older one — which is what two PRs merging in the opposite order
from when their migrations were written looks like. The consequence is that
**a migration file on `main` will be applied by the next run**; a file nobody
wants applied must not be there.

## Applying by hand

Needed only to apply a migration before its PR merges (a bundle that cannot
tolerate the old schema), or to repair. Either:

- the workflow's *Run workflow* button, pointed at the branch — it pushes
  that branch's files, with a `dry_run` option that only lists them; or
- locally, once the CLI is linked:

```bash
npx supabase login                       # opens a browser for an access token
npx supabase link --project-ref kvcnijyyfylxfarrlxkv
npm run db:push:dry                      # list what is pending, change nothing
npm run db:push                          # apply it
npm run db:types                         # regenerate types/supabase.ts
```

Both write the file's own version to the ledger, so the merge's run then
finds nothing pending.

## The ledger

`supabase_migrations.schema_migrations` on the project holds one row per file
here, version and name taken from the filename. Before 2026-10-08 it did not:
the MCP had recorded its own apply-time versions (file
`20260828120000_td_parlay.sql` was version `20260831185117`) and 18 versions
from before the August squash were still listed, which is why `db push` refused
for two months. `supabase/repair/2026-10-08-ledger-matches-files.sql` rewrites
it to one row per file — run once, by hand, in the SQL editor, before the
workflow's first run. It keeps the old rows in
`supabase_migrations.schema_migrations_backup_20261008`, which is safe to drop.

To see both sides:

```bash
npx supabase migration list --linked
```

A file with no remote version is pending. A remote version with no file means
something was applied outside this directory; put the SQL in a file with that
version as its timestamp, or mark it reverted with
`supabase migration repair --status reverted <version>`.

## Secrets the workflow needs

Repository *Settings → Secrets and variables → Actions*:

- `SUPABASE_ACCESS_TOKEN` — a personal access token from
  <https://supabase.com/dashboard/account/tokens>.
- `SUPABASE_DB_PASSWORD` — the project's database password (*Project
  Settings → Database*). The push connects to Postgres directly; the
  service-role key the sync workflows hold is not enough.

Missing, the workflow's first step fails naming them. Nothing is applied.
