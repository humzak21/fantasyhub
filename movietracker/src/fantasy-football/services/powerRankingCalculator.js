import { POWER_RANKING_WEIGHTS, THRESHOLDS } from '../types/index.js';

export class PowerRankingCalculator {
  constructor(teams, games, currentWeek = 1) {
    this.teams = teams;
    this.games = games;
    this.currentWeek = currentWeek;
    this.leagueStats = this.calculateLeagueStats();
  }

  calculateLeagueStats() {
    const completedGames = this.games.filter(game => game.isCompleted);
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
    return 'tie';
  }

  calculateTeamStats(teamId) {
    const teamGames = this.games.filter(game => 
      (game.team1Id === teamId || game.team2Id === teamId) && game.isCompleted
    );

    if (teamGames.length === 0) {
      return this.getDefaultStats(teamId);
    }

    const wins = teamGames.filter(game => this.getWinnerFromGame(game) === teamId).length;
    const losses = teamGames.filter(game => {
      const winner = this.getWinnerFromGame(game);
      return winner !== teamId && winner !== 'tie';
    }).length;
    const ties = teamGames.filter(game => this.getWinnerFromGame(game) === 'tie').length;

    const pointsFor = teamGames.reduce((sum, game) => {
      return sum + (game.team1Id === teamId ? game.team1Score : game.team2Score);
    }, 0);

    const pointsAgainst = teamGames.reduce((sum, game) => {
      return sum + (game.team1Id === teamId ? game.team2Score : game.team1Score);
    }, 0);

    const gamesPlayed = teamGames.length;
    const winPercentage = gamesPlayed > 0 ? wins / gamesPlayed : 0;
    const pointDifferential = pointsFor - pointsAgainst;
    const averagePointsFor = gamesPlayed > 0 ? pointsFor / gamesPlayed : 0;
    const averagePointsAgainst = gamesPlayed > 0 ? pointsAgainst / gamesPlayed : 0;

    // Calculate strength of schedule
    const opponentIds = teamGames.map(game => 
      game.team1Id === teamId ? game.team2Id : game.team1Id
    );
    const opponentWinPercentage = this.calculateOpponentWinPercentage(opponentIds, teamId);
    const strengthOfSchedule = opponentWinPercentage - this.leagueStats.averageWinPercentage;

    // Calculate quality metrics
    const qualityWins = this.calculateQualityWins(teamId, teamGames);
    const badLosses = this.calculateBadLosses(teamId, teamGames);
    
    // Calculate game type counts
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

    // Calculate recent form (last 4 weeks)
    const recentForm = this.calculateRecentForm(teamId);

    // Calculate current streak
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
    // This is a simplified version - in a real implementation, you'd need 
    // the current rankings to determine what constitutes a "quality" win
    return teamGames.filter(game => {
      const winner = this.getWinnerFromGame(game);
      const teamScore = game.team1Id === teamId ? game.team1Score : game.team2Score;
      const oppScore = game.team1Id === teamId ? game.team2Score : game.team1Score;
      
      // For now, consider wins against teams with good records or high scores as quality
      return winner === teamId && (oppScore >= this.leagueStats.averageScore * 1.1);
    }).length;
  }

  calculateBadLosses(teamId, teamGames) {
    // Simplified version - losses to teams with poor records or low scores
    return teamGames.filter(game => {
      const winner = this.getWinnerFromGame(game);
      const oppScore = game.team1Id === teamId ? game.team2Score : game.team1Score;
      
      return winner !== teamId && winner !== 'tie' && (oppScore <= this.leagueStats.averageScore * 0.8);
    }).length;
  }

  calculateRecentForm(teamId) {
    const recentWeekStart = Math.max(1, this.currentWeek - THRESHOLDS.recentFormWeeks + 1);
    const recentGames = this.games.filter(game => 
      (game.team1Id === teamId || game.team2Id === teamId) && 
      game.isCompleted &&
      game.week >= recentWeekStart && 
      game.week <= this.currentWeek
    );

    if (recentGames.length === 0) return 0;

    const recentPoints = recentGames.reduce((sum, game) => {
      return sum + (game.team1Id === teamId ? game.team1Score : game.team2Score);
    }, 0);

    const recentAverage = recentPoints / recentGames.length;
    return recentAverage - this.leagueStats.averageScore;
  }

  calculateCurrentStreak(teamId, teamGames) {
    if (teamGames.length === 0) return { type: 'none', length: 0 };

    // Sort games by week (most recent first)
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

  calculatePowerRating(teamStats) {
    const {
      winPercentage,
      pointDifferential,
      strengthOfSchedule,
      recentForm,
      qualityWins,
      averagePointsFor,
      badLosses
    } = teamStats;

    // Normalize values for calculation
    const normalizedPointDiff = pointDifferential / 100; // Scale point differential
    const normalizedPPG = (averagePointsFor - this.leagueStats.averageScore) / 50; // Scale PPG relative to league average
    const normalizedSOS = strengthOfSchedule * 100; // Scale SOS
    const normalizedForm = recentForm / 50; // Scale recent form

    const powerRating = 
      (winPercentage * POWER_RANKING_WEIGHTS.winPercentage * 100) +
      (normalizedPointDiff * POWER_RANKING_WEIGHTS.pointDifferential * 100) +
      (normalizedSOS * POWER_RANKING_WEIGHTS.strengthOfSchedule) +
      (normalizedForm * POWER_RANKING_WEIGHTS.recentForm * 100) +
      (qualityWins * POWER_RANKING_WEIGHTS.qualityWins * 10) +
      (normalizedPPG * POWER_RANKING_WEIGHTS.averagePointsFor * 100) +
      (badLosses * POWER_RANKING_WEIGHTS.badLosses * 10);

    return Math.max(0, powerRating); // Ensure non-negative rating
  }

  calculateAllTeamStats() {
    return this.teams.map(team => {
      const stats = this.calculateTeamStats(team.id);
      const powerRating = this.calculatePowerRating(stats);
      
      return {
        ...team,
        ...stats,
        powerRating
      };
    });
  }

  getRankings(previousRankings = null) {
    const teamStats = this.calculateAllTeamStats();
    
    // Sort by power rating (highest first)
    const rankings = teamStats.sort((a, b) => b.powerRating - a.powerRating);
    
    // Add rank and rank change information
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
}