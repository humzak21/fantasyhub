/**
 * Projection Calculator
 * 
 * Calculates playoff projections and last place projections for fantasy football teams.
 * Leverages PlayoffOddsCalculator and adds magic number calculations and path analysis.
 */

import { PlayoffOddsCalculator } from './playoffOddsCalculator.js';

export class ProjectionCalculator {
  constructor(teams, games, divisions, currentWeek, regularSeasonWeeks) {
    this.teams = Array.isArray(teams) ? teams : [];
    this.games = Array.isArray(games) ? games : [];
    this.divisions = Array.isArray(divisions) ? divisions : [];
    this.currentWeek = currentWeek;
    this.regularSeasonWeeks = regularSeasonWeeks;
    
    // Initialize playoff odds calculator
    this.playoffOddsCalc = new PlayoffOddsCalculator(
      teams,
      games,
      divisions,
      currentWeek,
      regularSeasonWeeks
    );
  }

  /**
   * Calculate playoff projections for all teams
   * @returns {Array} Array of team projections sorted by playoff odds (descending)
   */
  calculatePlayoffProjections() {
    const projections = [];
    
    // Get playoff odds from the calculator
    const playoffOdds = this.playoffOddsCalc.calculateAllPlayoffOdds();
    
    // Group teams by division
    const teamsByDivision = this.groupTeamsByDivision();
    
    // Calculate projections for each team
    for (const team of this.teams) {
      const divisionId = team.divisionId || team.division_id || 'unassigned';
      const divisionTeams = teamsByDivision.get(divisionId) || [];
      
      const projection = {
        ...team,
        divisionId,
        playoffOdds: playoffOdds.get(team.id) || 0,
        ...this.calculateMagicNumbers(team, divisionTeams),
        scheduleStrength: this.calculateRemainingScheduleStrength(team.id),
        remainingGames: this.getRemainingGames(team.id),
        path: this.getPlayoffPath(team, divisionTeams)
      };
      
      projections.push(projection);
    }
    
    // Sort by playoff odds (highest first)
    return projections.sort((a, b) => b.playoffOdds - a.playoffOdds);
  }

  /**
   * Calculate last place projections for all teams
   * @returns {Array} Array of team projections sorted by last place risk (descending)
   */
  calculateLastPlaceProjections() {
    const projections = [];
    
    // Group teams by division for last place calculation
    const teamsByDivision = this.groupTeamsByDivision();
    
    // Calculate projections for each team
    for (const team of this.teams) {
      const divisionId = team.divisionId || team.division_id || 'unassigned';
      const divisionTeams = teamsByDivision.get(divisionId) || [];
      
      const projection = {
        ...team,
        divisionId,
        lastPlaceOdds: this.calculateLastPlaceOdds(team, divisionTeams),
        gamesFromLast: this.calculateGamesFromLast(team, divisionTeams),
        scheduleStrength: this.calculateRemainingScheduleStrength(team.id),
        remainingGames: this.getRemainingGames(team.id),
        path: this.getLastPlacePath(team, divisionTeams)
      };
      
      projections.push(projection);
    }
    
    // Sort by last place odds (highest risk first)
    return projections.sort((a, b) => b.lastPlaceOdds - a.lastPlaceOdds);
  }

  /**
   * Get the number of games remaining for a specific team
   * @param {string} teamId - Team ID
   * @returns {number} Number of games remaining
   */
  getTeamGamesRemaining(teamId) {
    const remainingGames = this.getRemainingGames(teamId);
    return remainingGames.length;
  }

  /**
   * Calculate the realistic maximum wins a team can achieve
   * Considers the team's current wins plus their remaining games
   * @param {Object} team - Team to calculate for
   * @returns {number} Maximum possible wins
   */
  calculateTeamMaxWins(team) {
    const currentWins = team.wins || 0;
    const gamesRemaining = this.getTeamGamesRemaining(team.id);
    return currentWins + gamesRemaining;
  }

