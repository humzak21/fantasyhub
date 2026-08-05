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

## Baseline

There is **no baseline dump yet** — the pre-existing schema (40 tables, ~66
functions) was created by hand before this directory existed, so migration
`00000000000000_baseline_placeholder.sql` is intentionally a no-op marker.

To capture the real baseline once the CLI is linked:

```bash
npx supabase db pull baseline_schema
```

That writes the current remote schema as a migration and marks it applied
remotely, so it will not try to re-run against production. Do this before
authoring any further migrations.

## Rules

- Migrations are **forward-only** and must be idempotent where cheap
  (`IF NOT EXISTS`, `CREATE OR REPLACE`). A re-run should never destroy data.
- Never edit a migration that has been applied to production; write a new one.
- Backfills belong in migrations too — data shape and data move together.
- Anything destructive (`DROP TABLE`, `DROP COLUMN`) goes in its own migration,
  applied only after the new read path has been verified in production.
