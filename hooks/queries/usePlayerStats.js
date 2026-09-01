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

/**
 * One week's rows, grouped by fantasy team: `{ [teamId]: rows }`.
 *
 * The live-week counterpart to `useSeasonPlayerStats`, whose `throughWeek` is
 * exclusive and so can never return the week you are looking at. This is what
 * the pick'ems research cards read, and it works because the sync writes the
 * coming week's *projections* on Tuesday at 04:00 ET — a whole pick'ems window
 * before that week's actual points exist.
 *
 * Grouping happens in `select`, so it runs on cache reads rather than on every
 * render of every consumer, and the raw rows stay in the cache once.
 */
export function useWeekPlayerStats(seasonId, week, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.playerStats.forWeek(seasonId, week),
    queryFn: () => db().playerWeekStats.getPlayerWeekStatsForWeek(seasonId, week),
    enabled: Boolean(seasonId) && Boolean(week) && enabled,
    select: (rows) => {
      const byTeam = {};
      for (const row of rows ?? []) (byTeam[row.teamId] ??= []).push(row);
      return byTeam;
    },
    // Projections are rewritten once a week by the cron, out of this process.
    staleTime: 10 * 60_000
  });
}

/**
 * The current starting lineups for a week, grouped `{ [teamId]: rows }`.
 *
 * What `useWeekPlayerStats` should have been for a present-tense question.
 * That hook reads `player_week_stats`, which the cron writes once a week, so
 * anything asking "who is starting *this* week" got an answer that was up to
 * seven days old — and, before a season starts, months old. This reads the
 * live `rosters` snapshot and layers the week's points onto it; see
 * `services/db/rosters.js::getCurrentLineupsForWeek` for the ordering.
 *
 * `useWeekPlayerStats` is still the right hook for a week that is over, where
 * the question is who actually started and the current roster would be an
 * anachronism.
 *
 * The `staleTime` is short on purpose. The rows behind it change whenever a
 * manager touches their lineup, which during a pick'ems window is constantly,
 * and the panel that reads it is opened to make a decision.
 */
export function useCurrentLineups(seasonId, week, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.rosters.lineupsForWeek(seasonId, week),
    queryFn: () => db().rosters.getCurrentLineupsForWeek(seasonId, week),
    enabled: Boolean(seasonId) && Boolean(week) && enabled,
    select: (rows) => {
      const byTeam = {};
      for (const row of rows ?? []) (byTeam[row.teamId] ??= []).push(row);
      return byTeam;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true
  });
}