  /**
   * Calculate magic numbers for playoff clinching
   * @param {Object} team - Team to calculate for
   * @param {Array} divisionTeams - All teams in the division
   * @returns {Object} Magic numbers object
   */
  calculateMagicNumbers(team, divisionTeams) {
    const sortedTeams = this.sortTeamsByStandings(divisionTeams);
    const teamRank = sortedTeams.findIndex(t => t.id === team.id);
    const teamWins = team.wins || 0;
    const teamGamesRemaining = this.getTeamGamesRemaining(team.id);
    const teamMaxWins = teamWins + teamGamesRemaining;

    // Magic number is 0 if season is over
    if (teamGamesRemaining <= 0) {
      return {
        magicNumber: 0,
        clinched: teamRank < 3,
        eliminated: teamRank >= 3,
        gamesRemaining: 0
      };
    }

    // Calculate max wins for all teams in the division
    const teamsWithMaxWins = sortedTeams.map(t => ({
      ...t,
      maxWins: this.calculateTeamMaxWins(t),
      currentRank: sortedTeams.findIndex(st => st.id === t.id)
    }));

    // Sort by max wins (descending), then by points for (tiebreaker)
    const teamsByMaxWins = [...teamsWithMaxWins].sort((a, b) => {
      if (b.maxWins !== a.maxWins) {
        return b.maxWins - a.maxWins;
      }
      const aPointsFor = parseFloat(a.pointsFor || a.points_for || 0);
      const bPointsFor = parseFloat(b.pointsFor || b.points_for || 0);
      return bPointsFor - aPointsFor;
    });

    // Find the cutoff for 3rd place (the 3rd highest max wins)
    const thirdPlaceMaxWins = teamsByMaxWins[2]?.maxWins || 0;
    const fourthPlaceMaxWins = teamsByMaxWins[3]?.maxWins || 0;

    // Check if already clinched
    // Team has clinched if their current wins are higher than the 4th best team's max possible wins
    if (teamRank < 3 && teamWins > fourthPlaceMaxWins) {
      return {
        magicNumber: 0,
        clinched: true,
        eliminated: false,
        gamesRemaining: teamGamesRemaining
      };
    }

    // Check if eliminated
    // Team is eliminated if their max possible wins are less than the 3rd place team's current wins
    const thirdPlaceTeam = sortedTeams[2];
    const thirdPlaceCurrentWins = thirdPlaceTeam?.wins || 0;

    if (teamRank >= 3 && teamMaxWins < thirdPlaceCurrentWins) {
      return {
        magicNumber: 0,
        clinched: false,
        eliminated: true,
        gamesRemaining: teamGamesRemaining
      };
    }

    // Calculate magic number for teams not yet clinched or eliminated
    let magicNumber = 0;

    if (teamRank < 3) {
      // Teams in playoff spots: calculate wins needed to guarantee staying in top 3
      // Need to beat the 4th place team's maximum possible wins
      magicNumber = Math.max(0, fourthPlaceMaxWins - teamWins + 1);

      // If magic number exceeds games remaining, team cannot guarantee a spot (needs help)
      if (magicNumber > teamGamesRemaining) {
        magicNumber = teamGamesRemaining; // Show max possible, but they'll need help
      }
    } else {
      // Teams out of playoffs: calculate wins needed to guarantee catching 3rd place
      // Need to beat the current 3rd place team
      const thirdPlaceWins = thirdPlaceTeam?.wins || 0;
      magicNumber = Math.max(0, thirdPlaceWins - teamWins + 1);

      // Can't exceed remaining games
      if (magicNumber > teamGamesRemaining) {
        // Mathematically eliminated if can't catch 3rd
        return {
          magicNumber: 0,
          clinched: false,
          eliminated: true,
          gamesRemaining: teamGamesRemaining
        };
      }
    }

    return {
      magicNumber,
      clinched: false,
      eliminated: false,
      gamesRemaining: teamGamesRemaining
    };
  }

