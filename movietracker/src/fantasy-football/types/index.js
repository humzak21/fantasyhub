// Data models and types for fantasy football power rankings system

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

// Team data structure
export const createTeam = (id, name, owner = '') => ({
  id,
  name,
  owner,
  createdAt: new Date().toISOString(),
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
  rankChange: 0
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

// Power ranking calculation weights
export const POWER_RANKING_WEIGHTS = {
  winPercentage: 0.25,
  pointDifferential: 0.20,
  strengthOfSchedule: 0.15,
  recentForm: 0.15,
  qualityWins: 0.10,
  averagePointsFor: 0.10,
  badLosses: -0.05
};

// Thresholds for various calculations
export const THRESHOLDS = {
  blowout: 30, // Point difference for blowout
  close: 5,    // Point difference for close game
  qualityWinRankThreshold: 6, // Beating a team ranked this or higher
  badLossRankThreshold: 10,   // Losing to a team ranked this or lower
  recentFormWeeks: 4,         // Number of weeks for recent form calculation
  upsetRankDifference: 3      // Rank difference needed for upset
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