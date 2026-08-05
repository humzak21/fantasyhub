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

// ENHANCED Power ranking weights - Heavy emphasis on record and key metrics
export const POWER_RANKING_WEIGHTS = {
  // Core components (used in enhanced formula)
  recordWeight: 0.35,           // Win-loss record with quality adjustments
  sosAdjustedWeight: 0.20,      // SOS-adjusted record
  momentumFormWeight: 0.15,     // Recent form and momentum
  qualityWeight: 0.10,          // Quality wins/losses differential
  projectionWeight: 0.10,       // Roster strength and projections
  currentFormWeight: 0.05,      // Last 3 games performance
  pointDiffWeight: 0.05,        // Total point differential

  // Legacy component weights (for backward compatibility)
  performanceScore: 0.25,
  teamStrength: 0.20,
  strengthOfSchedule: 0.15,
  momentumScore: 0.15,
  consistencyScore: 0.15,
  clutchScore: 0.05,

  // Legacy weights for backward compatibility (deprecated)
  winPercentage: 0.20,
  pointDifferential: 0.15,
  recentForm: 0.12,
  qualityWins: 0.08,
  averagePointsFor: 0.08,
  rosterProjectedStrength: 0.15,
  positionGroupBalance: 0.10,
  badLosses: -0.05
};

// Position weights for PPR scoring (Team Strength calculation)
export const POSITION_WEIGHTS = {
  QB: 0.18,
  RB1: 0.16,
  RB2: 0.12,
  WR1: 0.16,
  WR2: 0.13,
  TE: 0.10,
  FLEX: 0.10,
  'D/ST': 0.03,
  K: 0.02
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