/**
 * Sample Analytics Data for Demonstration
 * 
 * This provides sample analytics data to demonstrate the analytics features
 * when real FFAnalytics data is not yet available.
 */

export const getSampleAnalyticsData = (teams = [], currentWeek = 1) => {
  if (!teams || teams.length === 0) return {};

  const sampleData = {};

  // Create sample data for first few teams to demonstrate the feature
  teams.slice(0, Math.min(4, teams.length)).forEach((team, index) => {
    const teamId = team.teamId || team.id;
    const powerRating = team.powerRating || 50;
    
    // Create realistic sample data based on team performance
    const isTopTeam = powerRating > 75;
    const isBottomTeam = powerRating < 45;
    
    sampleData[teamId] = {
      trendingUpPlayers: isTopTeam ? 3 : isBottomTeam ? 1 : 2,
      trendingDownPlayers: isBottomTeam ? 2 : isTopTeam ? 0 : 1,
      totalCeilingScore: Math.round(powerRating * 1.8 + Math.random() * 20),
      totalFloorScore: Math.round(powerRating * 1.2 + Math.random() * 15),
      avgPlayerRank: isTopTeam ? 15 : isBottomTeam ? 45 : 30,
      avgTrendScore: isTopTeam ? 0.25 : isBottomTeam ? -0.15 : 0.05,
      consistencyRating: isTopTeam ? 0.8 : isBottomTeam ? 0.5 : 0.65,
      analyticsStrengthScore: Math.round(powerRating * 0.9 + Math.random() * 15),
      playerAnalytics: [
        {
          playerId: `${teamId}-qb`,
          playerName: 'Josh Allen',
          position: 'QB',
          weeklyRank: isTopTeam ? 5 : isBottomTeam ? 18 : 12,
          positionRank: isTopTeam ? 2 : isBottomTeam ? 8 : 5,
          projectedPoints: isTopTeam ? 24.5 : isBottomTeam ? 18.2 : 21.3,
          trendScore: isTopTeam ? 0.3 : isBottomTeam ? -0.2 : 0.1,
          consistencyRating: 0.85,
          ceilingScore: isTopTeam ? 32 : isBottomTeam ? 24 : 28,
          floorScore: isTopTeam ? 18 : isBottomTeam ? 12 : 15
        },
        {
          playerId: `${teamId}-rb1`,
          playerName: 'Christian McCaffrey',
          position: 'RB',
          weeklyRank: isTopTeam ? 3 : isBottomTeam ? 25 : 15,
          positionRank: isTopTeam ? 1 : isBottomTeam ? 12 : 6,
          projectedPoints: isTopTeam ? 22.8 : isBottomTeam ? 14.5 : 18.2,
          trendScore: isTopTeam ? 0.2 : isBottomTeam ? -0.3 : -0.05,
          consistencyRating: 0.72,
          ceilingScore: isTopTeam ? 28 : isBottomTeam ? 20 : 24,
          floorScore: isTopTeam ? 16 : isBottomTeam ? 8 : 12
        },
        {
          playerId: `${teamId}-wr1`,
          playerName: 'Cooper Kupp',
          position: 'WR',
          weeklyRank: isTopTeam ? 8 : isBottomTeam ? 32 : 20,
          positionRank: isTopTeam ? 3 : isBottomTeam ? 15 : 9,
          projectedPoints: isTopTeam ? 19.5 : isBottomTeam ? 12.8 : 16.2,
          trendScore: isTopTeam ? 0.15 : isBottomTeam ? -0.25 : 0.08,
          consistencyRating: 0.68,
          ceilingScore: isTopTeam ? 26 : isBottomTeam ? 18 : 22,
          floorScore: isTopTeam ? 12 : isBottomTeam ? 6 : 9
        }
      ]
    };
  });

  return sampleData;
};

// Check if we should show sample data (for demo purposes)
export const shouldUseSampleData = () => {
  // Show sample data if no real analytics service is configured
  // In production, this would check for proper FFAnalytics configuration
  return true; // For demo purposes, always show sample data
};