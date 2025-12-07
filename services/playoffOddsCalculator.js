/**
 * Playoff Odds Calculator
 * 
 * Calculates playoff odds for teams in a 2-division fantasy football league
 * where top 3 teams from each division make the playoffs.
 * 
 * Tiebreaker: Points For (higher points for wins the tiebreaker)
 */

export class PlayoffOddsCalculator {
  constructor(teams, games, divisions, currentWeek, regularSeasonWeeks) {
    this.teams = Array.isArray(teams) ? teams : [];
    this.games = Array.isArray(games) ? games : [];
    this.divisions = Array.isArray(divisions) ? divisions : [];
    this.currentWeek = currentWeek;
    this.regularSeasonWeeks = regularSeasonWeeks;
  }

  /**
   * Calculate playoff odds for all teams
   * @returns {Map} Map of teamId -> playoff odds percentage (0-100)
   */
  calculateAllPlayoffOdds() {
    const playoffOdds = new Map();



    // Group teams by division
    const teamsByDivision = this.groupTeamsByDivision();



    // Calculate odds for each division
    for (const [divisionId, divisionTeams] of teamsByDivision.entries()) {
      const divisionOdds = this.calculateDivisionPlayoffOdds(divisionTeams);

      // Store odds in the map
      for (const [teamId, odds] of divisionOdds.entries()) {
        playoffOdds.set(teamId, odds);
      }
    }



    return playoffOdds;
  }

  /**
   * Group teams by their division
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
   * Calculate playoff odds for teams within a single division
   * @param {Array} divisionTeams - Teams in the division
   * @returns {Map} Map of teamId -> playoff odds percentage
   */
  calculateDivisionPlayoffOdds(divisionTeams) {
    const odds = new Map();



    if (divisionTeams.length === 0) {

      return odds;
    }

    // Sort teams by current standings (wins desc, then points for desc)
    const sortedTeams = this.sortTeamsByStandings(divisionTeams);



    // Calculate remaining games for the season
    const gamesRemaining = this.regularSeasonWeeks - (this.currentWeek - 1);


    // If season is over, odds are 100% for top 3, 0% for others
    if (gamesRemaining <= 0) {
      sortedTeams.forEach((team, index) => {
        odds.set(team.id, index < 3 ? 100 : 0);
      });
      return odds;
    }

    // Calculate the cutoff line (3rd place)
    const cutoffTeam = sortedTeams[2]; // 3rd place team (0-indexed)
    const cutoffWins = cutoffTeam?.wins || 0;
    const cutoffPointsFor = parseFloat(cutoffTeam?.pointsFor || cutoffTeam?.points_for || 0);

    // Calculate odds for each team
    for (let i = 0; i < sortedTeams.length; i++) {
      const team = sortedTeams[i];
      const teamOdds = this.calculateTeamPlayoffOdds(
        team,
        i,
        sortedTeams,
        cutoffWins,
        cutoffPointsFor,
        gamesRemaining
      );

      odds.set(team.id, teamOdds);
    }



    return odds;
  }

