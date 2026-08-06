/**
 * Power ranking hooks.
 *
 * The old hook computed rankings three separate times for the same week: an
 * effect in `FantasyFootballApp` filled `weeklyRankings`, an effect inside
 * `useSupabaseFantasyData` filled `powerRankings`, and both re-ran whenever
 * `refreshData()` replaced the `activeSeason` object identity — which every
 * mutation did. `calculateRankingsForViewedWeek` reads teams, games, players,
 * divisions and the season row on each call, so that was five queries per
 * duplicate run.
 *
 * One query key per (season, viewed week, actual week) collapses all of it.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';
import { useViewedWeek } from './useWeek.jsx';

const db = () => getDb();

/**
 * Rankings as of a given week.
 *
 * `week` is the week being viewed; `currentWeek` is the week the league is
 * actually in. The calculator needs both — viewing week 3 during week 9 uses
 * only weeks 1-2 of data but still resolves rank *changes* against stored
 * history — so both are in the key.
 */
export function useRankingsForWeek(seasonId, week, currentWeek) {
  return useQuery({
    queryKey: qk.rankings.forViewedWeek(seasonId, week, currentWeek),
    queryFn: () =>
      db().rankings.calculateRankingsForViewedWeek(seasonId, {
        week,
        viewingWeek: week,
        currentWeek
      }),
    enabled: Boolean(seasonId) && Boolean(week),
    // The calculation is the expensive one in the app; hold it longer than the
    // default and let mutations invalidate it explicitly.
    staleTime: 5 * 60_000
  });
}

/** Rankings for whatever week the user is currently looking at. */
export function useViewedWeekRankings(seasonId) {
  const { viewedWeek, actualWeek } = useViewedWeek();
  return useRankingsForWeek(seasonId, viewedWeek, actualWeek);
}

export function useRankingsHistory(seasonId, week = null) {
  return useQuery({
    queryKey: qk.rankings.history(seasonId, week),
    queryFn: () => db().rankings.getPowerRankingsHistory(seasonId, week),
    enabled: Boolean(seasonId)
  });
}

export function useAvailableSnapshotWeeks(seasonId) {
  return useQuery({
    queryKey: qk.rankings.snapshotWeeks(seasonId),
    queryFn: () => db().rankings.getAvailableSnapshotWeeks(seasonId),
    enabled: Boolean(seasonId)
  });
}

/** Admin action: write a snapshot of a week's rankings to history. */
export function useSaveSnapshot(seasonId) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ week, snapshotType = 'manual' }) =>
      db().rankings.saveWeeklyPowerRankingsSnapshot(seasonId, week, snapshotType),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.rankings.season(seasonId) })
  });
}
