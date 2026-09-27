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
import { buildRecordBook } from '../../utils/recordBook/index.js';
import { buildRecordTrends } from '../../utils/recordTrend.js';
import { buildSeasonIndex } from '../../utils/franchiseWeeks.js';
import { buildComparisonFacts } from '../../utils/statComparison/index.js';
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

/**
 * The whole record book: every leaderboard, all-time and per season.
 *
 * The query caches the source rows; `buildRecordBook` runs in `select`, which
 * TanStack memoises against the cached data (the function is module-level, so
 * its identity is stable). Switching tabs or seasons re-ranks rows in the
 * component and never re-fetches or re-computes the book.
 */
export function useRecordBook() {
  return useQuery({
    queryKey: qk.history.recordBook(),
    queryFn: () => db().history.getRecordBookSource(),
    select: buildRecordBook,
    ...STABLE
  });
}

/**
 * Every franchise's record, week by week, for the profile's trend chart.
 *
 * League-wide rather than per franchise: the chart compares any teams the
 * reader picks, and one cached source means adding a team fetches nothing.
 * `buildRecordTrends` runs in `select`, memoised like the record book.
 */
export function useRecordTrends() {
  return useQuery({
    queryKey: qk.history.recordTrends(),
    queryFn: () => db().history.getRecordTrendSource(),
    select: buildRecordTrends,
    ...STABLE
  });
}

/**
 * The History overview's stat comparison: every franchise-season's facts.
 *
 * The record book's own query — same key, same fetch — with a different
 * `select`, so opening Records after the comparison (or the other way round)
 * fetches nothing. TanStack runs each observer's `select` against the one
 * cached source. `enabled` lets the card wait until it is scrolled near, since
 * the overview is the tab's landing view and this is its largest read.
 */
export function useStatComparison({ enabled = true } = {}) {
  return useQuery({
    queryKey: qk.history.recordBook(),
    queryFn: () => db().history.getRecordBookSource(),
    select: buildComparisonFacts,
    enabled,
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

/**
 * One season, week by week, for the franchise profile. The raw source is
 * indexed once per fetch in `select` (`buildSeasonIndex`), so moving between
 * weeks or franchises inside a season is a lookup, not a request.
 *
 * Freshness follows how the data moves. A completed season never changes, so
 * it is cached for good. A season in progress gains a week every Tuesday from
 * the sync, out of process — there is no mutation to invalidate on — so it
 * goes stale after a minute and refetches when the window regains focus.
 */
export function useSeasonWeeks(seasonId, { isCompleted = false, enabled = true } = {}) {
  return useQuery({
    queryKey: qk.history.seasonWeeks(seasonId),
    queryFn: () => db().history.getSeasonWeekSource(seasonId),
    select: buildSeasonIndex,
    enabled: Boolean(seasonId) && enabled,
    staleTime: isCompleted ? Infinity : 60 * 1000,
    refetchOnWindowFocus: !isCompleted
  });
}

/** A player's league career, for the player sheet. Fetched when it opens. */
export function usePlayerCareer(playerId, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.history.playerCareer(playerId),
    queryFn: () => db().history.getPlayerCareer(playerId),
    enabled: Boolean(playerId) && enabled,
    ...STABLE
  });
}
