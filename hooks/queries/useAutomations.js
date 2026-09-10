/**
 * The automation dashboard's two reads, for Settings → Automations.
 *
 * Both are admin-only by `enabled`, not by policy: `sync_runs` is public-read
 * like every league table, and the health read touches nothing a visitor
 * cannot already see. The gate here is so a member's browser does not spend
 * ten queries on a panel it will never render.
 *
 * There are no mutations. The jobs run in GitHub Actions and write with the
 * service-role key; the browser can only watch. So the cache refreshes on
 * focus and on a timer rather than on an `onSuccess` — the admin who opens
 * the page after pressing "Run workflow" should see the row appear.
 */

import { useQuery } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useAuth } from '../../src/contexts/AuthContext.jsx';
import { qk } from './keys.js';

const db = () => getDb();

const REFRESH_MS = 60_000;

/** Recent `sync_runs` rows, newest first. `seasonId: null` reads every season. */
export function useSyncRuns({ seasonId = null, limit = 40, enabled = true } = {}) {
  const { isAdmin, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: qk.automations.runs(seasonId, limit),
    queryFn: () => db().syncRuns.getSyncRuns({ seasonId, limit }),
    enabled: enabled && Boolean(isAuthenticated && isAdmin),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS
  });
}

/** What the jobs have left in their tables for one season. Null until there is a season. */
export function useAutomationHealth({ seasonId, seasonYear, throughWeek = 0, enabled = true } = {}) {
  const { isAdmin, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: qk.automations.health(seasonId ?? null, seasonYear ?? null, throughWeek),
    queryFn: () => db().syncRuns.getAutomationHealth({ seasonId, seasonYear, throughWeek }),
    enabled: enabled && Boolean(isAuthenticated && isAdmin && seasonId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: REFRESH_MS
  });
}
