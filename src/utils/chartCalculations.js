/**
 * Chart data calculation utilities for fantasy football statistics
 * Transforms raw game/team data into formats suitable for visualization
 */

/**
 * Calculate score distribution (high/low/average/quartiles) for each team
 * Used for: Score Distribution Chart (Box Plot)
 */
export const calculateScoreDistribution = (rankings = [], schedule = []) => {
  if (!rankings.length || !schedule.length) return [];

  const scoresByTeam = {};

  // Initialize score arrays for each team
  rankings.forEach(team => {
    scoresByTeam[team.id] = [];
  });

  // Collect all scores for each team
  schedule.forEach(game => {
    if (game.isCompleted) {
      if (scoresByTeam[game.team1Id]) {
        scoresByTeam[game.team1Id].push(game.team1Score);
      }
      if (scoresByTeam[game.team2Id]) {
        scoresByTeam[game.team2Id].push(game.team2Score);
      }
    }
  });

  // Calculate statistics for each team
  return rankings.map(team => {
    const scores = scoresByTeam[team.id] || [];

    if (scores.length === 0) {
      return {
        teamId: team.id,
        teamName: team.name,
        owner: team.owner,
        gamesPlayed: 0,
        min: 0,
        max: 0,
        average: 0,
        median: 0,
        q1: 0,
        q3: 0,
        stdDev: 0
      };
    }

    // Sort scores for percentile calculations
    const sorted = [...scores].sort((a, b) => a - b);
    const n = sorted.length;

    // Calculate basic stats
    const sum = scores.reduce((a, b) => a + b, 0);
    const average = sum / n;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // Calculate percentiles
    const getPercentile = (arr, p) => {
      const index = (p / 100) * (arr.length - 1);
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const weight = index % 1;

      if (lower === upper) {
        return arr[lower];
      }
      return arr[lower] * (1 - weight) + arr[upper] * weight;
    };

    return {
      teamId: team.id,
      teamName: team.name,
      owner: team.owner,
      gamesPlayed: n,
      min: sorted[0],
      max: sorted[n - 1],
      average: Math.round(average * 100) / 100,
      median: getPercentile(sorted, 50),
      q1: getPercentile(sorted, 25),
      q3: getPercentile(sorted, 75),
      stdDev: Math.round(stdDev * 100) / 100
    };
  });
};

/**
 * Calculate weekly scoring trends for each team over time
 * Used for: Weekly Scoring Trends Chart (Multi-line)
 */
export const calculateWeeklyScoringTrends = (rankings = [], schedule = []) => {
  if (!rankings.length || !schedule.length) return [];

  // Group games by week
  const gamesByWeek = {};
  schedule.forEach(game => {
    if (game.isCompleted) {
      if (!gamesByWeek[game.week]) {
        gamesByWeek[game.week] = [];
      }
      gamesByWeek[game.week].push(game);
    }
  });

  // Sort weeks numerically
  const weeks = Object.keys(gamesByWeek)
    .map(Number)
    .sort((a, b) => a - b);

  // Build data for each week
  return weeks.map(week => {
    const weekData = { week };
    const weekGames = gamesByWeek[week];

    rankings.forEach(team => {
      let teamScore = null;

      // Find the team's score in this week
      const gameWithTeam = weekGames.find(
        g => (g.team1Id === team.id && g.team1Score) || (g.team2Id === team.id && g.team2Score)
      );

      if (gameWithTeam) {
        teamScore = gameWithTeam.team1Id === team.id ? gameWithTeam.team1Score : gameWithTeam.team2Score;
      }

      weekData[team.id] = teamScore;
    });

    return weekData;
  });
};

/**
 * Calculate margin of victory for each team
 * Used for: Margin of Victory Chart (Horizontal Bar)
 */
export const calculateMarginOfVictory = (rankings = [], schedule = []) => {
  if (!rankings.length || !schedule.length) return [];

  return rankings.map(team => {
    let totalMargin = 0;
    let gamesWithMargin = 0;

    schedule.forEach(game => {
      if (game.isCompleted) {
        if (game.team1Id === team.id) {
          const margin = game.team1Score - game.team2Score;
          totalMargin += margin;
          gamesWithMargin++;
        } else if (game.team2Id === team.id) {
          const margin = game.team2Score - game.team1Score;
          totalMargin += margin;
          gamesWithMargin++;
        }
      }
    });

    const avgMargin = gamesWithMargin > 0 ? Math.round((totalMargin / gamesWithMargin) * 100) / 100 : 0;

    return {
      teamId: team.id,
      teamName: team.name,
      owner: team.owner,
      marginOfVictory: avgMargin,
      gamesPlayed: gamesWithMargin,
      totalMargin
    };
  });
};

