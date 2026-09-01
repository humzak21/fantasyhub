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
    forSeason: (seasonId) => ['players', seasonId],
    /**
     * The parlay autocomplete. Keyed on the *debounced* term, so the cache
     * holds one entry per query the user actually paused on rather than one
     * per keystroke.
     */
    search: (query) => ['players', 'search', query]
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
    forTeam: (seasonId, teamId) => ['playerStats', seasonId, 'team', teamId],
    /**
     * One week, inclusive — a different question from `forSeason`, whose
     * `throughWeek` is exclusive. Separate keys because they are separate
     * queries; sharing one would make "weeks 1-3" and "week 3" collide.
     */
    forWeek: (seasonId, week) => ['playerStats', seasonId, 'week', week]
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

  /**
   * The weekly TD parlay. `season` is the dashboard's whole-season read;
   * `weekPicks` is the league's picks for one week, which RLS empties before
   * the deadline — so it is a genuinely different cache entry from `myPick`
   * and cannot be derived from it.
   */
  parlay: {
    ...scope('parlay'),
    season: (seasonId) => ['parlay', seasonId, 'season'],
    myPick: (pickEmWeekId, userId = null) => ['parlay', 'myPick', pickEmWeekId, userId],
    weekPicks: (pickEmWeekId) => ['parlay', 'weekPicks', pickEmWeekId]
  },

  /**
   * What the *viewer* is allowed to do, as opposed to what the league contains.
   * Keyed by user id so signing in as somebody else cannot read a cached yes.
   */
  viewer: {
    all: ['viewer'],
    parlayCommissioner: (userId) => ['viewer', 'parlayCommissioner', userId]
  },

  /**
   * Role administration. Separate from `viewer` on purpose: `viewer` answers
   * "what may *I* do" and is cached per user, while these answer "who holds
   * what" and are admin-only reads. Granting a role invalidates both, because
   * the grantee's own answer has changed too.
   */
  roles: {
    all: ['roles'],
    members: () => ['roles', 'members'],
    parlayCommissioners: () => ['roles', 'parlayCommissioners']
  },

  /**
   * `results` sits under `awards.season(seasonId)`, so the invalidations in
   * `useAwardsMutations` reach it and a submitted vote refreshes the charts.
   * `ballotSeasons` deliberately does not: the set of seasons that have a
   * ballot changes once a year, not once a vote.
   */
  awards: {
    ...scope('awards'),
    unlockStatus: (seasonId) => ['awards', seasonId, 'unlockStatus'],
    results: (seasonId) => ['awards', seasonId, 'results'],
    ballotSeasons: () => ['awards', 'ballotSeasons']
  },

  /**
   * The predictions board. Every key starts `['takes', seasonId, …]` so a
   * mutation can invalidate the whole domain with `qk.takes.season(seasonId)`
   * and reach all of it — deliberately unlike `pickems.userPicks`, which is
   * keyed `['pickems', 'userPicks', …]` and so is missed by exactly that
   * prefix.
   *
   * There is no per-take key: the detail sheet reads its take out of the board
   * entry by id rather than fetching it again.
   */
  takes: {
    ...scope('takes'),
    board: (seasonId) => ['takes', seasonId, 'board']
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
