/**
 * Pick'em hooks.
 *
 * These retire the hand-rolled preloader in `FantasyFootballApp.jsx` — ~70
 * lines of sequential `await`s that fetched the week, game data, status,
 * standings, all-season picks, this week's picks and scores into a single
 * `preloadedPickemsData` object, then prop-drilled it into `PickEmsManager`
 * alongside a `preloadingInProgress` flag. It re-ran in full whenever the
 * `activeSeason` object identity changed, and `PickEmsManager` had to fetch
 * everything again anyway when the preload lost the race.
 *
 * A query cache is exactly that preloader, done correctly: shared between
 * components, deduplicated, and individually invalidatable.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

export function usePickEmWeek(seasonId, week) {
  return useQuery({
    queryKey: qk.pickems.week(seasonId, week),
    queryFn: () => db().pickems.getPickEmWeek(seasonId, week),
    enabled: Boolean(seasonId) && Boolean(week)
  });
}

export function useAllPickEmWeeks(seasonId) {
  return useQuery({
    queryKey: qk.pickems.allWeeks(seasonId),
    queryFn: () => db().pickems.getAllPickEmWeeks(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function usePickEmStatus(seasonId) {
  return useQuery({
    queryKey: qk.pickems.status(seasonId),
    queryFn: () => db().pickems.getPickEmStatus(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function usePickEmGameData(seasonId, week) {
  return useQuery({
    queryKey: qk.pickems.gameData(seasonId, week),
    queryFn: () => db().pickems.getPickEmGameData(seasonId, week),
    enabled: Boolean(seasonId) && Boolean(week)
  });
}

export function usePickEmStandings(seasonId) {
  return useQuery({
    queryKey: qk.pickems.standings(seasonId),
    queryFn: () => db().pickems.getSeasonPickEmStandings(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function useAllSeasonPicks(seasonId) {
  return useQuery({
    queryKey: qk.pickems.allSeasonPicks(seasonId),
    queryFn: () => db().pickems.getAllSeasonPicks(seasonId),
    enabled: Boolean(seasonId)
  });
}

/**
 * The signed-in user's picks for a week. `enabled` is the authentication gate:
 * an anonymous visitor issues no query at all rather than one that returns [].
 */
export function useUserPicks(pickEmWeekId, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.pickems.userPicks(pickEmWeekId),
    queryFn: () => db().pickems.getUserPicksForWeek(pickEmWeekId),
    enabled: Boolean(pickEmWeekId) && enabled
  });
}

/** Everyone's picks — only meaningful once the week's results are revealed. */
export function useAllPicks(pickEmWeekId, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.pickems.allPicks(pickEmWeekId),
    queryFn: () => db().pickems.getAllPicksForWeek(pickEmWeekId),
    enabled: Boolean(pickEmWeekId) && enabled
  });
}

export function useWeeklyPickEmScores(pickEmWeekId, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.pickems.scores(pickEmWeekId),
    queryFn: () => db().pickems.getWeeklyPickEmScores(pickEmWeekId),
    enabled: Boolean(pickEmWeekId) && enabled
  });
}

/**
 * Has the signed-in user submitted picks for this week?
 *
 * Drives the nav-tab notification dot. Two chained queries rather than the
 * old bespoke `checkUserPicksSubmission` effect, and the results are the same
 * cache entries the pick'ems tab itself uses — so opening the tab is free.
 */
export function useHasSubmittedPicks(seasonId, week, { enabled = true } = {}) {
  const weekQuery = usePickEmWeek(seasonId, week);
  const picksQuery = useUserPicks(weekQuery.data?.id, {
    enabled: enabled && Boolean(weekQuery.data?.id)
  });

  return {
    hasSubmitted: (picksQuery.data?.length ?? 0) > 0,
    isLoading: weekQuery.isLoading || picksQuery.isLoading
  };
}

export function usePickEmMutations(seasonId) {
  const queryClient = useQueryClient();
  const invalidateSeason = () =>
    queryClient.invalidateQueries({ queryKey: qk.pickems.season(seasonId) });

  const submitPicks = useMutation({
    mutationFn: ({ pickEmWeekId, picks }) => db().pickems.submitPickEmPicks(pickEmWeekId, picks),
    onSuccess: (_result, { pickEmWeekId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.pickems.userPicks(pickEmWeekId) }),
        invalidateSeason()
      ])
  });

  const calculateResults = useMutation({
    mutationFn: (pickEmWeekId) => db().pickems.calculatePickEmResults(pickEmWeekId),
    // Results change scores, standings and everyone's visible picks at once.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.pickems.all })
  });

  const createWeek = useMutation({
    mutationFn: ({ week, customSchedule = null }) =>
      db().pickems.createPickEmWeek(seasonId, week, customSchedule),
    onSuccess: invalidateSeason
  });

  const createWeeksForSeason = useMutation({
    mutationFn: ({ startWeek = 1, endWeek = null } = {}) =>
      db().pickems.createPickEmWeeksForSeason(seasonId, startWeek, endWeek),
    onSuccess: invalidateSeason
  });

  return { submitPicks, calculateResults, createWeek, createWeeksForSeason };
}
