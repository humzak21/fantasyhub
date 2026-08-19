/**
 * League history hooks, one query per thing.
 *
 * These replace `src/hooks/useLeagueHistory.js`, a 660-line hook that held
 * fourteen pieces of state, hand-rolled a five-minute cache, and ran a
 * four-call `initialize()` on mount — once per component that used it, which
 * was six of them. Every screen therefore refetched the whole of league history
 * on every tab change, and the caches disagreed with each other.
 *
 * TanStack does the deduplication now: six components asking for the timeline
 * is one request. Everything goes through `services/db/history.js`; nothing
 * here talks to Supabase directly.
 */

import { useQueries, useQuery } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

/**
 * History changes when a season is finalized, which is a handful of times a
 * year. Refetching it on every window focus is pure waste.
 */
const STABLE = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false };

export function useHistoryTimeline() {
  return useQuery({
    queryKey: qk.history.timeline(),
    queryFn: () => db().history.getSeasonsTimeline(),
    ...STABLE
  });
}

/**
 * Every franchise with its career record on the same row.
 *
 * The components take `franchises` and `careerStats` as separate props for
 * historical reasons; both are this list.
 */
export function useHistoryFranchises() {
  return useQuery({
    queryKey: qk.history.franchises(),
    queryFn: () => db().history.getFranchisesWithCareerStats(),
    ...STABLE
  });
}

export function useChampionships() {
  return useQuery({
    queryKey: qk.history.championships(),
    queryFn: () => db().history.getChampionships(),
    ...STABLE
  });
}

export function useSeasonDetail(seasonId) {
  return useQuery({
    queryKey: qk.history.seasonDetail(seasonId),
    queryFn: () => db().history.getSeasonDetail(seasonId),
    enabled: Boolean(seasonId),
    ...STABLE
  });
}

/**
 * The detail behind several seasons at once, sharing `useSeasonDetail`'s cache.
 *
 * The awards gallery shows every season's awards side by side. Keyed per
 * season rather than fetched as one blob so opening a single season costs
 * nothing extra.
 */
export function useSeasonDetails(seasonIds = []) {
  return useQueries({
    queries: seasonIds.map((seasonId) => ({
      queryKey: qk.history.seasonDetail(seasonId),
      queryFn: () => db().history.getSeasonDetail(seasonId),
      ...STABLE
    }))
  });
}

export function useHeadToHeadMatrix() {
  return useQuery({
    queryKey: qk.history.h2hMatrix(),
    queryFn: () => db().history.getHeadToHeadMatrix(),
    ...STABLE
  });
}

export function useMatchupHistory(franchise1Id, franchise2Id) {
  return useQuery({
    queryKey: qk.history.matchup(franchise1Id, franchise2Id),
    queryFn: () => db().history.getMatchupHistory(franchise1Id, franchise2Id),
    enabled: Boolean(franchise1Id) && Boolean(franchise2Id),
    ...STABLE
  });
}

/** The record book, the single-season records and the all-time boards. */
export function useRecordBook() {
  return useQuery({
    queryKey: qk.history.recordBook(),
    queryFn: async () => {
      const [records, singleSeason, allTime] = await Promise.all([
        db().history.getRecordBook(),
        db().history.getSingleSeasonRecords(),
        db().history.getAllTimeLeaderboards()
      ]);
      return { records, singleSeason, allTime };
    },
    ...STABLE
  });
}

export function useFranchiseProfile(franchiseId) {
  return useQuery({
    queryKey: qk.history.franchiseProfile(franchiseId),
    queryFn: () => db().history.getFranchiseProfile(franchiseId),
    enabled: Boolean(franchiseId),
    ...STABLE
  });
}

export function useTransactionLeaderboard() {
  return useQuery({
    queryKey: qk.history.transactionLeaderboard(),
    queryFn: () => db().transactions.getTransactionLeaderboard(),
    ...STABLE
  });
}

export function useFranchiseTransactions(franchiseId) {
  return useQuery({
    queryKey: qk.history.franchiseTransactions(franchiseId),
    queryFn: () => db().transactions.getFranchiseTransactionHistory(franchiseId),
    enabled: Boolean(franchiseId),
    ...STABLE
  });
}
