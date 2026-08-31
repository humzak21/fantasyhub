// Data models and types for fantasy football power rankings system

import { derivePickEmSchedule, getSeasonConfig } from '../utils/seasonConfig.js';

export const PLAYOFF_TYPES = {
  PLAYOFF: 'playoff',
  CHAMPIONSHIP: 'championship',
  CONSOLATION: 'consolation'
};

export const GAME_TYPES = {
  REGULAR: 'regular',
  PLAYOFF: 'playoff',
  CHAMPIONSHIP: 'championship'
};

// Player data structure within roster
export const createPlayer = (playerId, playerName, position) => ({
  playerId,
  playerName,
  position,
  proTeam: null,
  proTeamName: '',
  rosterSlot: null,
  acquisitionType: null,
  isActive: false,

  // Points data
  projectedPoints: 0,
  actualPoints: 0,
  seasonProjectedPoints: 0,
  seasonActualPoints: 0,
  gamesPlayed: 0,
  averagePointsPerGame: 0,
  projectedAverage: 0,

  // Additional player info
  injuryStatus: 'ACTIVE',
  percentOwned: 0,
  percentStarted: 0,

  // Sync tracking
  lastStatsSync: null,
  updatedAt: new Date().toISOString()
});

// Division data structure
export const createDivision = (id, seasonId, name = 'Division', displayOrder = 1) => ({
  id,
  seasonId,
  name,
  displayOrder,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

// Team data structure
export const createTeam = (id, name, owner = '') => ({
  id,
  name,
  owner,
  createdAt: new Date().toISOString(),
  // Division assignment
  divisionId: null,
  division: null, // Will be populated when fetched with division data
  // ESPN integration
  espnTeamId: null,
  roster: [],
  lastRosterSync: null,
  // Season stats (calculated from games)
  wins: 0,
  losses: 0,
  ties: 0,
  pointsFor: 0,
  pointsAgainst: 0,
  // Advanced metrics (calculated)
  winPercentage: 0,
  pointDifferential: 0,
  averagePointsFor: 0,
  averagePointsAgainst: 0,
  strengthOfSchedule: 0,
  opponentWinPercentage: 0,
  // Quality metrics
  qualityWins: 0,
  badLosses: 0,
  blowoutWins: 0,
  closeWins: 0,
  closeLosses: 0,
  // Form and streaks
  recentForm: 0, // Rolling 4-week score
  currentStreak: { type: 'none', length: 0 }, // win/loss streak
  // Power ranking specific
  powerRating: 0,
  previousRank: null,
  rankChange: 0,
  // Roster analytics (calculated from player data)
  rosterTotalProjectedPoints: 0,
  rosterTotalActualPoints: 0,
  starterProjectedPoints: 0,
  starterActualPoints: 0,
  benchProjectedPoints: 0,
  benchActualPoints: 0,
  // Position group strengths (QB, RB, WR, TE, K, DST)
  positionStrengths: {
    QB: { projected: 0, actual: 0, rank: 0 },
    RB: { projected: 0, actual: 0, rank: 0 },
    WR: { projected: 0, actual: 0, rank: 0 },
    TE: { projected: 0, actual: 0, rank: 0 },
    K: { projected: 0, actual: 0, rank: 0 },
    'D/ST': { projected: 0, actual: 0, rank: 0 }
  }
});

// Game/matchup data structure
export const createGame = (week, team1Id, team2Id, team1Score = null, team2Score = null, type = GAME_TYPES.REGULAR) => ({
  id: `${week}-${team1Id}-${team2Id}`,
  week,
  team1Id,
  team2Id,
  team1Score,
  team2Score,
  type,
  isCompleted: team1Score !== null && team2Score !== null,
  winnerTeamId: null,
  loserTeamId: null,
  isTie: false,
  pointDifferential: 0,
  isBlowout: false, // >30 point difference
  isClose: false, // <5 point difference
  completedAt: null
});

// Week data structure
export const createWeek = (weekNumber, seasonId) => ({
  id: `${seasonId}-week-${weekNumber}`,
  weekNumber,
  seasonId,
  isCompleted: false,
  games: [],
  completedAt: null,
  powerRankings: [], // Snapshot of rankings after this week
  weeklyStats: {
    highestScore: { teamId: null, score: 0 },
    lowestScore: { teamId: null, score: 999 },
    averageScore: 0,
    totalPoints: 0,
    blowouts: 0,
    upsets: 0 // Lower ranked team beating higher ranked
  }
});

// Season data structure
export const createSeason = (year, name = '', leagueSize = 14, regularSeasonWeeks = 14, playoffWeeks = 3) => ({
  id: `season-${year}`,
  year,
  name: name || `${year} Season`,
  leagueSize,
  regularSeasonWeeks,
  playoffWeeks,
  totalWeeks: regularSeasonWeeks + playoffWeeks,
  isActive: false,
  isCompleted: false,
  createdAt: new Date().toISOString(),
  completedAt: null,
  teams: [],
  weeks: [],
  schedule: [], // All games for the season
  // Season stats
  stats: {
    totalGames: 0,
    completedGames: 0,
    totalPoints: 0,
    averageGameScore: 0,
    highestWeeklyScore: { teamId: null, score: 0, week: 0 },
    lowestWeeklyScore: { teamId: null, score: 999, week: 0 },
    mostBlowouts: { teamId: null, count: 0 },
    biggestBlowout: { winnerTeamId: null, loserTeamId: null, differential: 0, week: 0 }
  },
  // Playoff bracket (if applicable)
  playoffBracket: null
});

/**
 * Power ranking component weights. The one definition, imported by the
 * calculator and by the UI that labels it.
 *
 * There used to be three overlapping blocks here — a "core" set, a "legacy
 * component" set and a "deprecated" set — and the calculator imported none of
 * them; its weights were numeric literals inline in `calculatePowerRating`. So
 * the table's legend confidently described a 25%/20%/15% split that existed
 * nowhere in the code. Anything that reads a weight now reads it from here.
 *
 * Every component is normalized 0-100 across the league before weighting, so
 * the weights are directly comparable. A component that cannot be computed —
 * no player data for a 2025 season, no games yet in week 1 — is null, and
 * `combineWeightedComponents` renormalizes over the ones that survived rather
 * than scoring the gap as zero.
 *
 * These sum to 1.00, which `powerRankingCalculator.test.js` asserts.
 */
export const POWER_RANKING_WEIGHTS = {
  // Team level: available from `games` alone, so always present.
  record: 0.22,
  allPlay: 0.15,
  scoring: 0.13,
  recentForm: 0.10,
  consistency: 0.05,

  // Roster level: needs `player_week_stats`, first written 2026-08-10.
  rosterStrength: 0.13,
  lineupEfficiency: 0.05,

  // Forward looking.
  futureStrength: 0.09,
  leagueSos: 0.08
};

/**
 * Display metadata for each component, so labels, colours and explanations
 * cannot drift from the weights the way the old hardcoded legend did.
 */
export const POWER_RANKING_COMPONENT_META = {
  record: {
    label: 'Record',
    group: 'team',
    color: 'text-blue-600',
    description: 'Win percentage with quality wins and bad losses, adjusted for how strong the opponents faced so far have been.'
  },
  allPlay: {
    label: 'All-Play',
    group: 'team',
    color: 'text-teal-600',
    description: 'How often this team would have won if it played every other team every week — record with the schedule luck removed.'
  },
  scoring: {
    label: 'Scoring',
    group: 'team',
    color: 'text-emerald-600',
    description: 'Points per game across the season to date.'
  },
  recentForm: {
    label: 'Recent Form',
    group: 'team',
    color: 'text-purple-600',
    description: 'Results and scoring over the last three games, most recent weighted heaviest.'
  },
  consistency: {
    label: 'Consistency',
    group: 'team',
    color: 'text-indigo-600',
    description: 'Week-to-week variance in scoring. Reliable teams rank above boom-or-bust ones with the same average.'
  },
  rosterStrength: {
    label: 'Roster Strength',
    group: 'roster',
    color: 'text-green-600',
    description: 'Average points actually produced by the players in the starting lineup each week.'
  },
  lineupEfficiency: {
    label: 'Lineup Efficiency',
    group: 'roster',
    color: 'text-lime-600',
    description: 'Share of the best possible lineup this manager actually started — how much of the roster’s output was left on the bench.'
  },
  futureStrength: {
    label: 'Roster Outlook',
    group: 'future',
    color: 'text-cyan-600',
    description: 'Projected points still to come from the current starters, weighted toward the rest of the season with next week’s projection on top.'
  },
  leagueSos: {
    label: 'Remaining Schedule',
    group: 'future',
    color: 'text-orange-600',
    description: 'How strong the remaining regular-season fantasy opponents are. Higher means a tougher run-in, scored the same direction as the opponent adjustment inside Record — a hard schedule is never treated as a credential and an easy one never flatters.'
  }
};

// Thresholds for various calculations
export const THRESHOLDS = {
  blowout: 25, // Point difference for blowout (lowered for more sensitivity)
  close: 7,    // Point difference for close game (tightened)
  qualityWinRankThreshold: 5, // Beating a team ranked this or higher
  badLossRankThreshold: 10,   // Losing to a team ranked this or lower
  recentFormWeeks: 3,         // Number of weeks for recent form calculation (last 3 games)
  upsetRankDifference: 3,     // Rank difference needed for upset

  // Performance Score thresholds
  momentumThreshold: 0.10,    // L3W > L5W threshold for momentum bonus
  consistencyThreshold: 0.15, // CV threshold for consistency bonus

  // Consistency/Variance thresholds
  eliteConsistency: 0.20,     // CV threshold for elite consistency
  highVariance: 0.35          // CV threshold for high variance penalty
};

// Helper functions for data validation
export const validateTeam = (team) => {
  return team &&
    typeof team.id !== 'undefined' &&
    typeof team.name === 'string' &&
    team.name.length > 0;
};

export const validateGame = (game) => {
  return game &&
    typeof game.week === 'number' &&
    game.week > 0 &&
    game.team1Id !== game.team2Id &&
    (game.team1Score === null || typeof game.team1Score === 'number') &&
    (game.team2Score === null || typeof game.team2Score === 'number');
};

export const validateSeason = (season) => {
  return season &&
    typeof season.year === 'number' &&
    season.year > 2000 &&
    season.leagueSize >= 4 &&
    season.regularSeasonWeeks > 0 &&
    season.playoffWeeks >= 0;
};

export const validateDivision = (division) => {
  return division &&
    typeof division.seasonId !== 'undefined' &&
    typeof division.name === 'string' &&
    division.name.length > 0 &&
    typeof division.displayOrder === 'number' &&
    division.displayOrder > 0;
};

// Pick'ems types and constants
export const PICK_EM_STATUS = {
  UPCOMING: 'upcoming',
  OPEN: 'open',
  CLOSED: 'closed',
  COMPLETED: 'completed'
};

// Pick'em week data structure
export const createPickEmWeek = (seasonId, weekNumber, submissionOpensAt, submissionClosesAt, resultsRevealAt) => ({
  id: null,
  seasonId,
  weekNumber,
  submissionOpensAt,
  submissionClosesAt,
  resultsRevealAt,
  isActive: false,
  isClosed: false,
  isCompleted: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

// Pick'em submission data structure
export const createPickEmSubmission = (pickEmWeekId, gameId, predictedWinnerTeamId) => ({
  id: null,
  pickEmWeekId,
  gameId,
  predictedWinnerTeamId,
  confidenceLevel: 1, // Always 1 point per pick
  submittedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

// Pick'em result data structure
export const createPickEmResult = (pickEmWeekId, submissionId, isCorrect, pointsEarned, actualWinnerTeamId) => ({
  id: null,
  pickEmWeekId,
  submissionId,
  isCorrect,
  pointsEarned,
  actualWinnerTeamId,
  calculatedAt: new Date().toISOString()
});

// Pick'em weekly score data structure
export const createPickEmWeeklyScore = (pickEmWeekId, totalPicks, correctPicks, totalPoints, weeklyRank) => ({
  id: null,
  pickEmWeekId,
  totalPicks,
  correctPicks,
  totalPoints,
  accuracyPercentage: totalPicks > 0 ? (correctPicks / totalPicks) * 100 : 0,
  weeklyRank,
  calculatedAt: new Date().toISOString()
});

// Pick'em season standings data structure
export const createPickEmSeasonStandings = (seasonId, totalWeeksParticipated, totalPicks, totalCorrectPicks, totalPoints, seasonRank) => ({
  id: null,
  seasonId,
  totalWeeksParticipated,
  totalPicks,
  totalCorrectPicks,
  totalPoints,
  overallAccuracyPercentage: totalPicks > 0 ? (totalCorrectPicks / totalPicks) * 100 : 0,
  seasonRank,
  currentStreak: 0,
  longestStreak: 0,
  perfectWeeks: 0,
  lastUpdated: new Date().toISOString()
});

// Validation functions for pick'ems
export const validatePickEmWeek = (pickEmWeek) => {
  return pickEmWeek &&
    typeof pickEmWeek.seasonId !== 'undefined' &&
    typeof pickEmWeek.weekNumber === 'number' &&
    pickEmWeek.weekNumber > 0 &&
    pickEmWeek.submissionOpensAt &&
    pickEmWeek.submissionClosesAt &&
    pickEmWeek.resultsRevealAt &&
    new Date(pickEmWeek.submissionOpensAt) < new Date(pickEmWeek.submissionClosesAt) &&
    new Date(pickEmWeek.submissionClosesAt) < new Date(pickEmWeek.resultsRevealAt);
};

export const validatePickEmSubmission = (submission) => {
  return submission &&
    typeof submission.pickEmWeekId !== 'undefined' &&
    typeof submission.gameId !== 'undefined' &&
    typeof submission.predictedWinnerTeamId !== 'undefined';
};

/**
 * A TD parlay pick, before it is sent.
 *
 * Two shapes are valid, which is the point: a `playerId` from the autocomplete,
 * or a non-blank name typed by hand. The free-text branch is not a fallback for
 * bad input — `players` only holds people ESPN has rostered in this league, so
 * a fringe goal-line back may genuinely not be in it, and a validator that
 * demanded an id would make him unpickable.
 *
 * The deadline is not checked here. It is checked in `submit_td_parlay_pick`,
 * where a client cannot skip it.
 */
export const validateParlayPick = (pick) => {
  if (!pick || typeof pick.pickEmWeekId === 'undefined' || !pick.pickEmWeekId) return false;
  if (pick.playerId) return true;
  return typeof pick.playerName === 'string' && pick.playerName.trim().length > 0;
};

// Pick'ems time utilities
export const getPickEmTimeStatus = (submissionOpensAt, submissionClosesAt, resultsRevealAt) => {
  const now = new Date();
  const opensAt = new Date(submissionOpensAt);
  const closesAt = new Date(submissionClosesAt);
  const revealsAt = new Date(resultsRevealAt);

  if (now < opensAt) {
    return PICK_EM_STATUS.UPCOMING;
  } else if (now >= opensAt && now <= closesAt) {
    return PICK_EM_STATUS.OPEN;
  } else if (now > closesAt && now < revealsAt) {
    return PICK_EM_STATUS.CLOSED;
  } else {
    return PICK_EM_STATUS.COMPLETED;
  }
};

// Calculate default pick'em schedule based on fantasy week system.
//
// This used to carry its own copy of the season start date ('2025-09-02T03:00'
// EST) which disagreed with the one in utils/weekCalculator.js ('2025-09-02'
// midnight EDT), and hardcoded the open/close/reveal offsets. All of it now
// comes off the active season row.
export const calculatePickEmSchedule = (weekNumber) => {
  const config = getSeasonConfig();
  if (!config?.startDate) {
    throw new Error(
      'Cannot build a pick\'em schedule: no active season config loaded.'
    );
  }
  return derivePickEmSchedule(config, weekNumber);
};

// ============================================================================
// TRANSACTION TYPES AND DATA STRUCTURES
// ============================================================================

// Transaction type constants from ESPN API
export const TRANSACTION_TYPES = {
  FREE_AGENT: 'free_agent',
  WAIVER: 'waiver',
  TRADE: 'trade',
  DROP: 'drop',
  ROSTER: 'roster',
  DRAFT: 'draft'
};

// ESPN API transaction type mappings
export const ESPN_TRANSACTION_MAP = {
  FREEAGENT: 'free_agent',
  WAIVER: 'waiver',
  WAIVER_ERROR: 'waiver_error',
  TRADE_PROPOSAL: 'trade_proposal',
  TRADE_ACCEPT: 'trade',
  TRADE_DECLINE: 'trade_decline',
  TRADE_VETO: 'trade_veto',
  TRADE_UPHOLD: 'trade_uphold',
  DROP: 'drop',
  ROSTER: 'roster',
  DRAFT: 'draft'
};

// Human-readable labels for transaction types
export const TRANSACTION_LABELS = {
  free_agent: 'Free Agent Adds',
  waiver: 'Waiver Claims',
  trade: 'Trades',
  drop: 'Drops',
  roster: 'Roster Moves',
  draft: 'Draft Picks',
  total: 'Total Transactions'
};

// Colors for transaction type charts
export const TRANSACTION_COLORS = {
  free_agent: '#22c55e', // green
  waiver: '#3b82f6', // blue
  trade: '#f59e0b', // amber
  drop: '#ef4444', // red
  roster: '#6366f1', // indigo
  draft: '#8b5cf6', // violet
  total: '#64748b' // slate
};

// Team transaction data structure (per season)
export const createTeamTransaction = (franchiseId, seasonId, ownerName) => ({
  id: null,
  franchise_id: franchiseId,
  season_id: seasonId,
  owner_name: ownerName,
  espn_team_id: null,

  // Transaction counts by type
  free_agent_adds: 0,
  waiver_claims: 0,
  trades: 0,
  drops: 0,

  // Aggregates
  total_transactions: 0,
  faab_spent: 0,

  // Metadata
  last_synced_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
});

// Franchise transaction totals (all-time)
export const createFranchiseTransactionTotals = (franchiseId, ownerName) => ({
  franchise_id: franchiseId,
  owner_name: ownerName,
  total_free_agent_adds: 0,
  total_waiver_claims: 0,
  total_trades: 0,
  total_drops: 0,
  total_all_transactions: 0,
  total_faab_spent: 0,
  seasons_count: 0,
  avg_transactions_per_season: 0
});

// Validation function for team transactions
export const validateTeamTransaction = (transaction) => {
  return transaction &&
    typeof transaction.franchise_id !== 'undefined' &&
    typeof transaction.season_id !== 'undefined' &&
    typeof transaction.owner_name === 'string' &&
    transaction.owner_name.length > 0 &&
    typeof transaction.free_agent_adds === 'number' &&
    typeof transaction.waiver_claims === 'number' &&
    typeof transaction.trades === 'number' &&
    typeof transaction.drops === 'number';
};

// Helper to calculate total transactions from individual counts
export const calculateTotalTransactions = (transaction) => {
  return (transaction.free_agent_adds || 0) +
    (transaction.waiver_claims || 0) +
    (transaction.trades || 0) +
    (transaction.drops || 0);
};

// Helper to format transaction count with label
export const formatTransactionCount = (type, count) => {
  const label = TRANSACTION_LABELS[type] || type;
  return `${count} ${label}`;
};

// Awards Types
export const createAward = (seasonId, title, category, description = '', icon = 'Trophy', displayOrder = 0) => ({
  seasonId,
  title,
  category, // 'voted' or 'non-voted'
  description,
  icon,
  displayOrder,
  winnerId: null,
  winnerInfo: null,
  votingOptions: [],
  createdAt: new Date().toISOString()
});

export const validateAward = (award) => {
  if (!award.seasonId || !award.title || !award.category) return false;
  if (!['voted', 'non-voted'].includes(award.category)) return false;
  return true;
};