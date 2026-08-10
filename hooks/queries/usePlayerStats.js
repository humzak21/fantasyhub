/**
 * Per-player, per-week scoring.
 *
 * The power ranking consumes this inside `calculateRankingsForViewedWeek`, not
 * through these hooks — a query that composed two other queries would cache the
 * same rows twice and let them drift. These exist for the UI that wants to show
 * the underlying rows directly (who a team started in week 6, and what they
 * scored), which no component could ask before because nothing week-grained was
 * stored.
 *
 * There are no mutations. The table is written by `scripts/sync-week.js`, which
 * runs as a GitHub Actions cron, out of this process entirely.
 */

import { useQuery } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

/**
 * Every stored player-week of a season, grouped `{ [teamId]: { [week]: rows } }`.
 *
 * `throughWeek` is exclusive, matching the calculator's cutoff: viewing week 5
 * sees weeks 1-4.
 */
export function useSeasonPlayerStats(seasonId, throughWeek = null) {
  return useQuery({
    queryKey: qk.playerStats.forSeason(seasonId, throughWeek),
    queryFn: () => db().playerWeekStats.getPlayerWeekStats(seasonId, { throughWeek }),
    enabled: Boolean(seasonId),
    // A completed week never changes, and the only writer is a weekly cron.
    staleTime: 10 * 60_000
  });
}

/** One team's weeks, `{ [week]: rows }`. Empty object when nothing is stored. */
export function useTeamPlayerStats(seasonId, teamId, throughWeek = null) {
  const query = useSeasonPlayerStats(seasonId, throughWeek);

  return {
    ...query,
    data: teamId && query.data ? query.data[teamId] ?? {} : undefined
  };
}
