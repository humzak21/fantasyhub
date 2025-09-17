import { THRESHOLDS, POSITION_WEIGHTS } from '../types/index.js';

export class PowerRankingCalculator {
  constructor(teams, games, currentWeek = 1, players = [], viewingWeek = null) {
    this.teams = Array.isArray(teams) ? teams : [];
    this.games = Array.isArray(games) ? games : [];
    this.players = Array.isArray(players) ? players : [];
    this.currentWeek = currentWeek;
    // viewingWeek is the week the user is viewing (for historical power rankings)
    // If viewing week 3, we only consider games from weeks 1-2
    this.viewingWeek = viewingWeek || currentWeek;

    console.log('PowerRankingCalculator constructor:', {
      teamsType: typeof teams,
      teamsIsArray: Array.isArray(teams),
      teamsLength: this.teams.length,
      gamesType: typeof games,
      gamesIsArray: Array.isArray(games),
      gamesLength: this.games.length,
      playersLength: this.players.length,
      currentWeek,
      viewingWeek: this.viewingWeek
    });

    this.leagueStats = this.calculateLeagueStats();
    this.teamRosterMetrics = this.calculateAllTeamRosterMetrics();
  }

  calculateLeagueStats() {
    // Only consider games before the viewing week for historical accuracy
    const completedGames = this.games.filter(game =>
      game.isCompleted && game.week < this.viewingWeek
    );
    const totalPoints = completedGames.reduce((sum, game) => sum + game.team1Score + game.team2Score, 0);
    const totalTeams = this.teams.length;
    
    const teamWinPercentages = this.teams.map(team => {
      const teamGames = completedGames.filter(game => 
        game.team1Id === team.id || game.team2Id === team.id
      );
      const wins = teamGames.filter(game => this.getWinnerFromGame(game) === team.id).length;
      return teamGames.length > 0 ? wins / teamGames.length : 0;
    });

    return {
      averageWinPercentage: teamWinPercentages.reduce((sum, pct) => sum + pct, 0) / totalTeams,
      averageScore: completedGames.length > 0 ? totalPoints / (completedGames.length * 2) : 0,
      totalGames: completedGames.length,
      currentWeek: this.currentWeek
    };
  }

  getWinnerFromGame(game) {
    if (!game.isCompleted) return null;
    if (game.team1Score > game.team2Score) return game.team1Id;
    if (game.team2Score > game.team1Score) return game.team2Id;
    // No ties in fantasy football - this should never happen
    return null;
  }

  // 1. Performance Score (PS) - ENHANCED for record emphasis
  calculatePerformanceScore(teamId) {
    const teamGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.isCompleted &&
      game.week < this.viewingWeek
    );

    if (teamGames.length === 0) return 0;

    // Sort games by week for trend analysis
    const sortedGames = teamGames.sort((a, b) => a.week - b.week);
    
    // Calculate Last 3 Weeks (L3W) - weighted average
    const last3Games = sortedGames.slice(-3);
    const l3wScores = last3Games.map(game => 
      game.team1Id === teamId ? game.team1Score : game.team2Score
    );
    const l3w = last3Games.length > 0 ? 
      l3wScores.reduce((sum, score, idx) => {
        const weight = idx === l3wScores.length - 1 ? 0.5 : 
                      idx === l3wScores.length - 2 ? 0.3 : 0.2;
        return sum + (score * weight);
      }, 0) : 0;

    // Calculate Last 5 Weeks (L5W) - simple average
    const last5Games = sortedGames.slice(-5);
    const l5wScores = last5Games.map(game => 
      game.team1Id === teamId ? game.team1Score : game.team2Score
    );
    const l5w = l5wScores.length > 0 ? 
      l5wScores.reduce((sum, score) => sum + score, 0) / l5wScores.length : 0;

    // Season Points Per Game (SPG)
    const totalPoints = teamGames.reduce((sum, game) => {
      return sum + (game.team1Id === teamId ? game.team1Score : game.team2Score);
    }, 0);
    const spg = totalPoints / teamGames.length;

    // High Performance Weeks (HPW) - % of weeks scoring top 25% of league
    const allWeeklyScores = [];
    this.teams.forEach(team => {
      const tGames = this.games.filter(g => 
        (g.team1Id === team.id || g.team2Id === team.id) && g.isCompleted
      );
      tGames.forEach(game => {
        allWeeklyScores.push(game.team1Id === team.id ? game.team1Score : game.team2Score);
      });
    });
    allWeeklyScores.sort((a, b) => b - a);
    const top25Threshold = allWeeklyScores[Math.floor(allWeeklyScores.length * 0.25)] || 0;
    
