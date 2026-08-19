/**
 * Query keys, in one place.
 *
 * Every key starts with its domain, so `invalidateQueries({ queryKey: qk.games.all })`
 * reaches every games query without naming them. This is the whole point of the
 * exercise: `useSupabaseFantasyData` had one `refreshData()` that refetched
 * seasons, teams, games, rosters, divisions and standings after *any* mutation,
 * behind a full-screen overlay. A mutation should invalidate what it changed.
 *
 * Keys are arrays, ordered general → specific. Never build one inline in a
 * component; add it here so the invalidation side can find it.
 */

const scope = (domain) => ({
  all: [domain],
  /** Everything under one season. */
  season: (seasonId) => [domain, seasonId]
});

export const qk = {
  seasons: {
    all: ['seasons'],
    list: () => ['seasons', 'list'],
    active: () => ['seasons', 'active'],
    detail: (seasonId) => ['seasons', 'detail', seasonId]
  },

  teams: {
    ...scope('teams'),
    forSeason: (seasonId) => ['teams', seasonId, 'list']
  },

  divisions: {
    ...scope('divisions'),
    forSeason: (seasonId) => ['divisions', seasonId, 'list'],
    standings: (seasonId) => ['divisions', seasonId, 'standings']
  },

  games: {
    ...scope('games'),
    forSeason: (seasonId) => ['games', seasonId, 'list'],
    forWeek: (seasonId, week) => ['games', seasonId, 'week', week],
    completed: (seasonId, upToWeek = null) => ['games', seasonId, 'completed', upToWeek],
    completedWeeks: (seasonId) => ['games', seasonId, 'completedWeeks'],
    currentWeek: (seasonId) => ['games', seasonId, 'currentWeek']
  },

  rosters: {
    ...scope('rosters'),
    forSeason: (seasonId) => ['rosters', seasonId, 'all'],
    forTeam: (teamId) => ['rosters', 'team', teamId],
    stats: (seasonId) => ['rosters', seasonId, 'stats']
  },

  players: {
    all: ['players'],
    forSeason: (seasonId) => ['players', seasonId]
  },

  /**
   * Per-player, per-week scoring. Written out of process by the weekly sync, so
   * nothing in the app invalidates these — there is no mutation to hang an
   * `onSuccess` on. `useRankingsForWeek` needs no key of its own here: player
   * stats are an input of that query's own `queryFn`, not a separate cache
   * entry it composes.
   */
  playerStats: {
    ...scope('playerStats'),
    forSeason: (seasonId, throughWeek = null) =>
      ['playerStats', seasonId, 'season', throughWeek],
    forTeam: (seasonId, teamId) => ['playerStats', seasonId, 'team', teamId]
  },

  rankings: {
    ...scope('rankings'),
    /**
     * Rankings depend on the week being viewed *and* the week the league is
     * actually in — viewing week 3 in week 9 is a different calculation from
     * viewing week 3 live. Both belong in the key or the cache lies.
     */
    forViewedWeek: (seasonId, week, currentWeek) =>
      ['rankings', seasonId, 'viewed', week, currentWeek],
    history: (seasonId, week = null) => ['rankings', seasonId, 'history', week],
    snapshotWeeks: (seasonId) => ['rankings', seasonId, 'snapshotWeeks']
  },

  pickems: {
    ...scope('pickems'),
    week: (seasonId, week) => ['pickems', seasonId, 'week', week],
    allWeeks: (seasonId) => ['pickems', seasonId, 'weeks'],
    status: (seasonId) => ['pickems', seasonId, 'status'],
    gameData: (seasonId, week) => ['pickems', seasonId, 'gameData', week],
    standings: (seasonId) => ['pickems', seasonId, 'standings'],
    allSeasonPicks: (seasonId) => ['pickems', seasonId, 'allSeasonPicks'],
    userPicks: (pickEmWeekId, userId = null) => ['pickems', 'userPicks', pickEmWeekId, userId],
    allPicks: (pickEmWeekId) => ['pickems', 'allPicks', pickEmWeekId],
    scores: (pickEmWeekId) => ['pickems', 'scores', pickEmWeekId]
  },

  awards: {
    ...scope('awards'),
    unlockStatus: (seasonId) => ['awards', seasonId, 'unlockStatus']
  },

  /**
   * League history. Every entry spans seasons rather than living under one, so
   * this domain is keyed by what is being asked rather than by `seasonId`, and
   * the whole of it is invalidated when a season is finalized.
   */
  history: {
    all: ['history'],
    timeline: () => ['history', 'timeline'],
    franchises: () => ['history', 'franchises'],
    championships: () => ['history', 'championships'],
    seasonDetail: (seasonId) => ['history', 'season', seasonId],
    h2hMatrix: () => ['history', 'h2h', 'matrix'],
    matchup: (franchise1Id, franchise2Id) => ['history', 'h2h', franchise1Id, franchise2Id],
    recordBook: () => ['history', 'records'],
    franchiseProfile: (franchiseId) => ['history', 'franchise', franchiseId],
    transactionLeaderboard: () => ['history', 'transactions'],
    franchiseTransactions: (franchiseId) => ['history', 'transactions', franchiseId]
  },

  schedule: {
    all: ['schedule'],
    /** The ESPN import log. Written by scripts, read-only in the app. */
    history: (limit = 25) => ['schedule', 'history', limit]
  }
};

export default qk;