  /**
   * Calculate remaining schedule strength
   * @param {string} teamId - Team ID
   * @returns {Object} Schedule strength data
   */
  calculateRemainingScheduleStrength(teamId) {
    const remainingGames = this.getRemainingGames(teamId);
    
    if (remainingGames.length === 0) {
      return {
        difficulty: 'N/A',
        avgOpponentWinPct: 0,
        avgOpponentPPG: 0,
        description: 'No games remaining'
      };
    }
    
    let totalOpponentWinPct = 0;
    let totalOpponentPPG = 0;
    let opponentCount = 0;
    
    for (const game of remainingGames) {
      const opponentId = game.team1Id === teamId ? game.team2Id : game.team1Id;
      const opponent = this.teams.find(t => t.id === opponentId);
      
      if (opponent) {
        const oppWins = opponent.wins || 0;
        const oppLosses = opponent.losses || 0;
        const oppGames = oppWins + oppLosses;
        const oppWinPct = oppGames > 0 ? oppWins / oppGames : 0.5;
        
        const oppPoints = opponent.pointsFor || opponent.points_for || 0;
        const oppPPG = oppGames > 0 ? oppPoints / oppGames : 0;
        
        totalOpponentWinPct += oppWinPct;
        totalOpponentPPG += oppPPG;
        opponentCount++;
      }
    }
    
    const avgOpponentWinPct = opponentCount > 0 ? totalOpponentWinPct / opponentCount : 0.5;
    const avgOpponentPPG = opponentCount > 0 ? totalOpponentPPG / opponentCount : 0;
    
    // Determine difficulty level
    let difficulty = 'Average';
    if (avgOpponentWinPct > 0.6) {
      difficulty = 'Very Hard';
    } else if (avgOpponentWinPct > 0.55) {
      difficulty = 'Hard';
    } else if (avgOpponentWinPct < 0.4) {
      difficulty = 'Very Easy';
    } else if (avgOpponentWinPct < 0.45) {
      difficulty = 'Easy';
    }
    
    return {
      difficulty,
      avgOpponentWinPct,
      avgOpponentPPG,
      description: `Opponents avg: ${(avgOpponentWinPct * 100).toFixed(1)}% win rate, ${avgOpponentPPG.toFixed(1)} PPG`
    };
  }

  /**
   * Get playoff path scenarios for a team
   * @param {Object} team - Team to analyze
   * @param {Array} divisionTeams - All teams in division
   * @returns {Object} Path analysis
   */
  getPlayoffPath(team, divisionTeams) {
    const gamesRemaining = this.getTeamGamesRemaining(team.id);
    const sortedTeams = this.sortTeamsByStandings(divisionTeams);
    const teamRank = sortedTeams.findIndex(t => t.id === team.id) + 1;
    const teamWins = team.wins || 0;

    const scenarios = [];

    if (gamesRemaining <= 0) {
      scenarios.push({
        type: 'final',
        description: `Season complete - ${teamRank <= 3 ? 'Made playoffs' : 'Missed playoffs'}`,
        probability: 100
      });
      return { scenarios, summary: scenarios[0].description };
    }

    // Check clinched/eliminated
    const magicNumbers = this.calculateMagicNumbers(team, divisionTeams);
    if (magicNumbers.clinched) {
      scenarios.push({
        type: 'clinched',
        description: 'Clinched playoff spot',
        probability: 100
      });
      return { scenarios, summary: 'Playoffs clinched' };
    }

    if (magicNumbers.eliminated) {
      scenarios.push({
        type: 'eliminated',
        description: 'Mathematically eliminated from playoffs',
        probability: 100
      });
      return { scenarios, summary: 'Eliminated' };
    }

    // Generate scenarios based on wins needed
    const winsNeeded = magicNumbers.magicNumber;
    
    if (teamRank <= 3) {
      // In playoff spot
      if (winsNeeded === 0) {
        scenarios.push({
          type: 'favorable',
          description: 'Control own destiny - in playoff position',
          probability: 'high'
        });
      } else {
        scenarios.push({
          type: 'maintain',
          description: `Need ${winsNeeded} win${winsNeeded > 1 ? 's' : ''} in remaining ${gamesRemaining} games to secure spot`,
          probability: winsNeeded <= gamesRemaining / 2 ? 'high' : 'medium'
        });
      }
    } else {
      // Out of playoff spot
      scenarios.push({
        type: 'chase',
        description: `Need ${winsNeeded} win${winsNeeded > 1 ? 's' : ''} in remaining ${gamesRemaining} games to catch playoff teams`,
        probability: winsNeeded <= gamesRemaining ? 'possible' : 'unlikely'
      });
      
      // Add help needed scenario
      if (winsNeeded > gamesRemaining / 2) {
        scenarios.push({
          type: 'help',
          description: 'Need help from other games to make playoffs',
          probability: 'low'
        });
      }
    }
    
    const summary = scenarios[0]?.description || 'Calculating path...';
    return { scenarios, summary };
  }

