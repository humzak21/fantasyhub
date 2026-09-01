/**
 * Playoff Odds Calculator
 *
 * Two models, chosen by season year, because the league changed how playoff
 * spots are earned:
 *
 * - **Through 2025**, the top three of each division qualified. That model is
 *   below, byte for byte: a past season's odds must not move because the rule
 *   changed afterwards.
 * - **From 2026**, each division winner takes a bye and the next four teams
 *   league-wide take the wildcards. A team's odds are then two questions at
 *   once — can it win its division, and can it hold a wildcard — so the seeded
 *   model runs both tracks and combines them.
 *
 * Both are heuristics, not simulations: a ladder of base odds by current
 * position, adjusted for games from the cutoff, recent form and the remaining
 * schedule. The extremes are what the tests pin — a clinched team reads 100, an
 * eliminated one reads 0, and a finished season reads exactly the six teams
 * `computeSeeds` names.
 *
 * Tiebreaker: Points For (higher points for wins the tiebreaker)
 */

import {
  computeSeeds,
  sortByStandings,
  teamIdOf,
  usesSeededPlayoffs
} from '../utils/playoffSeeding.js';

export class PlayoffOddsCalculator {
  constructor(teams, games, divisions, currentWeek, regularSeasonWeeks, seasonYear = null) {
    this.teams = Array.isArray(teams) ? teams : [];
    this.games = Array.isArray(games) ? games : [];
    this.divisions = Array.isArray(divisions) ? divisions : [];
    this.currentWeek = currentWeek;
    this.regularSeasonWeeks = regularSeasonWeeks;
    // Optional sixth argument: a caller that does not know the year gets the
    // pre-2026 model, which is what every historical caller wants.
    this.seasonYear = seasonYear;
  }