    const teamHighScoreWeeks = teamGames.filter(game => {
      const teamScore = game.team1Id === teamId ? game.team1Score : game.team2Score;
      return teamScore >= top25Threshold;
    }).length;
    const hpw = teamGames.length > 0 ? teamHighScoreWeeks / teamGames.length : 0;

    // All-Play Win Percentage - how many teams would this team beat each week
    const allPlayWinPct = this.calculateAllPlayWinPercentage(teamId);

    // ENHANCED: More weight on recent form and all-play
    // PS = (0.40 × L3W) + (0.20 × L5W) + (0.15 × SPG) + (0.10 × HPW) + (0.15 × AllPlay)
    let ps = (0.40 * l3w) + (0.20 * l5w) + (0.15 * spg) + (0.10 * (hpw * 100)) + (0.15 * (allPlayWinPct * 100));

    // Momentum Factor: If L3W > L5W by >10%, multiply PS by 1.05
    if (l5w > 0 && (l3w - l5w) / l5w > THRESHOLDS.momentumThreshold) {
      ps *= 1.05;
    }

    // Consistency Bonus: If coefficient of variation < 0.15, multiply PS by 1.03
    const weeklyScores = teamGames.map(game => 
      game.team1Id === teamId ? game.team1Score : game.team2Score
    );
    const mean = weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length;
    const variance = weeklyScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / weeklyScores.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;
    
    if (cv < THRESHOLDS.consistencyThreshold) {
      ps *= 1.03;
    }