  /**
   * Calculate last place odds for a team
   * @param {Object} team - Team to calculate for
   * @param {Array} divisionTeams - All teams in division
   * @returns {number} Last place odds percentage (0-100)
   */
  calculateLastPlaceOdds(team, divisionTeams) {
    const sortedTeams = this.sortTeamsByStandings(divisionTeams);
    const teamRank = sortedTeams.findIndex(t => t.id === team.id);
    const gamesRemaining = this.getTeamGamesRemaining(team.id);
    
    // Season over
    if (gamesRemaining <= 0) {
      return teamRank === sortedTeams.length - 1 ? 100 : 0;
    }
    
    // Base odds on current position (inverse of playoff odds)
    let baseOdds = 10;
    const lastPlace = sortedTeams.length - 1;
    const secondLast = sortedTeams.length - 2;
    
    if (teamRank === lastPlace) {
      baseOdds = 60;
    } else if (teamRank === secondLast) {
      baseOdds = 30;
    } else if (teamRank === secondLast - 1) {
      baseOdds = 15;
    }
    
    // Adjust for games behind last place
    const lastPlaceTeam = sortedTeams[lastPlace];
    const lastPlaceWins = lastPlaceTeam?.wins || 0;
    const teamWins = team.wins || 0;
    const gamesDiff = teamWins - lastPlaceWins;
    
    // If ahead, decrease odds. If behind (shouldn't happen), increase
    const gamesDiffFactor = gamesDiff * -8;
    
    // Win percentage momentum
    const teamLosses = team.losses || 0;
    const totalGames = teamWins + teamLosses;
    const winPct = totalGames > 0 ? teamWins / totalGames : 0.5;
    const momentumFactor = (0.5 - winPct) * 30; // Poor record increases odds
    
    // Schedule difficulty (harder schedule = higher last place odds)
    const scheduleData = this.calculateRemainingScheduleStrength(team.id);
    let scheduleFactor = 0;
    if (scheduleData.avgOpponentWinPct > 0.55) {
      scheduleFactor = 10;
    } else if (scheduleData.avgOpponentWinPct < 0.45) {
      scheduleFactor = -10;
    }
    
    let finalOdds = baseOdds + gamesDiffFactor + momentumFactor + scheduleFactor;

    // Check if mathematically safe from last
    const secondLastTeam = sortedTeams[secondLast];
    if (secondLastTeam) {
      const secondLastGamesRemaining = this.getTeamGamesRemaining(secondLastTeam.id);
      const secondLastMaxWins = (secondLastTeam.wins || 0) + secondLastGamesRemaining;
      if (teamWins > secondLastMaxWins && teamRank < secondLast) {
        finalOdds = 0; // Safe from last
      }
    }

    // Check if locked into last
    if (teamRank === lastPlace) {
      const secondLastMinWins = secondLastTeam?.wins || 0;
      if (teamWins + gamesRemaining < secondLastMinWins) {
        finalOdds = 100; // Locked into last
      }
    }
    
    return Math.max(0, Math.min(100, Math.round(finalOdds)));
  }

  /**
   * Calculate games from last place
   * @param {Object} team - Team to calculate for
   * @param {Array} divisionTeams - All teams in division (unused, kept for backwards compatibility)
   * @returns {number} Games ahead of last place (positive if ahead, 0 if in last)
   */
  calculateGamesFromLast(team, divisionTeams) {
    // Find the worst team across ALL teams (league-wide last place)
    const sortedAllTeams = this.sortTeamsByStandings(this.teams);
    const lastPlaceTeam = sortedAllTeams[sortedAllTeams.length - 1];

    if (!lastPlaceTeam) return 0;

    const teamWins = team.wins || 0;
    const lastPlaceWins = lastPlaceTeam.wins || 0;

    // Positive = ahead of last, 0 if team IS in last place
    const gamesDiff = teamWins - lastPlaceWins;

    // If this team IS the last place team, return 0
    if (team.id === lastPlaceTeam.id) {
      return 0;
    }

    return gamesDiff;
  }

