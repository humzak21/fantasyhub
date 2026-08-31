/**
 * The query layer. One import site for components.
 *
 * Replaces `hooks/useSupabaseFantasyData.js` — 913 lines returning 60+
 * callbacks and all app state, where every mutation called `refreshData()` and
 * every consumer re-rendered behind a full-screen overlay. Data access now sits
 * on `services/db/` (§5) with TanStack Query owning caching, loading and error
 * state per query.
 */

export { qk } from './keys.js';
export { createQueryClient } from './queryClient.js';

export {
  useSeasons,
  useActiveSeason,
  useSeasonTeams,
  useSeasonGames,
  useDivisions,
  useStandings,
  useSeasonRosters,
  useTeamRoster,
  useCompletedWeeks,
  useGamesForWeek,
  useLeagueData,
  useLeagueMutations
} from './useLeague.js';

export {
  ViewedWeekProvider,
  useViewedWeek,
  useActualWeek,
  useSeasonConfig
} from './useWeek.jsx';

export {
  useRankingsForWeek,
  useViewedWeekRankings,
  useRankingsHistory,
  useAvailableSnapshotWeeks,
  useSaveSnapshot
} from './useRankings.js';

export {
  usePickEmWeek,
  useAllPickEmWeeks,
  usePickEmStatus,
  usePickEmGameData,
  usePickEmStandings,
  useAllSeasonPicks,
  useUserPicks,
  useAllPicks,
  useWeeklyPickEmScores,
  useHasSubmittedPicks,
  usePickEmMutations
} from './usePickEms.js';

export {
  useSeasonPlayerStats,
  useTeamPlayerStats,
  useWeekPlayerStats
} from './usePlayerStats.js';

export {
  useMyParlayPick,
  useParlayWeekPicks,
  useSeasonParlayPicks,
  useSubmitParlayPick,
  usePlayerSearch,
  useIsParlayCommissioner,
  useLeagueMembers,
  useParlayCommissioners,
  useSetParlayCommissioners
} from './useParlay.js';

export { useAwardsUnlockStatus, useAwards, useAwardsMutations } from './useAwards.js';

export {
  useHistoryTimeline,
  useHistoryFranchises,
  useChampionships,
  useSeasonDetail,
  useSeasonDetails,
  useHeadToHeadMatrix,
  useMatchupHistory,
  useRecordBook,
  useFranchiseProfile,
  useTransactionLeaderboard,
  useFranchiseTransactions
} from './useLeagueHistory.js';