/**
 * Calculate ranking position changes week-over-week
 * Used for: Rankings Movement Chart (Line)
 *
 * Note: Rankings calculation is now done in the RankingsMovementChart component
 * using the PowerRankingCalculator for each week.
 */
export const calculateRankingMovement = (rankingsHistory = []) => {
  if (!rankingsHistory.length) return [];

  // Group rankings by week
  const rankingsByWeek = {};
  rankingsHistory.forEach(snapshot => {
    const week = snapshot.week;
    if (!rankingsByWeek[week]) {
      rankingsByWeek[week] = [];
    }
    rankingsByWeek[week].push(snapshot);
  });

  // Sort weeks
  const weeks = Object.keys(rankingsByWeek)
    .map(Number)
    .sort((a, b) => a - b);

  if (weeks.length === 0) return [];

  // Get all unique teams from the rankings
  const allTeams = new Set();
  Object.values(rankingsByWeek).forEach(weekRankings => {
    weekRankings.forEach(ranking => {
      allTeams.add(ranking.teamId);
    });
  });

  // Build data for each week
  return weeks.map((week, weekIndex) => {
    const weekData = { week };
    const weekRankings = rankingsByWeek[week];

    // Create a rank map for this week
    const rankMap = {};
    weekRankings.forEach((ranking, index) => {
      rankMap[ranking.teamId] = index + 1; // 1-indexed rank
    });

    // For each team, record its rank
    allTeams.forEach(teamId => {
      weekData[teamId] = rankMap[teamId] || null;
    });

    return weekData;
  });
};

/**
 * Calculate all-play records (wins/losses against median score)
 * Used for: All-Play Records Chart (Bar)
 */
export const calculateAllPlayRecords = (rankings = [], schedule = []) => {
  if (!rankings.length || !schedule.length) return [];

  // Group games by week and calculate median
  const gamesByWeek = {};
  schedule.forEach(game => {
    if (game.isCompleted) {
      if (!gamesByWeek[game.week]) {
        gamesByWeek[game.week] = [];
      }
      gamesByWeek[game.week].push(game);
    }
  });

  // Calculate all-play records for each team
  return rankings.map(team => {
    let allPlayWins = 0;
    let allPlayLosses = 0;

    // Check each week's games
    Object.entries(gamesByWeek).forEach(([week, weekGames]) => {
      // Calculate median score for the week
      const allScores = [];
      weekGames.forEach(game => {
        allScores.push(game.team1Score);
        allScores.push(game.team2Score);
      });

      const sortedScores = [...allScores].sort((a, b) => a - b);
      const medianIndex = Math.floor(sortedScores.length / 2);
      const median =
        sortedScores.length % 2 === 0
          ? (sortedScores[medianIndex - 1] + sortedScores[medianIndex]) / 2
          : sortedScores[medianIndex];

      // Check team's score against median
      const gameWithTeam = weekGames.find(g => g.team1Id === team.id || g.team2Id === team.id);
      if (gameWithTeam) {
        const teamScore = gameWithTeam.team1Id === team.id ? gameWithTeam.team1Score : gameWithTeam.team2Score;
        if (teamScore > median) {
          allPlayWins++;
        } else if (teamScore < median) {
          allPlayLosses++;
        }
        // Ties don't count as wins or losses in all-play
      }
    });

    const totalAllPlayGames = allPlayWins + allPlayLosses;
    const allPlayWinPercentage = totalAllPlayGames > 0 ? (allPlayWins / totalAllPlayGames * 100) : 0;

    return {
      teamId: team.id,
      teamName: team.name,
      owner: team.owner,
      allPlayWins,
      allPlayLosses,
      allPlayWinPercentage: Math.round(allPlayWinPercentage * 100) / 100,
      totalGames: totalAllPlayGames
    };
  });
};

/**
 * Helper function to filter data by week range
 */
export const filterByWeekRange = (data, minWeek, maxWeek, weekFieldName = 'week') => {
  if (!data || !Array.isArray(data)) return data;
  return data.filter(item => {
    const week = item[weekFieldName];
    return week >= minWeek && week <= maxWeek;
  });
};

/**
 * Helper function to filter teams from chart data
 */
export const filterTeamsFromChartData = (data, selectedTeamIds = []) => {
  if (!data || !Array.isArray(data)) return data;
  if (selectedTeamIds.length === 0) return data;

  // For array data with teamId or team1Id/team2Id
  return data.filter(item => {
    if (item.teamId) return selectedTeamIds.includes(item.teamId);
    if (item.team1Id && item.team2Id) {
      return selectedTeamIds.includes(item.team1Id) || selectedTeamIds.includes(item.team2Id);
    }
    return true;
  });
};

/**
 * Helper function to extract team metadata for chart legends
 */
export const getTeamMetadata = (rankings = []) => {
  return rankings.map(team => ({
    teamId: team.id,
    teamName: team.name,
    owner: team.owner
  }));
};