  /**
   * Calculate playoff odds for a single team
   * @param {Object} team - The team to calculate odds for
   * @param {number} currentRank - Current division rank (0-indexed)
   * @param {Array} allTeams - All teams in division
   * @param {number} cutoffWins - Wins of 3rd place team
   * @param {number} cutoffPointsFor - Points for of 3rd place team
   * @param {number} gamesRemaining - Games remaining in regular season
   * @returns {number} Playoff odds percentage (0-100)
   */
  calculateTeamPlayoffOdds(team, currentRank, allTeams, cutoffWins, cutoffPointsFor, gamesRemaining) {
    const teamWins = team.wins || 0;
    const teamPointsFor = parseFloat(team.pointsFor || team.points_for || 0);
    const teamLosses = team.losses || 0;
    const totalGamesPlayed = teamWins + teamLosses;

    // Base odds based on current position
    let baseOdds = 50;
    if (currentRank === 0) {
      baseOdds = 95; // 1st place starts high
    } else if (currentRank === 1) {
      baseOdds = 85; // 2nd place
    } else if (currentRank === 2) {
      baseOdds = 70; // 3rd place (on the bubble)
    } else if (currentRank === 3) {
      baseOdds = 40; // 4th place
    } else if (currentRank === 4) {
      baseOdds = 20; // 5th place
    } else {
      baseOdds = 5; // 6th+ place
    }

    // Games behind/ahead factor
    const gamesFromCutoff = teamWins - cutoffWins;
    let gamesBehindFactor = 0;

    if (gamesFromCutoff > 0) {
      // Team is ahead of cutoff
      gamesBehindFactor = Math.min(30, gamesFromCutoff * 10);
    } else if (gamesFromCutoff < 0) {
      // Team is behind cutoff
      const gamesCanMakeUp = gamesRemaining + gamesFromCutoff;
      if (gamesCanMakeUp < 0) {
        // Mathematically eliminated
        return 0;
      }
      gamesBehindFactor = Math.max(-40, gamesFromCutoff * 12);
    } else {
      // Tied with cutoff, use points for as tiebreaker indicator
      if (teamPointsFor > cutoffPointsFor) {
        gamesBehindFactor = 5;
      } else if (teamPointsFor < cutoffPointsFor) {
        gamesBehindFactor = -5;
      }
    }

    // Win percentage momentum
    const winPercentage = totalGamesPlayed > 0 ? teamWins / totalGamesPlayed : 0;
    const momentumFactor = (winPercentage - 0.5) * 20; // -10 to +10

    // Schedule difficulty adjustment
    const scheduleAdjustment = this.calculateScheduleDifficulty(team.id, gamesRemaining);

    // Calculate final odds
    let finalOdds = baseOdds + gamesBehindFactor + momentumFactor + scheduleAdjustment;

    // Apply special cases

    // If mathematically clinched (top 3 with enough wins that others can't catch up)
    const maxPossibleWins = allTeams.map(t => {
      const tWins = t.wins || 0;
      const tLosses = t.losses || 0;
      return tWins + gamesRemaining;
    }).sort((a, b) => b - a);

    const fourthPlaceMaxWins = maxPossibleWins[3] || 0;
    if (currentRank < 3 && teamWins > fourthPlaceMaxWins) {
      finalOdds = 100; // Clinched
    }

    // If mathematically eliminated
    const thirdPlaceMinWins = cutoffWins; // Assuming 3rd place wins all remaining
    if (teamWins + gamesRemaining < thirdPlaceMinWins) {
      finalOdds = 0;
    }

    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, Math.round(finalOdds)));
  }

  /**
   * Calculate schedule difficulty for remaining games
   * Easier schedule = positive adjustment (better odds)
   * Harder schedule = negative adjustment (worse odds)
   * @param {string} teamId - Team ID
   * @param {number} gamesRemaining - Games remaining
   * @returns {number} Schedule adjustment (-15 to +15)
   */
  calculateScheduleDifficulty(teamId, gamesRemaining) {
    if (gamesRemaining <= 0) return 0;

    // Get remaining games for this team (handle both field name formats)
    const remainingGames = this.games.filter(game => {
      const t1Id = game.team1Id || game.team1_id;
      const t2Id = game.team2Id || game.team2_id;
      const completed = game.isCompleted || game.is_completed ||
        (game.team1_score !== null && game.team2_score !== null);

      return (t1Id === teamId || t2Id === teamId) &&
        !completed &&
        game.week < this.regularSeasonWeeks + 1;
    });

    if (remainingGames.length === 0) return 0;

    // Calculate average opponent win percentage
    let totalOpponentWinPct = 0;
    let opponentCount = 0;

    for (const game of remainingGames) {
      const t1Id = game.team1Id || game.team1_id;
      const t2Id = game.team2Id || game.team2_id;
      const opponentId = t1Id === teamId ? t2Id : t1Id;
      const opponent = this.teams.find(t => t.id === opponentId);

      if (opponent) {
        const oppWins = opponent.wins || 0;
        const oppLosses = opponent.losses || 0;
        const oppGames = oppWins + oppLosses;
        const oppWinPct = oppGames > 0 ? oppWins / oppGames : 0.5;

        totalOpponentWinPct += oppWinPct;
        opponentCount++;
      }
    }

    if (opponentCount === 0) return 0;

    const avgOpponentWinPct = totalOpponentWinPct / opponentCount;

    // League average win percentage is 0.5
    const leagueAvgWinPct = 0.5;

    // Calculate adjustment
    // If opponents are weaker (< 0.5), positive adjustment
    // If opponents are stronger (> 0.5), negative adjustment
    const difficultyDiff = leagueAvgWinPct - avgOpponentWinPct;

    // Scale by number of games remaining (more games = bigger impact)
    const adjustment = difficultyDiff * gamesRemaining * 10;

    // Clamp to -15 to +15
    return Math.max(-15, Math.min(15, adjustment));
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

      // Sort by wins first
      if (bWins !== aWins) {
        return bWins - aWins;
      }

      // Tiebreaker: points for (handle both camelCase and snake_case)
      const aPointsFor = parseFloat(a.pointsFor || a.points_for || 0);
      const bPointsFor = parseFloat(b.pointsFor || b.points_for || 0);
      return bPointsFor - aPointsFor;
    });
  }

  /**
   * Get playoff odds for a specific team
   * @param {string} teamId - Team ID
   * @returns {number} Playoff odds percentage (0-100)
   */
  getTeamPlayoffOdds(teamId) {
    const allOdds = this.calculateAllPlayoffOdds();
    return allOdds.get(teamId) || 0;
  }
}

export default PlayoffOddsCalculator;

