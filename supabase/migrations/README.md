# Database migrations

The production schema (`kvcnijyyfylxfarrlxkv`) is versioned here. Every schema
change is a file in this directory — nothing gets pasted into the Supabase SQL
editor any more.

## Naming

`<UTC timestamp>_<snake_case_description>.sql`, e.g.
`20260803120000_season_config_backbone.sql`. Files apply in filename order.

## Applying

```bash
npm run db:push          # apply pending migrations to the remote project
npm run db:push:dry      # show what would be applied, change nothing
npm run db:types         # regenerate types/supabase.ts from the live schema
```

`db:push` needs the CLI to be linked once:

```bash
npx supabase login                       # opens a browser for an access token
npx supabase link --project-ref kvcnijyyfylxfarrlxkv
```

## Baseline — required, and not done yet

There is **no baseline dump**. The pre-existing schema (40 tables, ~66
functions) was created by hand in the SQL editor before this directory existed,
so `00000000000000_baseline_placeholder.sql` is a no-op marker.

The consequence showed up in CI: replaying the chain onto an empty database
fails immediately on

```
ERROR: relation "public.seasons" does not exist (SQLSTATE 42P01)
At statement: 0  -- 20260803120100_season_config_backbone.sql
```

...because there is no `seasons` table for the first real migration to alter.
The migration job in `.github/workflows/ci.yml` therefore **skips the replay**
until a real baseline exists, and turns itself back on automatically once one
does. It looks for `CREATE TABLE|SCHEMA|TYPE` at the start of a line in
`00000000000000_*.sql`.

### Capturing it

Needs the database password, so it cannot be done from CI or by an agent:

```bash
npx supabase login
npx supabase link --project-ref kvcnijyyfylxfarrlxkv
npx supabase db dump -f supabase/migrations/00000000000000_baseline_schema.sql
git rm supabase/migrations/00000000000000_baseline_placeholder.sql
```

Then **archive the migrations the dump already contains**, because they are not
replayable on top of it:

```bash
mkdir -p ../../aug2026_refactor/migrations-history
git mv 2026*.sql ../../aug2026_refactor/migrations-history/
```

This is not optional tidying. The P1 migrations backfill data —
`insert into public.seasons`, `... teams`, `... games` from the `historical_*`
tables — and add constraints and views without `if not exists`. Replayed over a
baseline that already contains their results they would double-insert rows and
fail on duplicate constraints. Squashing is the only order that works.

Archiving them locally does not disturb production: its `schema_migrations`
ledger keeps every version, and `db push` only ever applies files the remote has
not seen. Their rationale is preserved in
[`aug2026_refactor/`](../../aug2026_refactor/README.md), which is the reason to
archive rather than delete.

After the squash, `supabase/migrations/` holds one baseline plus whatever is
authored from that point on, and the CI replay becomes a live gate.

