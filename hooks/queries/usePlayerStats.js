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

/**
 * The lineups for a week, from whichever table can answer for it.
 *
 * The past/present rule in one place. A week that is over is a past-tense
 * question — who actually started, and what they actually scored — and that is
 * `player_week_stats`. A week that has not finished is a present-tense
 * question, which that table cannot answer: the cron writes it once, so
 * between two syncs it describes a roster that has since taken waivers and
 * changed its lineup, and on 2026-08-31 it named 122 of 125 starters wrongly.
 *
 * This exists because two things now ask it — the Schedule card's projected
 * score line and the lineup disclosure underneath it — and a card whose score
 * came from one table while its lineup came from the other would be a total
 * that does not add up to the rows below it.
 *
 * Both hooks are always called and gated by `enabled`, so exactly one fetches
 * and the hook order never changes. `actualWeek` is passed in rather than read
 * from context, which keeps this usable from anywhere and keeps the comparison
 * explicit: it is deliberately *not* the viewed week — navigating to week 3 in
 * November must still read week 3 as history.
 *
 * **`actualWeek: null` means "not known yet", and nothing fetches.** That case
 * has to be representable, because `useActualWeek()` returns `1` while the
 * season is still loading and a `1` is indistinguishable from a real week 1 —
 * the same trap as gating on `isAuthenticated` before `isAuthLoading` clears.
 * Collapsed to a number, every historical week looks live for one render, which
 * fires the wrong query and briefly totals a finished week off the *current*
 * roster. `isLoading` is true in that state because, from the caller's side,
 * it is: the answer is coming, we just cannot ask yet.
 *
 * @param {string} seasonId
 * @param {number} week       the week being displayed
 * @param {{ actualWeek?: number|null, enabled?: boolean }} options
 * @returns {{ data: object|undefined, isLoading: boolean, isPastWeek: boolean }}
 *   `data` is `{ [teamId]: rows }`, the shape both underlying hooks select to.
 */
export function useLineupsForWeek(seasonId, week, { actualWeek = null, enabled = true } = {}) {
  const known = actualWeek != null;
  const isPastWeek = known && Boolean(week) && week < actualWeek;

  const past = useWeekPlayerStats(seasonId, week, {
    enabled: enabled && known && isPastWeek
  });
  const live = useCurrentLineups(seasonId, week, {
    enabled: enabled && known && !isPastWeek
  });

  const source = isPastWeek ? past : live;

  return {
    data: known ? source.data : undefined,
    isLoading: !known || source.isLoading,
    isPastWeek
  };
}
