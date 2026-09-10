/**
 * Everything the automation dashboard renders, assembled once.
 *
 * Composes the two admin reads with the season config and the clock, and
 * runs the pure catalog over them. Exported separately from the component
 * so the Settings sidebar can show the attention count without mounting the
 * panel — the same reason `useMemberApprovals` feeds both the queue and its
 * badge.
 */

import { useMemo } from 'react';

import {
  useActiveSeason,
  useActualWeek,
  useSeasonConfig,
  useSyncRuns,
  useAutomationHealth
} from '../../../../hooks/queries/index.js';
import {
  AUTOMATIONS,
  buildRecommendations,
  countAttention,
  seasonState,
  summarizeAutomation
} from './automationCatalog.js';

export function useAutomationReport({ enabled = true, limit = 40 } = {}) {
  const { data: season = null, isLoading: seasonLoading } = useActiveSeason();
  const config = useSeasonConfig();
  const actualWeek = useActualWeek();

  // Every season's runs, not just the active one: before week 1 the
  // interesting rows are last season's, and a run against the wrong season
  // is exactly the kind of thing this page exists to show.
  const runsQuery = useSyncRuns({ seasonId: null, limit, enabled });
  const healthQuery = useAutomationHealth({
    seasonId: season?.id ?? null,
    seasonYear: config?.espnSeasonYear ?? null,
    throughWeek: Math.max(0, (actualWeek ?? 1) - 1),
    enabled
  });

  const runs = runsQuery.data;
  const health = healthQuery.data;
  const runsLoading = runsQuery.isLoading;
  const healthLoading = healthQuery.isLoading;
  const runsError = runsQuery.error;
  const healthError = healthQuery.error;
  const refetchRuns = runsQuery.refetch;
  const refetchHealth = healthQuery.refetch;

  return useMemo(() => {
    const now = new Date();
    const state = seasonState(season, config, now);
    const rows = runs ?? [];
    const summaries = AUTOMATIONS.map((automation) =>
      summarizeAutomation(automation, rows, { now, state })
    );
    const recommendations = buildRecommendations({
      summaries,
      health: health ?? null,
      config,
      state,
      actualWeek: config?.startDate ? actualWeek : null,
      now
    });

    return {
      now,
      season,
      config,
      state,
      actualWeek,
      runs: rows,
      summaries,
      health: health ?? null,
      recommendations,
      attention: countAttention(recommendations),
      isLoading: seasonLoading || runsLoading || (Boolean(season?.id) && healthLoading),
      error: runsError ?? healthError ?? null,
      refetch: () => Promise.all([refetchRuns(), refetchHealth()])
    };
  }, [
    season, config, actualWeek, seasonLoading,
    runs, health, runsLoading, healthLoading, runsError, healthError, refetchRuns, refetchHealth
  ]);
}