    return ps;
  }

  // All-Play Win Percentage - calculates what percentage of teams this team would beat each week
  calculateAllPlayWinPercentage(teamId) {
    const teamGames = this.games.filter(game => 
      (game.team1Id === teamId || game.team2Id === teamId) && game.isCompleted
    );

    if (teamGames.length === 0) return 0;

    let totalPossibleWins = 0;
    let totalActualWins = 0;

    teamGames.forEach(game => {
      const teamScore = game.team1Id === teamId ? game.team1Score : game.team2Score;
      const week = game.week;
      
      // Get all completed games for this week
      const weekGames = this.games.filter(g => g.week === week && g.isCompleted);
      
      // Get all scores for this week
      const weekScores = [];
      weekGames.forEach(weekGame => {
        weekScores.push(weekGame.team1Score);
        weekScores.push(weekGame.team2Score);
      });
      
      // Remove the team's own score to avoid counting it twice
      const otherScores = weekScores.filter(score => score !== teamScore);
      
      // Count how many teams this team would beat
      const wins = otherScores.filter(score => teamScore > score).length;
      
      totalActualWins += wins;
      totalPossibleWins += otherScores.length;
    });

    return totalPossibleWins > 0 ? totalActualWins / totalPossibleWins : 0;
  }

  // 2. Team Strength (TS) - 20% Weight
  calculateTeamStrength(teamId) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team || !team.roster || team.roster.length === 0) return 0;

    let totalStrength = 0;
    const positionCounts = {};

    // Calculate position-weighted team value
    team.roster.forEach(player => {
      const playerData = this.players.find(p => p.id === player.playerId || p.espn_player_id === player.playerId);
      if (!playerData) return;

      const position = playerData.position || player.position;
      positionCounts[position] = (positionCounts[position] || 0) + 1;
      
      // Determine position weight (handle multiple players at same position)
      let positionWeight = 0;
      if (position === 'RB') {
        positionWeight = positionCounts[position] === 1 ? POSITION_WEIGHTS.RB1 : POSITION_WEIGHTS.RB2;
      } else if (position === 'WR') {
        positionWeight = positionCounts[position] === 1 ? POSITION_WEIGHTS.WR1 : POSITION_WEIGHTS.WR2;
      } else {
        positionWeight = POSITION_WEIGHTS[position] || 0;
      }

      // Player valuation: Base on projected points with health factor
      const baseValue = playerData.season_projected_points || playerData.seasonProjectedPoints || 0;
      const healthFactor = THRESHOLDS.healthScores[playerData.injury_status || playerData.injuryStatus] || 1.0;
      
      totalStrength += baseValue * positionWeight * healthFactor;
    });

    return totalStrength;
  }

  // 3. Strength of Schedule (SOS) - ENHANCED with opponent record analysis
  calculateStrengthOfSchedule(teamId) {
    const teamGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.isCompleted &&
      game.week < this.viewingWeek
    );

    if (teamGames.length === 0) return 0;

    // Past SOS (40%): Average opponent strength at time of matchup
    let pastSOS = 0;
    teamGames.forEach(game => {
      const opponentId = game.team1Id === teamId ? game.team2Id : game.team1Id;
      const opponentStrength = this.calculateTeamStrength(opponentId);
      pastSOS += opponentStrength;
    });
    pastSOS = teamGames.length > 0 ? pastSOS / teamGames.length : 0;

    // Future SOS: Consider upcoming games from the viewing week perspective
    const remainingGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.week >= this.viewingWeek
    );

    let futureSOS = 0;
    remainingGames.forEach(game => {
      const opponentId = game.team1Id === teamId ? game.team2Id : game.team1Id;
      const opponentStrength = this.calculateTeamStrength(opponentId);
      futureSOS += opponentStrength;
    });
    futureSOS = remainingGames.length > 0 ? futureSOS / remainingGames.length : pastSOS;

    // Combined SOS: 40% past, 60% future
    const combinedSOS = (0.4 * pastSOS) + (0.6 * futureSOS);

    // Normalize against league average
    const allTeamStrengths = this.teams.map(team => this.calculateTeamStrength(team.id));
    const avgTeamStrength = allTeamStrengths.reduce((sum, strength) => sum + strength, 0) / allTeamStrengths.length;
    
    return avgTeamStrength > 0 ? (combinedSOS - avgTeamStrength) / avgTeamStrength : 0;
  }

  // 4. Momentum Score (MS) - ENHANCED with streak emphasis
  calculateMomentumScore(teamId) {
    const teamGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.isCompleted &&
      game.week < this.viewingWeek
    );

    if (teamGames.length === 0) return 0;

    // Win Streak (WS) - 40% (increased from 30%)
    const currentStreak = this.calculateCurrentStreak(teamId, teamGames);
    const ws = currentStreak.type === 'win' ? Math.min(currentStreak.length * 0.08, 0.30) :
               currentStreak.type === 'loss' ? -Math.min(currentStreak.length * 0.08, 0.30) : 0;

    // Point Streak (PS) - 30%: Linear regression slope of last 4 weeks
    const last4Games = teamGames.slice(-4);
    const pointTrend = this.calculatePointTrend(teamId, last4Games);

    // Trade Score (TS) - 20%: Simplified as roster improvement indicator
    const ts = 0; // Placeholder - would require trade history tracking

    // Roster Score (RS) - 20%: Waiver wire success rate (simplified)
    const rs = 0; // Placeholder - would require waiver wire tracking

    // Increased weight on streak and trend
    return (0.4 * ws) + (0.35 * pointTrend) + (0.15 * ts) + (0.1 * rs);
  }

  calculatePointTrend(teamId, games) {
    if (games.length < 2) return 0;

    const scores = games.map((game, idx) => ({
      week: idx + 1,
      score: game.team1Id === teamId ? game.team1Score : game.team2Score
    }));

    // Simple linear regression
    const n = scores.length;
    const sumX = scores.reduce((sum, point) => sum + point.week, 0);
    const sumY = scores.reduce((sum, point) => sum + point.score, 0);
    const sumXY = scores.reduce((sum, point) => sum + (point.week * point.score), 0);
    const sumXX = scores.reduce((sum, point) => sum + (point.week * point.week), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope / 10; // Normalize slope
  }

  // 5. Consistency/Variance (CV) - 10% Weight
  calculateConsistencyScore(teamId) {
    const teamGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.isCompleted &&
      game.week < this.viewingWeek
    );

    if (teamGames.length < 2) return 0.5; // Neutral score for insufficient data

    const scores = teamGames.map(game => 
      game.team1Id === teamId ? game.team1Score : game.team2Score
    );

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;

    // Calculate floor/ceiling balance
    const aboveMedian = scores.filter(score => score > mean).length;
    const floorCeilingBalance = aboveMedian / scores.length;

    // Base consistency score: CV = 1 - (σ/μ) × Floor/Ceiling Balance
    let consistencyScore = (1 - cv) * floorCeilingBalance;

    // Apply variance bonuses/penalties
    if (cv < THRESHOLDS.eliteConsistency) {
      consistencyScore *= 1.05; // Elite consistency bonus
    } else if (cv > THRESHOLDS.highVariance) {
      consistencyScore *= 0.95; // High variance penalty
    }

    return Math.max(0, Math.min(1, consistencyScore));
  }

  // 6. Injury/Availability Score (IS) - 10% Weight
  calculateInjuryScore(teamId) {
    const team = this.teams.find(t => t.id === teamId);
    if (!team || !team.roster || team.roster.length === 0) return 0.5;

    let totalHealthScore = 0;
    let totalPlayers = 0;

    team.roster.forEach(player => {
      const playerData = this.players.find(p => p.id === player.playerId || p.espn_player_id === player.playerId);
      if (!playerData) return;

      const injuryStatus = playerData.injury_status || playerData.injuryStatus || 'ACTIVE';
      const healthScore = THRESHOLDS.healthScores[injuryStatus] || 1.0;
      
      // Weight by player importance (projected points)
      const playerValue = playerData.season_projected_points || playerData.seasonProjectedPoints || 0;
      const positionScarcity = this.getPositionScarcity(playerData.position);
      
      totalHealthScore += healthScore * playerValue * positionScarcity;
      totalPlayers += playerValue * positionScarcity;
    });

    return totalPlayers > 0 ? totalHealthScore / totalPlayers : 0.5;
  }

  getPositionScarcity(position) {
    // Position scarcity multipliers (higher = more scarce)
    const scarcityMap = {
      'QB': 1.2,
      'RB': 1.5,
      'WR': 1.0,
      'TE': 1.3,
      'K': 0.5,
      'D/ST': 0.5
    };
    return scarcityMap[position] || 1.0;
  }

  // 7. Clutch Score (CS) - ENHANCED with quality win/loss emphasis
  calculateClutchScore(teamId) {
    const teamGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.isCompleted &&
      game.week < this.viewingWeek
    );

    if (teamGames.length === 0) return 0;

    // Close Win Percentage (CWP) - 40%
    const closeGames = teamGames.filter(game => {
      const scoreDiff = Math.abs(game.team1Score - game.team2Score);
      return scoreDiff <= THRESHOLDS.close;
    });
    const closeWins = closeGames.filter(game => this.getWinnerFromGame(game) === teamId);
    const cwp = closeGames.length > 0 ? closeWins.length / closeGames.length : 0.5;

    // Narrow Margin Performance (NMP) - 30%: Performance in must-win situations
    // Simplified as performance in close games
    const nmp = cwp; // Placeholder for more complex must-win calculation

    // High-Leverage Performance (HLP) - 30%: H2H vs playoff teams
    // Simplified as performance against top-half teams
    const allTeamStats = this.teams.map(team => this.calculateBasicStats(team.id));
    allTeamStats.sort((a, b) => b.winPercentage - a.winPercentage);
    const topHalfTeams = allTeamStats.slice(0, Math.ceil(allTeamStats.length / 2));
    const topHalfTeamIds = new Set(topHalfTeams.map(stat => stat.teamId));
    
    const vsTopHalfGames = teamGames.filter(game => {
      const opponentId = game.team1Id === teamId ? game.team2Id : game.team1Id;
      return topHalfTeamIds.has(opponentId);
    });
    const vsTopHalfWins = vsTopHalfGames.filter(game => this.getWinnerFromGame(game) === teamId);
    const hlp = vsTopHalfGames.length > 0 ? vsTopHalfWins.length / vsTopHalfGames.length : 0.5;

    return (0.4 * cwp) + (0.3 * nmp) + (0.3 * hlp);
  }

  calculateBasicStats(teamId) {
    const teamGames = this.games.filter(game => 
      (game.team1Id === teamId || game.team2Id === teamId) && game.isCompleted
    );

    const wins = teamGames.filter(game => this.getWinnerFromGame(game) === teamId).length;
    const winPercentage = teamGames.length > 0 ? wins / teamGames.length : 0;

    return { teamId, winPercentage, gamesPlayed: teamGames.length, wins };
  }

  calculateCurrentStreak(teamId, teamGames) {
    if (teamGames.length === 0) return { type: 'none', length: 0 };

    const sortedGames = [...teamGames].sort((a, b) => b.week - a.week);
    
    const firstResult = this.getWinnerFromGame(sortedGames[0]);
    if (firstResult === 'tie') return { type: 'tie', length: 1 };
    
    const streakType = firstResult === teamId ? 'win' : 'loss';
    let streakLength = 1;

    for (let i = 1; i < sortedGames.length; i++) {
      const result = this.getWinnerFromGame(sortedGames[i]);
      if (result === 'tie') break;
      
      const isWin = result === teamId;
      if ((streakType === 'win' && !isWin) || (streakType === 'loss' && isWin)) {
        break;
      }
      streakLength++;
    }

    return { type: streakType, length: streakLength };
  }

  calculateAllTeamRosterMetrics() {
    const metrics = {};
    this.teams.forEach(team => {
      metrics[team.id] = this.calculateRosterMetrics(team);
    });
    return metrics;
  }

  calculateRosterMetrics(team) {
    if (!team.roster || !Array.isArray(team.roster) || team.roster.length === 0) {
      return {
        rosterProjectedStrength: 0,
        positionGroupBalance: 0,
        injuryResistance: 0,
        starterProjectedPoints: 0,
        benchDepthScore: 0
      };
    }

    const totalRosterProjected = team.roster.reduce((sum, player) => {
      const playerData = this.players.find(p => p.id === player.playerId || p.espn_player_id === player.playerId);
      return sum + (playerData?.season_projected_points || playerData?.seasonProjectedPoints || 0);
    }, 0);

    const starters = team.roster.filter(player => player.isActive);
    const bench = team.roster.filter(player => !player.isActive);
    
    const starterProjectedPoints = starters.reduce((sum, player) => {
      const playerData = this.players.find(p => p.id === player.playerId || p.espn_player_id === player.playerId);
      return sum + (playerData?.season_projected_points || playerData?.seasonProjectedPoints || 0);
    }, 0);
    
    const benchProjectedPoints = bench.reduce((sum, player) => {
      const playerData = this.players.find(p => p.id === player.playerId || p.espn_player_id === player.playerId);
      return sum + (playerData?.season_projected_points || playerData?.seasonProjectedPoints || 0);
    }, 0);

    // Calculate position group balance
    const positionTotals = {};
    team.roster.forEach(player => {
      const playerData = this.players.find(p => p.id === player.playerId || p.espn_player_id === player.playerId);
      const pos = playerData?.position || 'UNKNOWN';
      if (!positionTotals[pos]) positionTotals[pos] = 0;
      positionTotals[pos] += (playerData?.season_projected_points || playerData?.seasonProjectedPoints || 0);
    });

    const positionValues = Object.values(positionTotals);
    const maxPositionPoints = Math.max(...positionValues, 1);
    const positionGroupBalance = totalRosterProjected > 0 ? 
      1 - (maxPositionPoints / totalRosterProjected) : 0;

    // Calculate injury resistance
    const injuredPlayers = team.roster.filter(player => {
      const playerData = this.players.find(p => p.id === player.playerId || p.espn_player_id === player.playerId);
      const injuryStatus = playerData?.injury_status || playerData?.injuryStatus;
      return injuryStatus && injuryStatus !== 'ACTIVE';
    }).length;
    const injuryResistance = Math.max(0, 1 - (injuredPlayers / Math.max(team.roster.length, 1)));

    const benchDepthScore = totalRosterProjected > 0 ? 
      benchProjectedPoints / totalRosterProjected : 0;

    return {
      rosterProjectedStrength: totalRosterProjected,
      positionGroupBalance,
      injuryResistance,
      starterProjectedPoints,
      benchDepthScore
    };
  }

  // ENHANCED power rating calculation with heavy emphasis on record and key metrics
  calculatePowerRating(teamId) {
    // Get basic team stats first
    const teamStats = this.calculateTeamStats(teamId);

    // Calculate all components with enhancements
    const ps = this.calculatePerformanceScore(teamId);
    const ts = this.calculateTeamStrength(teamId);
    const sos = this.calculateStrengthOfSchedule(teamId);
    const ms = this.calculateMomentumScore(teamId);
    const cv = this.calculateConsistencyScore(teamId);
    const is = this.calculateInjuryScore(teamId);
    const cs = this.calculateClutchScore(teamId);
    const allPlay = this.calculateAllPlayWinPercentage(teamId);

    // Calculate quality win/loss differential
    const qualityDifferential = (teamStats.qualityWins || 0) - (teamStats.badLosses || 0);

    // Normalize components to 0-100 scale with proper handling of edge cases
    const normalizedPS = Math.min(100, Math.max(0, ps / 2)); // Assuming typical scores 0-200
    
    // For team strength, if we don't have roster data, use a fallback based on performance
    const normalizedTS = ts > 0 ? Math.min(100, Math.max(0, ts / 10)) : normalizedPS * 0.8;
    
    // For SOS, if we don't have data, use opponent win percentage as fallback
    const normalizedSOS = sos !== 0 ? Math.min(100, Math.max(0, (sos + 1) * 50)) : 
                          (teamStats.opponentWinPercentage || 0.5) * 100;
    
    // Fix momentum normalization - use recent form as fallback if momentum is 0
    const normalizedMS = ms !== 0 ? Math.min(100, Math.max(0, (ms + 0.5) * 100)) :
                         Math.min(100, Math.max(0, (teamStats.recentForm + 50) * 1));
    
    // Consistency score - use coefficient of variation of scores
    const normalizedCV = cv > 0 ? Math.min(100, Math.max(0, cv * 100)) : 50;
    
    // Injury score - default to 75 if no roster data
    const normalizedIS = is > 0 ? Math.min(100, Math.max(0, is * 100)) : 75;
    
    // Clutch score normalization
    const normalizedCS = cs > 0 ? Math.min(100, Math.max(0, cs * 100)) : 50;
    const normalizedAllPlay = allPlay * 100; // Already 0-1 scale

    // NEW ENHANCED FORMULA with heavy emphasis on record and key metrics
    // 1. Base Record Score (35% weight) - Win percentage with quality adjustments
    const winPercentageScore = teamStats.winPercentage * 100;
    const recordScore = winPercentageScore + (qualityDifferential * 2); // Boost/penalize for quality

    // 2. Strength of Schedule Adjusted Record (20% weight)
    // Teams with harder schedules get a boost to their record score
    const sosAdjustedRecord = winPercentageScore * (1 + (teamStats.strengthOfSchedule * 0.5));

    // 3. Momentum & Form Score (10% weight) - Recent performance matters
    const formScore = (normalizedMS * 0.6) + ((teamStats.recentForm + 50) * 0.4);

    // 4. Quality Performance Score (5% weight) - Quality wins/losses and consistency
    const qualityScore = (normalizedCS * 0.5) + (normalizedCV * 0.3) + (qualityDifferential * 2);

    // 5. Roster Projection Score (10% weight) - Future potential
    const projectionScore = (normalizedTS * 0.7) + (normalizedIS * 0.3);

    // 6. Current Form Score (15% weight) - Last 3 games performance
    const last3Games = this.getLastNGames(teamId, 3);
    const currentFormScore = this.calculateFormScore(teamId, last3Games);

    // 7. Point Differential (5% weight) - Total cumulative differential
    const pointDiffScore = Math.min(100, Math.max(0, 50 + (teamStats.pointDifferential / 10)));

    // Calculate weighted power rating with updated emphasis
    // 35% record, 20% SOS, 15% last 3 games, 10% momentum/form, 10% roster, 5% quality, 5% point diff
    const powerRating =
      (Math.min(100, Math.max(0, recordScore)) * 0.35) +
      (Math.min(100, Math.max(0, sosAdjustedRecord)) * 0.20) +
      (currentFormScore * 0.15) +
      (formScore * 0.10) +
      (projectionScore * 0.10) +
      (qualityScore * 0.05) +
      (pointDiffScore * 0.05);

    return {
      powerRating: Math.max(0, Math.min(100, powerRating)),
      components: {
        performanceScore: normalizedPS,
        teamStrength: normalizedTS,
        strengthOfSchedule: normalizedSOS,
        momentumScore: normalizedMS,
        consistencyScore: normalizedCV,
        injuryScore: normalizedIS,
        clutchScore: normalizedCS,
        allPlayWinPct: normalizedAllPlay,
        recordScore: Math.min(100, Math.max(0, recordScore)),
        sosAdjustedRecord: Math.min(100, Math.max(0, sosAdjustedRecord)),
        formScore,
        qualityScore,
        projectionScore,
        currentFormScore,
        pointDiffScore,
        qualityDifferential
      }
    };
  }

  calculateTeamStats(teamId) {
    // Filter games based on viewing week for historical accuracy
    const teamGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.isCompleted &&
      game.week < this.viewingWeek
    );

    if (teamGames.length === 0) {
      return this.getDefaultStats(teamId);
    }

    const wins = teamGames.filter(game => this.getWinnerFromGame(game) === teamId).length;
    const losses = teamGames.filter(game => {
      const winner = this.getWinnerFromGame(game);
      return winner !== null && winner !== teamId;
    }).length;
    const ties = 0; // No ties in fantasy football

    // Calculate cumulative points up to current week
    const pointsFor = teamGames.reduce((sum, game) => {
      return sum + (game.team1Id === teamId ? game.team1Score : game.team2Score);
    }, 0);

    const pointsAgainst = teamGames.reduce((sum, game) => {
      return sum + (game.team1Id === teamId ? game.team2Score : game.team1Score);
    }, 0);

    const gamesPlayed = teamGames.length;
    const winPercentage = gamesPlayed > 0 ? wins / gamesPlayed : 0;
    // Point differential is now cumulative up to current week
    const pointDifferential = pointsFor - pointsAgainst;
    const averagePointsFor = gamesPlayed > 0 ? pointsFor / gamesPlayed : 0;
    const averagePointsAgainst = gamesPlayed > 0 ? pointsAgainst / gamesPlayed : 0;

    // Calculate advanced strength of schedule
    const opponentIds = teamGames.map(game => 
      game.team1Id === teamId ? game.team2Id : game.team1Id
    );
    const opponentWinPercentage = this.calculateOpponentWinPercentage(opponentIds, teamId);
    const strengthOfSchedule = this.calculateStrengthOfSchedule(teamId);

    // Calculate quality metrics
    const qualityWins = this.calculateQualityWins(teamId, teamGames);
    const badLosses = this.calculateBadLosses(teamId, teamGames);
    
    const blowoutWins = teamGames.filter(game => {
      const teamScore = game.team1Id === teamId ? game.team1Score : game.team2Score;
      const oppScore = game.team1Id === teamId ? game.team2Score : game.team1Score;
      return this.getWinnerFromGame(game) === teamId && (teamScore - oppScore) >= THRESHOLDS.blowout;
    }).length;

    const closeWins = teamGames.filter(game => {
      const teamScore = game.team1Id === teamId ? game.team1Score : game.team2Score;
      const oppScore = game.team1Id === teamId ? game.team2Score : game.team1Score;
      return this.getWinnerFromGame(game) === teamId && Math.abs(teamScore - oppScore) <= THRESHOLDS.close;
    }).length;

    const closeLosses = teamGames.filter(game => {
      const teamScore = game.team1Id === teamId ? game.team1Score : game.team2Score;
      const oppScore = game.team1Id === teamId ? game.team2Score : game.team1Score;
      const winner = this.getWinnerFromGame(game);
      return winner !== teamId && winner !== 'tie' && Math.abs(teamScore - oppScore) <= THRESHOLDS.close;
    }).length;

    const recentForm = this.calculateRecentForm(teamId);
    const currentStreak = this.calculateCurrentStreak(teamId, teamGames);

    return {
      teamId,
      gamesPlayed,
      wins,
      losses,
      ties,
      winPercentage,
      pointsFor,
      pointsAgainst,
      pointDifferential,
      averagePointsFor,
      averagePointsAgainst,
      strengthOfSchedule,
      opponentWinPercentage,
      qualityWins,
      badLosses,
      blowoutWins,
      closeWins,
      closeLosses,
      recentForm,
      currentStreak
    };
  }

  calculateOpponentWinPercentage(opponentIds, excludeTeamId) {
    if (opponentIds.length === 0) return 0;

    const opponentStats = opponentIds.map(oppId => {
      const oppGames = this.games.filter(game => 
        (game.team1Id === oppId || game.team2Id === oppId) && 
        game.isCompleted &&
        game.team1Id !== excludeTeamId && 
        game.team2Id !== excludeTeamId
      );
      
      if (oppGames.length === 0) return 0;
      
      const oppWins = oppGames.filter(game => this.getWinnerFromGame(game) === oppId).length;
      return oppWins / oppGames.length;
    });

    return opponentStats.reduce((sum, pct) => sum + pct, 0) / opponentStats.length;
  }

  calculateQualityWins(teamId, teamGames) {
    return teamGames.filter(game => {
      const winner = this.getWinnerFromGame(game);
      const oppScore = game.team1Id === teamId ? game.team2Score : game.team1Score;
      
      return winner === teamId && (oppScore >= this.leagueStats.averageScore * 1.1);
    }).length;
  }

  calculateBadLosses(teamId, teamGames) {
    return teamGames.filter(game => {
      const winner = this.getWinnerFromGame(game);
      const oppScore = game.team1Id === teamId ? game.team2Score : game.team1Score;
      
      return winner !== teamId && winner !== 'tie' && (oppScore <= this.leagueStats.averageScore * 0.8);
    }).length;
  }

  calculateRecentForm(teamId) {
    const recentWeekStart = Math.max(1, this.viewingWeek - THRESHOLDS.recentFormWeeks);
    const recentGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.isCompleted &&
      game.week >= recentWeekStart &&
      game.week < this.viewingWeek
    );

    if (recentGames.length === 0) return 0;

    const recentPoints = recentGames.reduce((sum, game) => {
      return sum + (game.team1Id === teamId ? game.team1Score : game.team2Score);
    }, 0);

    const recentAverage = recentPoints / recentGames.length;
    return recentAverage - this.leagueStats.averageScore;
  }

  calculateAllTeamStats() {
    return this.teams.map(team => {
      const stats = this.calculateTeamStats(team.id);
      const { powerRating, components } = this.calculatePowerRating(team.id);
      const rosterMetrics = this.teamRosterMetrics[team.id] || {};
      
      return {
        ...team,
        ...stats,
        ...rosterMetrics,
        powerRating,
        powerRatingComponents: components
      };
    });
  }

  getRankings(previousRankings = null) {
    const teamStats = this.calculateAllTeamStats();
    
    const rankings = teamStats.sort((a, b) => b.powerRating - a.powerRating);
    
    return rankings.map((team, index) => {
      const currentRank = index + 1;
      let rankChange = 0;
      let previousRank = null;

      if (previousRankings) {
        const prevEntry = previousRankings.find(prev => prev.teamId === team.teamId);
        if (prevEntry) {
          previousRank = prevEntry.rank || prevEntry.previousRank || currentRank;
          rankChange = previousRank - currentRank;
        }
      }

      return {
        ...team,
        rank: currentRank,
        previousRank,
        rankChange
      };
    });
  }

  getDefaultStats(teamId) {
    return {
      teamId,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winPercentage: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifferential: 0,
      averagePointsFor: 0,
      averagePointsAgainst: 0,
      strengthOfSchedule: 0,
      opponentWinPercentage: 0,
      qualityWins: 0,
      badLosses: 0,
      blowoutWins: 0,
      closeWins: 0,
      closeLosses: 0,
      recentForm: 0,
      currentStreak: { type: 'none', length: 0 }
    };
  }

  // Helper method to get last N games for a team
  getLastNGames(teamId, n) {
    const teamGames = this.games.filter(game =>
      (game.team1Id === teamId || game.team2Id === teamId) &&
      game.isCompleted &&
      game.week < this.viewingWeek
    );
    return teamGames.sort((a, b) => b.week - a.week).slice(0, n);
  }

  // Calculate form score based on recent games
  calculateFormScore(teamId, games) {
    if (games.length === 0) return 50; // Neutral score

    let formPoints = 50; // Start neutral
    const weights = [0.5, 0.3, 0.2]; // Most recent game has highest weight

    games.forEach((game, idx) => {
      const weight = weights[idx] || 0.1;
      const won = this.getWinnerFromGame(game) === teamId;
      const teamScore = game.team1Id === teamId ? game.team1Score : game.team2Score;
      const oppScore = game.team1Id === teamId ? game.team2Score : game.team1Score;
      const margin = teamScore - oppScore;

      // Win/loss impact
      if (won) {
        formPoints += 15 * weight;
        // Bonus for blowout wins
        if (margin >= THRESHOLDS.blowout) formPoints += 5 * weight;
      } else if (this.getWinnerFromGame(game) !== 'tie') {
        formPoints -= 15 * weight;
        // Penalty for blowout losses
        if (margin <= -THRESHOLDS.blowout) formPoints -= 5 * weight;
      }

      // Score relative to league average
      if (teamScore > this.leagueStats.averageScore * 1.1) {
        formPoints += 5 * weight;
      } else if (teamScore < this.leagueStats.averageScore * 0.9) {
        formPoints -= 5 * weight;
      }
    });

    return Math.max(0, Math.min(100, formPoints));
  }
}