  /**
   * Calculate playoff odds for all teams
   * @returns {Map} Map of teamId -> playoff odds percentage (0-100)
   */
  calculateAllPlayoffOdds() {
    if (usesSeededPlayoffs(this.seasonYear)) {
      return this.calculateSeededPlayoffOdds();
    }

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

  // -------------------------------------------------------------------------
  // 2026+: division winners on byes, four league-wide wildcards
  // -------------------------------------------------------------------------

  /**
   * Playoff odds under the seeded rule.
   *
   * @returns {Map} teamId -> percentage (0-100)
   */
  calculateSeededPlayoffOdds() {
    const odds = new Map();
    if (this.teams.length === 0) return odds;

    const gamesRemaining = this.regularSeasonWeeks - (this.currentWeek - 1);

    // Nothing left to play: the field is a fact, not a forecast.
    if (gamesRemaining <= 0) {
      const seeds = computeSeeds(this.teams);
      for (const team of this.teams) {
        odds.set(team.id, seeds.get(teamIdOf(team))?.seed != null ? 100 : 0);
      }
      return odds;
    }

    const leagueOrder = sortByStandings(this.teams);
    const seeds = computeSeeds(this.teams);

    // The two ladders' reference points. `leaders` is one team per division;
    // `pool` is everyone else, which is the field the four wildcards come from.
    const leaders = new Map();
    for (const [divisionId, divisionTeams] of this.groupTeamsByDivision().entries()) {
      if (divisionId === 'unassigned') continue;
      const best = sortByStandings(divisionTeams)[0];
      if (best) leaders.set(divisionId, best);
    }

    const leaderIds = new Set([...leaders.values()].map(teamIdOf));
    const pool = leagueOrder.filter((team) => !leaderIds.has(teamIdOf(team)));

    // The 6th projected seed is the last team in; the 7th is the first team
    // out, and the one a qualifier has to put out of reach to clinch.
    const wildcardSpots = Math.max(0, 6 - leaders.size);
    const lastIn = pool[wildcardSpots - 1] ?? null;
    const firstOut = pool[wildcardSpots] ?? null;

    for (const team of this.teams) {
      const teamId = teamIdOf(team);
      // The same key `groupTeamsByDivision` builds, so the leader lookup hits.
      const divisionId = team.divisionId || team.division_id || 'unassigned';
      const leader = leaders.get(divisionId) ?? null;
      const divisionTeams = sortByStandings(
        this.teams.filter(
          (other) => (other.divisionId || other.division_id || 'unassigned') === divisionId
        )
      );

      const divisionRank = divisionTeams.findIndex((other) => teamIdOf(other) === teamId);
      const poolRank = pool.findIndex((other) => teamIdOf(other) === teamId);

      // Track one: win the division outright. Only one team can, so the ladder
      // drops away fast behind the leader.
      const divisionTrack = this.trackOdds({
        team,
        rank: divisionRank < 0 ? divisionTeams.length : divisionRank,
        ladder: [70, 25, 12, 6],
        tail: 3,
        cutoff: leader,
        gamesRemaining
      });

      // Track two: hold a wildcard. The cutoff is the last team currently in.
      const wildcardTrack =
        poolRank < 0
          ? 0
          : this.trackOdds({
              team,
              rank: poolRank,
              ladder: [85, 78, 70, 58, 32, 18, 9],
              tail: 4,
              cutoff: lastIn,
              gamesRemaining
            });

      // Noisy-OR: either route in is enough. The two are not independent, which
      // is why this is a heuristic and not a probability.
      let combined =
        100 * (1 - (1 - divisionTrack / 100) * (1 - wildcardTrack / 100));

      const maxWins = (this.winsOf(team) || 0) + gamesRemaining;

      // Clinched: already past anything the first team out can reach.
      if (
        seeds.get(teamId)?.seed != null &&
        firstOut &&
        this.winsOf(team) > this.winsOf(firstOut) + gamesRemaining
      ) {
        combined = 100;
      }

      // Eliminated: cannot reach the last team in, and cannot reach its own
      // division's leader either. Both doors have to be shut.
      const cannotCatchField = lastIn ? maxWins < this.winsOf(lastIn) : false;
      const cannotWinDivision = leader ? maxWins < this.winsOf(leader) : true;
      if (seeds.get(teamId)?.seed == null && cannotCatchField && cannotWinDivision) {
        combined = 0;
      }

      odds.set(team.id, Math.max(0, Math.min(100, Math.round(combined))));
    }

    return odds;
  }

  /** Wins as a number, whatever shape the row arrived in. */
  winsOf(team) {
    return Number(team?.wins) || 0;
  }

  /**
   * One track of the seeded model: a base ladder by current position, moved by
   * how far the team is from that track's cutoff, its recent form and its
   * remaining schedule. The three adjustments are the pre-2026 model's, kept
   * deliberately — only the ladder and the cutoff differ between tracks.
   *
   * @returns {number} 0-100
   */
  trackOdds({ team, rank, ladder, tail, cutoff, gamesRemaining }) {
    const base = rank < ladder.length ? ladder[rank] : tail;

    const teamWins = this.winsOf(team);
    const teamPointsFor = parseFloat(team.pointsFor || team.points_for || 0);
    const cutoffWins = cutoff ? this.winsOf(cutoff) : 0;
    const cutoffPointsFor = cutoff
      ? parseFloat(cutoff.pointsFor || cutoff.points_for || 0)
      : 0;

    const gamesFromCutoff = teamWins - cutoffWins;
    let gamesBehindFactor;

    if (gamesFromCutoff > 0) {
      gamesBehindFactor = Math.min(30, gamesFromCutoff * 10);
    } else if (gamesFromCutoff < 0) {
      if (gamesRemaining + gamesFromCutoff < 0) return 0; // out of reach
      gamesBehindFactor = Math.max(-40, gamesFromCutoff * 12);
    } else if (teamPointsFor > cutoffPointsFor) {
      gamesBehindFactor = 5;
    } else if (teamPointsFor < cutoffPointsFor) {
      gamesBehindFactor = -5;
    } else {
      gamesBehindFactor = 0;
    }

    const played = teamWins + (Number(team.losses) || 0);
    const winPercentage = played > 0 ? teamWins / played : 0;
    const momentumFactor = (winPercentage - 0.5) * 20;

    const scheduleAdjustment = this.calculateScheduleDifficulty(
      team.id,
      gamesRemaining
    );

    return Math.max(
      0,
      Math.min(100, base + gamesBehindFactor + momentumFactor + scheduleAdjustment)
    );
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