  /**
   * Get last place path scenarios for a team
   * @param {Object} team - Team to analyze
   * @param {Array} divisionTeams - All teams in division
   * @returns {Object} Path analysis
   */
  getLastPlacePath(team, divisionTeams) {
    const gamesRemaining = this.getTeamGamesRemaining(team.id);

    // Check league-wide standings for last place status
    const sortedAllTeams = this.sortTeamsByStandings(this.teams);
    const leagueWideRank = sortedAllTeams.findIndex(t => t.id === team.id) + 1;
    const isCurrentlyLast = leagueWideRank === sortedAllTeams.length;

    const gamesFromLast = this.calculateGamesFromLast(team, divisionTeams);

    const scenarios = [];

    if (gamesRemaining <= 0) {
      scenarios.push({
        type: 'final',
        description: `Season complete - ${isCurrentlyLast ? 'Finished last' : 'Avoided last place'}`,
        probability: 100
      });
      return { scenarios, summary: scenarios[0].description };
    }

    // Check if locked into last or safe
    const lastPlaceOdds = this.calculateLastPlaceOdds(team, divisionTeams);

    if (lastPlaceOdds === 100) {
      scenarios.push({
        type: 'locked',
        description: 'Locked into last place',
        probability: 100
      });
      return { scenarios, summary: 'Locked into last' };
    }

    if (lastPlaceOdds === 0 && gamesFromLast > 2) {
      scenarios.push({
        type: 'safe',
        description: 'Safe from last place',
        probability: 100
      });
      return { scenarios, summary: 'Safe from last' };
    }

    // Generate scenarios based on league-wide position
    if (isCurrentlyLast) {
      // Currently in last place league-wide
      scenarios.push({
        type: 'escape',
        description: `Currently in last - need wins to escape (0 games behind)`,
        probability: gamesRemaining > 0 ? 'possible' : 'difficult'
      });
    } else if (gamesFromLast === 1) {
      // One game ahead of last
      scenarios.push({
        type: 'risk',
        description: 'One game from last - losses could drop you',
        probability: 'medium'
      });
    } else if (gamesFromLast <= 2) {
      // Close to last (2 games ahead)
      scenarios.push({
        type: 'danger',
        description: `Only ${gamesFromLast} game${gamesFromLast > 1 ? 's' : ''} ahead of last`,
        probability: 'low'
      });
    } else {
      // Comfortable lead (3+ games ahead)
      scenarios.push({
        type: 'comfortable',
        description: `${gamesFromLast} games ahead of last place`,
        probability: 'very low'
      });
    }

    const summary = scenarios[0]?.description || 'Calculating path...';
    return { scenarios, summary };
  }

  /**
   * Get remaining games for a team
   * @param {string} teamId - Team ID
   * @returns {Array} Array of remaining games
   */
  getRemainingGames(teamId) {
    return this.games.filter(game => {
      const t1Id = game.team1Id || game.team1_id;
      const t2Id = game.team2Id || game.team2_id;
      const completed = game.isCompleted || game.is_completed || 
                       (game.team1_score !== null && game.team2_score !== null);
      
      return (t1Id === teamId || t2Id === teamId) &&
             !completed &&
             game.week <= this.regularSeasonWeeks;
    });
  }

  /**
   * Group teams by division
   * @returns {Map} Map of divisionId -> teams array
   */
  groupTeamsByDivision() {
    const teamsByDivision = new Map();
    
    for (const team of this.teams) {
      const divisionId = team.divisionId || team.division_id || 'unassigned';
      
      if (!teamsByDivision.has(divisionId)) {
        teamsByDivision.set(divisionId, []);
      }
      
      teamsByDivision.get(divisionId).push(team);
    }
    
    return teamsByDivision;
  }

  /**
   * Sort teams by standings (wins desc, then points for desc)
   * @param {Array} teams - Teams to sort
   * @returns {Array} Sorted teams
   */
  sortTeamsByStandings(teams) {
    return [...teams].sort((a, b) => {
      const aWins = a.wins || 0;
      const bWins = b.wins || 0;
      
      if (bWins !== aWins) {
        return bWins - aWins;
      }
      
      const aPointsFor = parseFloat(a.pointsFor || a.points_for || 0);
      const bPointsFor = parseFloat(b.pointsFor || b.points_for || 0);
      return bPointsFor - aPointsFor;
    });
  }
}

export default ProjectionCalculator;

