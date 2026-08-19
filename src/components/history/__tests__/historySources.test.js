/**
 * The History tab reads the live tables, and only the live tables.
 *
 * Two data universes is what broke it: `historical_*` and friends were filled
 * once, in November 2025, by scripts that no longer exist, so 2025 could never
 * appear there no matter what the app did. Now that the tab reads
 * `seasons`/`teams`/`games` through the unified views, a stray import of the
 * old path would quietly resurrect the split — and it would look like it worked,
 * because the stale tables still hold five seasons of plausible data.
 *
 * This is a grep, deliberately: the failure it guards against is a file being
 * added, not a function returning the wrong thing.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, it, expect } from 'vitest';

// Vitest runs from the repo root; `import.meta.url` is a virtual URL under
// jsdom and cannot be resolved to a path.
const repoRoot = resolve(process.cwd()) + '/';

/** Names that only ever appear in the pre-2026 history path. */
const RETIRED = [
  'leagueHistoryManager',
  'historical_seasons',
  'historical_teams',
  'historical_games',
  'season_awards',
  'head_to_head_records',
  'franchise_records',
  'mv_franchise_career_stats',
  'mv_season_leaderboards',
  'mv_transaction_leaderboards',
  'transactions_2025',
  'team_transactions'
];

const SEARCH_ROOTS = ['src', 'hooks', 'services', 'scripts', 'utils'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '__tests__']);

function sourceFiles(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

describe('the history tab reads the live schema', () => {
  const files = SEARCH_ROOTS.flatMap((root) => sourceFiles(join(repoRoot, root)));

  it.each(RETIRED)('nothing references %s', (name) => {
    // Whole identifiers only, or `compute_season_awards` reads as a use of
    // `season_awards`.
    const reference = new RegExp(`(?<![\\w])${name}(?![\\w])`);

    const offenders = files.filter((path) => {
      const source = readFileSync(path, 'utf8');
      // The new modules name the old ones in their comments to explain what
      // they replaced; only code references matter.
      return source
        .split('\n')
        .some((line) => reference.test(line) && !/^\s*(\*|\/\/|--)/.test(line));
    });

    expect(offenders.map((path) => path.replace(repoRoot, ''))).toEqual([]);
  });
});
