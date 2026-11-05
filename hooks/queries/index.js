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
  useFranchiseProfiles,
  useMyFranchiseId,
  useSaveFranchiseProfile,
  useFranchiseAccounts,
  useSetFranchiseAccount
} from './useFranchiseProfiles.js';

export {
  useSeasons,
  useActiveSeason,
  useSeasonTeams,
  useSeasonGames,
  useDivisions,
  useStandings,
  useFaabLedger,
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
  useNow,
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
  useWeekPlayerStats,
  useCurrentLineups,
  useLineupsForWeek
} from './usePlayerStats.js';

export {
  useNflSeasonSchedule,
  useNflWeekSchedule,
  useNflOpponentMap,
  buildOpponentMap
} from './useNflSchedule.js';

export { usePlayerProfile, usePlayerCareers, usePlayerByEspnId } from './usePlayerProfile.js';

export {
  useMyParlayPick,
  useParlayWeekPicks,
  useSeasonParlayPicks,
  useSubmitParlayPick,
  usePlayerSearch,
  usePlayersByName,
  useIsParlayCommissioner,
  useLeagueMembers,
  useRoleHolders,
  useSetRoleHolders
} from './useParlay.js';

export { useParlayLive } from './useParlayLive.js';
export { useLiveWeek } from './useLiveWeek.js';

export { usePushNotifications } from './usePushNotifications.js';
export { useNotificationInbox, useInboxMutations, countUnread } from './useNotificationInbox.js';
export { useMyTaunts, useSendTaunt } from './useTaunts.js';

export {
  countPendingApprovals,
  useIsApprovedMember,
  useMemberApprovals,
  useSetMemberApproval,
  useDeleteMemberAccount
} from './useMemberApprovals.js';

export {
  useIsLeagueAdmin,
  useLeagueAdmins,
  useSetLeagueAdmin
} from './useLeagueAdmins.js';

export {
  useAwardsUnlockStatus,
  useAwards,
  useAwardResults,
  useAwardBallotSeasons,
  useAwardsMutations
} from './useAwards.js';

export { useTakesBoard, useTakeActivity, useTakesSeen, useTakesMutations } from './useTakes.js';

export { useSyncRuns, useAutomationHealth } from './useAutomations.js';

export {
  useHistoryTimeline,
  useHistoryFranchises,
  useChampionships,
  useSeasonDetail,
  useSeasonDetails,
  useHeadToHeadMatrix,
  useMatchupHistory,
  useMatchupStarters,
  useRecordBook,
  useRecordBooks,
  useRecordTrends,
  useStatComparison,
  useHomeRecordBooks,
  useFranchiseProfile,
  useDivisionTitles,
  useSituations,
  useTransactionLeaderboard,
  useFranchiseTransactions,
  useSeasonWeeks,
  usePlayerCareer
} from './useLeagueHistory.js';
export { useAskLeague } from './useAskLeague.js';
export { useAutosubAccess, useMyAutosubs, useAutosubMutations } from './useAutosubs.js';
