/**
 * League History Manager Service
 *
 * Business logic layer for querying historical fantasy football data.
 * Provides clean APIs for:
 * - Franchise career statistics
 * - Head-to-head records
 * - Season awards and achievements
 * - Historical leaderboards
 * - Season comparisons
 * - Record book queries
 *
 * @module leagueHistoryManager
 */

import { supabase } from './supabaseClient.js';

/**
 * League History Manager Class
 */
export class LeagueHistoryManager {
  constructor(client = supabase) {
    this.client = client;
    this._currentSeasonCache = null;
    this._currentSeasonCacheTime = null;
  }

  // ============================================================================
  // CURRENT SEASON DATA INTEGRATION
  // ============================================================================

  /**
   * Get current/active season data with teams and games
   * @returns {Promise<Object|null>} Current season data or null if none active
   */
  async getCurrentSeasonData() {
    // Use cache if fresh (5 minutes)
    if (this._currentSeasonCache && this._currentSeasonCacheTime &&
        Date.now() - this._currentSeasonCacheTime < 5 * 60 * 1000) {
      return this._currentSeasonCache;
    }

    const { data: season, error: seasonError } = await this.client
      .from('seasons')
      .select(`
        *,
        teams (*),
        games (*)
      `)
      .eq('is_active', true)
      .single();

    if (seasonError || !season) {
      return null;
    }

    this._currentSeasonCache = season;
    this._currentSeasonCacheTime = Date.now();
    return season;
  }

  /**
   * Clear current season cache to force refresh
   */
  clearCurrentSeasonCache() {
    this._currentSeasonCache = null;
    this._currentSeasonCacheTime = null;
  }

  /**
   * Map current season team to franchise by owner name
   * @param {Object} team - Current season team
   * @param {Array} franchises - List of franchises
   * @returns {Object|null} Matching franchise or null
   */
  _mapTeamToFranchise(team, franchises) {
    if (!team || !franchises) return null;
    return franchises.find(f => f.owner_name === team.owner) || null;
  }

  /**
   * Get current season stats for a franchise
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Object|null>} Current season team stats or null
   */
  async getCurrentSeasonStatsForFranchise(franchiseId) {
    const currentSeason = await this.getCurrentSeasonData();
    if (!currentSeason || !currentSeason.teams) return null;

    // Get franchise to match by owner name
    const franchise = await this.getFranchiseById(franchiseId);
    if (!franchise) return null;

    // Find team in current season matching this franchise's owner
    const team = currentSeason.teams.find(t => t.owner === franchise.owner_name);
    if (!team) return null;

    return {
      seasonId: currentSeason.id,
      year: currentSeason.year,
      teamId: team.id,
      teamName: team.name,
      wins: team.wins || 0,
      losses: team.losses || 0,
      ties: team.ties || 0,
      pointsFor: team.points_for || 0,
      pointsAgainst: team.points_against || 0,
      isActive: true
    };
  }

  /**
   * Get all franchises with current season stats merged
   * @returns {Promise<Array>} Franchises with current season data
   */
  async getAllFranchisesWithCurrentSeason() {
    const [franchises, currentSeason] = await Promise.all([
      this.getAllFranchises(),
      this.getCurrentSeasonData()
    ]);

    if (!currentSeason || !currentSeason.teams) {
      return franchises;
    }

    // Merge current season stats into franchises
    return franchises.map(franchise => {
      const currentTeam = currentSeason.teams.find(t => t.owner === franchise.owner_name);

      if (!currentTeam) {
        return {
          ...franchise,
          current_season: null
        };
      }

      return {
        ...franchise,
        current_season: {
          year: currentSeason.year,
          team_id: currentTeam.id,
          team_name: currentTeam.name,
          wins: currentTeam.wins || 0,
          losses: currentTeam.losses || 0,
          ties: currentTeam.ties || 0,
          points_for: currentTeam.points_for || 0,
          points_against: currentTeam.points_against || 0
        },
        // Update totals to include current season
        total_regular_season_wins: (franchise.total_regular_season_wins || 0) + (currentTeam.wins || 0),
        total_regular_season_losses: (franchise.total_regular_season_losses || 0) + (currentTeam.losses || 0),
        total_points_for: (franchise.total_points_for || 0) + (currentTeam.points_for || 0),
        total_points_against: (franchise.total_points_against || 0) + (currentTeam.points_against || 0),
        total_seasons: (franchise.total_seasons || 0) + 1
      };
    });
  }

  /**
   * Get career stats with current season included
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Object>} Combined career stats
   */
  async getFranchiseCareerStatsWithCurrentSeason(franchiseId) {
    const [historicalStats, currentStats] = await Promise.all([
      this.getFranchiseCareerStats(franchiseId).catch(() => null),
      this.getCurrentSeasonStatsForFranchise(franchiseId)
    ]);

    // If no historical stats, return current season only
    if (!historicalStats) {
      if (!currentStats) return null;

      const totalGames = currentStats.wins + currentStats.losses + currentStats.ties;
      return {
        franchise_id: franchiseId,
        total_wins: currentStats.wins,
        total_losses: currentStats.losses,
        total_ties: currentStats.ties,
        avg_win_percentage: totalGames > 0 ? currentStats.wins / totalGames : 0,
        playoff_appearances: 0,
        championships: 0,
        runner_ups: 0,
        career_points_for: currentStats.pointsFor,
        career_points_against: currentStats.pointsAgainst,
        avg_points_per_game: totalGames > 0 ? currentStats.pointsFor / totalGames : 0,
        seasons_played: 1,
        includes_current_season: true
      };
    }

    // Merge historical with current
    if (!currentStats) {
      return {
        ...historicalStats,
        includes_current_season: false
      };
    }

    const totalWins = (historicalStats.total_wins || 0) + currentStats.wins;
    const totalLosses = (historicalStats.total_losses || 0) + currentStats.losses;
    const totalTies = (historicalStats.total_ties || 0) + currentStats.ties;
    const totalGames = totalWins + totalLosses + totalTies;
    const totalPointsFor = (historicalStats.career_points_for || 0) + currentStats.pointsFor;
    const totalPointsAgainst = (historicalStats.career_points_against || 0) + currentStats.pointsAgainst;

    return {
      ...historicalStats,
      total_wins: totalWins,
      total_losses: totalLosses,
      total_ties: totalTies,
      avg_win_percentage: totalGames > 0 ? totalWins / totalGames : 0,
      career_points_for: totalPointsFor,
      career_points_against: totalPointsAgainst,
      avg_points_per_game: totalGames > 0 ? totalPointsFor / totalGames : 0,
      seasons_played: (historicalStats.seasons_played || 0) + 1,
      includes_current_season: true,
      current_season: currentStats
    };
  }

  /**
   * Get all career stats with current season included
   * @param {Object} options - Query options
   * @returns {Promise<Array>} All franchise career stats with current season
   */
  async getAllFranchiseCareerStatsWithCurrentSeason({ sortBy = 'championships' } = {}) {
    const [historicalStats, currentSeason, franchises] = await Promise.all([
      this.getAllFranchiseCareerStats({ sortBy }),
      this.getCurrentSeasonData(),
      this.getAllFranchises()
    ]);

    if (!currentSeason || !currentSeason.teams) {
      return historicalStats;
    }

    // Create a map of historical stats by franchise_id
    const statsMap = new Map(historicalStats.map(s => [s.franchise_id, { ...s }]));

    // Merge current season data
    for (const team of currentSeason.teams) {
      const franchise = franchises.find(f => f.owner_name === team.owner);
      if (!franchise) continue;

      const existing = statsMap.get(franchise.id);
      const currentWins = team.wins || 0;
      const currentLosses = team.losses || 0;
      const currentTies = team.ties || 0;
      const currentPointsFor = team.points_for || 0;
      const currentPointsAgainst = team.points_against || 0;

      if (existing) {
        // Merge with existing stats
        const totalWins = (existing.total_wins || 0) + currentWins;
        const totalLosses = (existing.total_losses || 0) + currentLosses;
        const totalTies = (existing.total_ties || 0) + currentTies;
        const totalGames = totalWins + totalLosses + totalTies;
        const totalPointsFor = (existing.career_points_for || 0) + currentPointsFor;

        existing.total_wins = totalWins;
        existing.total_losses = totalLosses;
        existing.total_ties = totalTies;
        existing.avg_win_percentage = totalGames > 0 ? totalWins / totalGames : 0;
        existing.career_points_for = totalPointsFor;
        existing.career_points_against = (existing.career_points_against || 0) + currentPointsAgainst;
        existing.avg_points_per_game = totalGames > 0 ? totalPointsFor / totalGames : 0;
        existing.seasons_played = (existing.seasons_played || 0) + 1;
        existing.includes_current_season = true;
      } else {
        // Create new entry for franchise only in current season
        const totalGames = currentWins + currentLosses + currentTies;
        statsMap.set(franchise.id, {
          franchise_id: franchise.id,
          total_wins: currentWins,
          total_losses: currentLosses,
          total_ties: currentTies,
          avg_win_percentage: totalGames > 0 ? currentWins / totalGames : 0,
          playoff_appearances: 0,
          championships: 0,
          runner_ups: 0,
          career_points_for: currentPointsFor,
          career_points_against: currentPointsAgainst,
          avg_points_per_game: totalGames > 0 ? currentPointsFor / totalGames : 0,
          seasons_played: 1,
          includes_current_season: true
        });
      }
    }

    // Convert back to array and sort
    const results = Array.from(statsMap.values());

    // Sort by requested field
    results.sort((a, b) => {
      const aVal = a[sortBy] || 0;
      const bVal = b[sortBy] || 0;
      return bVal - aVal;
    });

    return results;
  }

  // ============================================================================
  // FRANCHISE QUERIES
  // ============================================================================

  /**
   * Get all franchises (owners)
   * @returns {Promise<Array>} List of all franchises
   */
  async getAllFranchises() {
    const { data, error } = await this.client
      .from('league_franchises')
      .select('*')
      .order('owner_name', { ascending: true });

    if (error) throw new Error(`Failed to fetch franchises: ${error.message}`);
    return data || [];
  }

  /**
   * Get franchise by ID
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Object>} Franchise data
   */
  async getFranchiseById(franchiseId) {
    const { data, error } = await this.client
      .from('league_franchises')
      .select('*')
      .eq('id', franchiseId)
      .single();

    if (error) throw new Error(`Failed to fetch franchise: ${error.message}`);
    return data;
  }

  /**
   * Get franchise by owner name
   * @param {string} ownerName - Owner's full name
   * @returns {Promise<Object>} Franchise data
   */
  async getFranchiseByOwner(ownerName) {
    const { data, error } = await this.client
      .from('league_franchises')
      .select('*')
      .eq('owner_name', ownerName)
      .single();

    if (error) throw new Error(`Failed to fetch franchise: ${error.message}`);
    return data;
  }

  /**
   * Get franchise career statistics using materialized view
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Object>} Career stats
   */
  async getFranchiseCareerStats(franchiseId) {
    const { data, error } = await this.client
      .from('mv_franchise_career_stats')
      .select('*')
      .eq('franchise_id', franchiseId)
      .single();

    if (error) throw new Error(`Failed to fetch career stats: ${error.message}`);
    return data;
  }

  /**
   * Get all franchise career stats (leaderboard)
   * @param {Object} options - Query options
   * @param {string} options.sortBy - Field to sort by (default: 'championships')
   * @param {number} options.limit - Limit results (default: all)
   * @returns {Promise<Array>} List of franchise career stats
   */
  async getAllFranchiseCareerStats({ sortBy = 'championships', limit = null } = {}) {
    let query = this.client
      .from('mv_franchise_career_stats')
      .select('*')
      .order(sortBy, { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch career stats: ${error.message}`);
    return data || [];
  }

  // ============================================================================
  // HISTORICAL SEASONS QUERIES
  // ============================================================================

  /**
   * Get all historical seasons
   * @returns {Promise<Array>} List of historical seasons
   */
  async getHistoricalSeasons() {
    const { data, error } = await this.client
      .from('historical_seasons')
      .select(`
        *,
        historical_teams (
          id,
          franchise_id,
          team_name,
          regular_season_wins,
          regular_season_losses,
          playoff_finish,
          franchise:league_franchises (
            id,
            owner_name,
            display_name
          )
        )
      `)
      .order('year', { ascending: false });

    if (error) throw new Error(`Failed to fetch seasons: ${error.message}`);

    // Process each season to extract top 3 finishers
    const processedSeasons = (data || []).map(season => {
      const teams = season.historical_teams || [];

      const champion = teams.find(t => t.playoff_finish === 'champion');
      const runnerUp = teams.find(t => t.playoff_finish === '2nd');
      const thirdPlace = teams.find(t => t.playoff_finish === '3rd');

      return {
        ...season,
        playoff_results: {
          champion: champion ? {
            franchise_id: champion.franchise_id,
            franchise: champion.franchise,
            team_name: champion.team_name,
            record: `${champion.regular_season_wins}-${champion.regular_season_losses}`
          } : null,
          runner_up: runnerUp ? {
            franchise_id: runnerUp.franchise_id,
            franchise: runnerUp.franchise,
            team_name: runnerUp.team_name,
            record: `${runnerUp.regular_season_wins}-${runnerUp.regular_season_losses}`
          } : null,
          third_place: thirdPlace ? {
            franchise_id: thirdPlace.franchise_id,
            franchise: thirdPlace.franchise,
            team_name: thirdPlace.team_name,
            record: `${thirdPlace.regular_season_wins}-${thirdPlace.regular_season_losses}`
          } : null
        },
        // Remove the full teams array to keep response size down
        historical_teams: undefined
      };
    });

    return processedSeasons;
  }

  /**
   * Get specific season by year
   * @param {number} year - Season year
   * @returns {Promise<Object>} Season data
   */
  async getSeasonByYear(year) {
    const { data, error } = await this.client
      .from('historical_seasons')
      .select('*')
      .eq('year', year)
      .single();

    if (error) throw new Error(`Failed to fetch season: ${error.message}`);
    return data;
  }

  /**
   * Get teams for a specific season
   * @param {string} seasonId - Season UUID
   * @returns {Promise<Array>} List of teams
   */
  async getSeasonTeams(seasonId) {
    const { data, error } = await this.client
      .from('historical_teams')
      .select(`
        *,
        franchise:league_franchises(id, owner_name, display_name)
      `)
      .eq('season_id', seasonId)
      .order('final_rank', { ascending: true });

    if (error) throw new Error(`Failed to fetch season teams: ${error.message}`);
    return data || [];
  }

  /**
   * Get franchise's performance in a specific season
   * @param {string} franchiseId - Franchise UUID
   * @param {string} seasonId - Season UUID
   * @returns {Promise<Object>} Team data for that season
   */
  async getFranchiseSeasonPerformance(franchiseId, seasonId) {
    const { data, error } = await this.client
      .from('historical_teams')
      .select(`
        *,
        season:historical_seasons(year, name)
      `)
      .eq('franchise_id', franchiseId)
      .eq('season_id', seasonId)
      .single();

    if (error) throw new Error(`Failed to fetch season performance: ${error.message}`);
    return data;
  }

  /**
   * Get all seasons for a franchise
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Array>} List of team records across seasons
   */
  async getFranchiseSeasonHistory(franchiseId) {
    const { data, error } = await this.client
      .from('historical_teams')
      .select(`
        *,
        season:historical_seasons(id, year, name)
      `)
      .eq('franchise_id', franchiseId);

    if (error) throw new Error(`Failed to fetch season history: ${error.message}`);

    // Sort by year in JavaScript since Supabase doesn't support ordering by foreign table columns directly
    const sorted = (data || []).sort((a, b) => (a.season?.year || 0) - (b.season?.year || 0));
    return sorted;
  }

  // ============================================================================
  // HEAD-TO-HEAD QUERIES
  // ============================================================================

  /**
   * Get head-to-head record between two franchises
   * @param {string} franchise1Id - First franchise UUID
   * @param {string} franchise2Id - Second franchise UUID
   * @returns {Promise<Object>} H2H record
   */
  async getHeadToHeadRecord(franchise1Id, franchise2Id) {
    // Ensure consistent ordering
    const [minId, maxId] = franchise1Id < franchise2Id
      ? [franchise1Id, franchise2Id]
      : [franchise2Id, franchise1Id];

    const { data, error } = await this.client
      .from('head_to_head_records')
      .select(`
        *,
        franchise1:league_franchises!head_to_head_records_franchise1_id_fkey(owner_name, display_name),
        franchise2:league_franchises!head_to_head_records_franchise2_id_fkey(owner_name, display_name)
      `)
      .eq('franchise1_id', minId)
      .eq('franchise2_id', maxId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No record found - they haven't played
      return null;
    }

    if (error) throw new Error(`Failed to fetch H2H record: ${error.message}`);

    // Adjust data based on which franchise was requested first
    if (franchise1Id !== minId) {
      // Swap the stats
      return {
        ...data,
        franchise1_wins: data.franchise2_wins,
        franchise2_wins: data.franchise1_wins,
        franchise1_total_points: data.franchise2_total_points,
        franchise2_total_points: data.franchise1_total_points,
        franchise1_avg_points: data.franchise2_avg_points,
        franchise2_avg_points: data.franchise1_avg_points,
        regular_season_franchise1_wins: data.regular_season_franchise2_wins,
        regular_season_franchise2_wins: data.regular_season_franchise1_wins,
        playoff_franchise1_wins: data.playoff_franchise2_wins,
        playoff_franchise2_wins: data.playoff_franchise1_wins
      };
    }

    return data;
  }

  /**
   * Get all head-to-head records for a franchise
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Array>} List of H2H records
   */
  async getFranchiseHeadToHeadRecords(franchiseId) {
    const { data, error } = await this.client
      .from('head_to_head_records')
      .select(`
        *,
        franchise1:league_franchises!head_to_head_records_franchise1_id_fkey(id, owner_name, display_name),
        franchise2:league_franchises!head_to_head_records_franchise2_id_fkey(id, owner_name, display_name)
      `)
      .or(`franchise1_id.eq.${franchiseId},franchise2_id.eq.${franchiseId}`);

    if (error) throw new Error(`Failed to fetch H2H records: ${error.message}`);
    return data || [];
  }

  /**
   * Get all matchups between two franchises (historical + current season)
   * @param {string} franchise1Id - First franchise UUID
   * @param {string} franchise2Id - Second franchise UUID
   * @returns {Promise<Array>} List of games with normalized structure
   */
  async getMatchupHistory(franchise1Id, franchise2Id) {
    console.log('getMatchupHistory called with:', franchise1Id, franchise2Id);

    // Fetch historical games
    const { data: historicalGames, error: histError } = await this.client
      .from('historical_games')
      .select(`
        *,
        season:historical_seasons(year, name),
        team1:historical_teams!historical_games_team1_id_fkey(id, team_name, franchise_id, regular_season_wins, regular_season_losses),
        team2:historical_teams!historical_games_team2_id_fkey(id, team_name, franchise_id, regular_season_wins, regular_season_losses)
      `)
      .eq('is_completed', true);

    if (histError) {
      console.error('Historical games error:', histError);
      throw new Error(`Failed to fetch historical matchup history: ${histError.message}`);
    }

    console.log('Historical games fetched:', historicalGames?.length || 0);

    // Filter for matchups between these two franchises
    const filteredHistorical = (historicalGames || []).filter(game => {
      const f1 = game.team1?.franchise_id;
      const f2 = game.team2?.franchise_id;
      return (f1 === franchise1Id && f2 === franchise2Id) ||
             (f1 === franchise2Id && f2 === franchise1Id);
    });

    // Fetch current season games
    const { data: currentGames, error: currError } = await this.client
      .from('games')
      .select(`
        id,
        week,
        team1_id,
        team2_id,
        team1_score,
        team2_score,
        is_completed,
        is_playoff,
        season_id,
        team1:teams!games_team1_id_fkey(id, name, owner, franchise_id, wins, losses),
        team2:teams!games_team2_id_fkey(id, name, owner, franchise_id, wins, losses),
        season:seasons(year, name)
      `)
      .eq('is_completed', true);

    if (currError) {
      console.warn('Could not fetch current season games:', currError.message);
    }

    console.log('Current games fetched:', currentGames?.length || 0);

    // Filter current games for matchups between these franchises
    const filteredCurrent = (currentGames || []).filter(game => {
      const f1 = game.team1?.franchise_id;
      const f2 = game.team2?.franchise_id;
      return (f1 === franchise1Id && f2 === franchise2Id) ||
             (f1 === franchise2Id && f2 === franchise1Id);
    });

    console.log('Filtered historical:', filteredHistorical.length);
    console.log('Filtered current:', filteredCurrent.length);

    // Normalize and combine results
    const normalizedHistorical = filteredHistorical.map(game => ({
      id: game.id,
      week: game.week,
      year: game.season?.year,
      seasonName: game.season?.name,
      type: game.type || 'regular',
      team1Score: game.team1_score,
      team2Score: game.team2_score,
      team1Name: game.team1?.team_name,
      team2Name: game.team2?.team_name,
      team1FranchiseId: game.team1?.franchise_id,
      team2FranchiseId: game.team2?.franchise_id,
      team1Record: game.team1 ? `${game.team1.regular_season_wins}-${game.team1.regular_season_losses}` : null,
      team2Record: game.team2 ? `${game.team2.regular_season_wins}-${game.team2.regular_season_losses}` : null,
      winnerId: game.winner_team_id,
      isHistorical: true
    }));

    const normalizedCurrent = filteredCurrent.map(game => ({
      id: game.id,
      week: game.week,
      year: game.season?.year,
      seasonName: game.season?.name,
      type: game.is_playoff ? 'playoff' : 'regular',
      team1Score: game.team1_score,
      team2Score: game.team2_score,
      team1Name: game.team1?.name,
      team2Name: game.team2?.name,
      team1FranchiseId: game.team1?.franchise_id,
      team2FranchiseId: game.team2?.franchise_id,
      team1Record: game.team1 ? `${game.team1.wins}-${game.team1.losses}` : null,
      team2Record: game.team2 ? `${game.team2.wins}-${game.team2.losses}` : null,
      winnerId: game.team1_score > game.team2_score ? game.team1_id :
                game.team2_score > game.team1_score ? game.team2_id : null,
      isHistorical: false
    }));

    // Combine and sort by year then week
    const allGames = [...normalizedHistorical, ...normalizedCurrent];
    allGames.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.week - b.week;
    });

    console.log('Total games returned:', allGames.length);
    if (allGames.length > 0) {
      console.log('First game:', allGames[0]);
    }

    return allGames;
  }

  // ============================================================================
  // AWARDS QUERIES
  // ============================================================================

  /**
   * Get all awards for a franchise
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Array>} List of awards
   */
  async getFranchiseAwards(franchiseId) {
    const { data, error } = await this.client
      .from('season_awards')
      .select(`
        *,
        season:historical_seasons(year, name)
      `)
      .eq('franchise_id', franchiseId);

    if (error) throw new Error(`Failed to fetch awards: ${error.message}`);

    // Sort in JavaScript since Supabase doesn't support ordering by foreign table columns
    const sorted = (data || []).sort((a, b) => {
      // First by year descending
      const yearDiff = (b.season?.year || 0) - (a.season?.year || 0);
      if (yearDiff !== 0) return yearDiff;
      // Then by category
      const catDiff = (a.award_category || '').localeCompare(b.award_category || '');
      if (catDiff !== 0) return catDiff;
      // Then by type
      return (a.award_type || '').localeCompare(b.award_type || '');
    });
    return sorted;
  }

  /**
   * Get awards for a specific season
   * @param {string} seasonId - Season UUID
   * @param {string} category - Optional award category filter
   * @returns {Promise<Array>} List of awards
   */
  async getSeasonAwards(seasonId, category = null) {
    let query = this.client
      .from('season_awards')
      .select(`
        *,
        franchise:league_franchises(owner_name, display_name),
        team:historical_teams(team_name)
      `)
      .eq('season_id', seasonId);

    if (category) {
      query = query.eq('award_category', category);
    }

    query = query.order('award_category').order('award_type');

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch season awards: ${error.message}`);
    return data || [];
  }

  /**
   * Get all championships
   * @returns {Promise<Array>} List of championship awards
   */
  async getAllChampionships() {
    const { data, error } = await this.client
      .from('season_awards')
      .select(`
        *,
        season:historical_seasons(year, name),
        franchise:league_franchises(owner_name, display_name),
        team:historical_teams(team_name, regular_season_wins, regular_season_losses)
      `)
      .eq('award_type', 'champion');

    if (error) throw new Error(`Failed to fetch championships: ${error.message}`);

    // Sort by season year descending (can't order by nested field in Supabase)
    const sorted = (data || []).sort((a, b) => (b.season?.year || 0) - (a.season?.year || 0));
    return sorted;
  }

  // ============================================================================
  // RECORDS QUERIES
  // ============================================================================

  /**
   * Get franchise records (record book)
   * @param {string} franchiseId - Franchise UUID (optional, null for all)
   * @param {string} category - Record category filter (optional)
   * @returns {Promise<Array>} List of records
   */
  async getFranchiseRecords(franchiseId = null, category = null) {
    let query = this.client
      .from('franchise_records')
      .select(`
        *,
        franchise:league_franchises(owner_name, display_name),
        season:historical_seasons(year, name)
      `)
      .eq('is_current_record', true);

    if (franchiseId) {
      query = query.eq('franchise_id', franchiseId);
    }

    if (category) {
      query = query.eq('record_category', category);
    }

    query = query.order('record_category').order('value', { ascending: false });

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch records: ${error.message}`);
    return data || [];
  }

  /**
   * Get league-wide records (best across all franchises)
   * @param {string} recordType - Specific record type
   * @returns {Promise<Object>} Record holder
   */
  async getLeagueRecord(recordType) {
    const { data, error } = await this.client
      .from('franchise_records')
      .select(`
        *,
        franchise:league_franchises(owner_name, display_name),
        season:historical_seasons(year, name)
      `)
      .eq('record_type', recordType)
      .eq('is_current_record', true)
      .order('value', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }

    if (error) throw new Error(`Failed to fetch league record: ${error.message}`);
    return data;
  }

  // ============================================================================
  // LEADERBOARDS & COMPARISONS
  // ============================================================================

  /**
   * Get season leaderboards using materialized view
   * @param {number} year - Season year (optional, null for all)
   * @returns {Promise<Object|Array>} Leaderboard data
   */
  async getSeasonLeaderboard(year = null) {
    let query = this.client
      .from('mv_season_leaderboards')
      .select('*');

    if (year) {
      query = query.eq('year', year).single();
    } else {
      query = query.order('year', { ascending: false });
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch leaderboard: ${error.message}`);
    return data;
  }

  /**
   * Compare two seasons
   * @param {number} year1 - First season year
   * @param {number} year2 - Second season year
   * @returns {Promise<Object>} Comparison data
   */
  async compareSeasons(year1, year2) {
    const season1Data = await this.getSeasonByYear(year1);
    const season2Data = await this.getSeasonByYear(year2);

    const season1Teams = await this.getSeasonTeams(season1Data.id);
    const season2Teams = await this.getSeasonTeams(season2Data.id);

    return {
      season1: {
        ...season1Data,
        teams: season1Teams,
        avgPointsFor: season1Teams.reduce((sum, t) => sum + t.points_for, 0) / season1Teams.length,
        avgPointsAgainst: season1Teams.reduce((sum, t) => sum + t.points_against, 0) / season1Teams.length
      },
      season2: {
        ...season2Data,
        teams: season2Teams,
        avgPointsFor: season2Teams.reduce((sum, t) => sum + t.points_for, 0) / season2Teams.length,
        avgPointsAgainst: season2Teams.reduce((sum, t) => sum + t.points_against, 0) / season2Teams.length
      }
    };
  }

  /**
   * Get franchise year-over-year performance
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Array>} Yearly stats
   */
  async getFranchiseYearOverYear(franchiseId) {
    const history = await this.getFranchiseSeasonHistory(franchiseId);

    return history.map((team, index) => {
      const prevTeam = index > 0 ? history[index - 1] : null;

      return {
        ...team,
        changes: prevTeam ? {
          wins: team.regular_season_wins - prevTeam.regular_season_wins,
          pointsFor: team.points_for - prevTeam.points_for,
          rankChange: prevTeam.final_rank - team.final_rank // Positive = improved
        } : null
      };
    });
  }

  // ============================================================================
  // ALL-TIME LEADERBOARDS
  // ============================================================================

  /**
   * Get all-time leaderboard for a specific stat
   * @param {string} stat - Stat to rank by ('wins', 'points', 'championships', 'playoffs', 'winPct')
   * @param {number} limit - Number of results to return
   * @returns {Promise<Array>} Leaderboard data
   */
  async getAllTimeLeaderboard(stat = 'wins', limit = 15) {
    const [careerStatsResult, currentSeason] = await Promise.all([
      this.client
        .from('mv_franchise_career_stats')
        .select('*'),
      this.getCurrentSeasonData()
    ]);

    if (careerStatsResult.error) throw new Error(`Failed to fetch career stats: ${careerStatsResult.error.message}`);

    const careerStats = careerStatsResult.data;

    // Merge current season data
    const mergedStats = careerStats.map(s => {
      const currentTeam = currentSeason?.teams?.find(t => t.owner === s.owner_name);

      if (!currentTeam) return s;

      return {
        ...s,
        total_wins: (s.total_wins || 0) + (currentTeam.wins || 0),
        total_losses: (s.total_losses || 0) + (currentTeam.losses || 0),
        career_points_for: (s.career_points_for || 0) + (currentTeam.points_for || 0),
        seasons_played: (s.seasons_played || 0) + 1
      };
    });

    // Sort based on requested stat
    const sorted = mergedStats.sort((a, b) => {
      switch (stat) {
        case 'wins':
          return (b.total_wins || 0) - (a.total_wins || 0);
        case 'points':
          return (b.career_points_for || 0) - (a.career_points_for || 0);
        case 'championships':
          return (b.championships || 0) - (a.championships || 0);
        case 'playoffs':
          return (b.playoff_appearances || 0) - (a.playoff_appearances || 0);
        case 'winPct':
          return (b.avg_win_percentage || 0) - (a.avg_win_percentage || 0);
        default:
          return (b.total_wins || 0) - (a.total_wins || 0);
      }
    });

    return sorted.slice(0, limit).map((s, index) => ({
      rank: index + 1,
      franchiseId: s.franchise_id,
      ownerName: s.owner_name,
      displayName: s.display_name,
      value: stat === 'wins' ? s.total_wins :
             stat === 'points' ? s.career_points_for :
             stat === 'championships' ? s.championships :
             stat === 'playoffs' ? s.playoff_appearances :
             stat === 'winPct' ? s.avg_win_percentage :
             s.total_wins,
      totalSeasons: s.seasons_played,
      record: `${s.total_wins}-${s.total_losses}`
    }));
  }

  /**
   * Get comprehensive all-time stats for all franchises
   * @returns {Promise<Array>} Complete franchise stats
   */
  async getAllTimeFranchiseStats() {
    const { data: franchises, error } = await this.client
      .from('league_franchises')
      .select('*')
      .order('total_championships', { ascending: false })
      .order('career_win_percentage', { ascending: false });

    if (error) throw new Error(`Failed to fetch franchise stats: ${error.message}`);

    return franchises.map(f => ({
      franchiseId: f.id,
      ownerName: f.owner_name,
      displayName: f.display_name,
      isActive: f.is_active,
      joinedYear: f.joined_year,
      leftYear: f.left_year,
      totalSeasons: f.total_seasons,
      championships: f.total_championships,
      playoffAppearances: f.total_playoff_appearances,
      regularSeasonWins: f.total_regular_season_wins,
      regularSeasonLosses: f.total_regular_season_losses,
      totalPointsFor: f.total_points_for,
      totalPointsAgainst: f.total_points_against,
      winPercentage: f.career_win_percentage,
      avgPointsPerGame: f.total_seasons > 0
        ? (f.total_points_for / (f.total_regular_season_wins + f.total_regular_season_losses)).toFixed(2)
        : 0
    }));
  }

  /**
   * Get single-season records across all seasons
   * @returns {Promise<Object>} Record holders for various categories
   */
  async getSingleSeasonRecords() {
    const { data: teams, error } = await this.client
      .from('historical_teams')
      .select(`
        *,
        franchise:league_franchises(owner_name, display_name),
        season:historical_seasons(year, name)
      `);

    if (error) throw new Error(`Failed to fetch teams: ${error.message}`);

    // Calculate records
    const records = {
      mostWins: teams.reduce((best, t) =>
        !best || t.regular_season_wins > best.regular_season_wins ? t : best, null),
      mostPoints: teams.reduce((best, t) =>
        !best || t.points_for > best.points_for ? t : best, null),
      fewestPoints: teams.reduce((best, t) =>
        !best || t.points_for < best.points_for ? t : best, null),
      bestPointDiff: teams.reduce((best, t) =>
        !best || (t.points_for - t.points_against) > (best.points_for - best.points_against) ? t : best, null),
      worstPointDiff: teams.reduce((best, t) =>
        !best || (t.points_for - t.points_against) < (best.points_for - best.points_against) ? t : best, null),
      fewestLosses: teams.reduce((best, t) =>
        !best || t.regular_season_losses < best.regular_season_losses ? t : best, null)
    };

    // Format the response
    return Object.fromEntries(
      Object.entries(records).map(([key, team]) => [
        key,
        team ? {
          ownerName: team.franchise?.owner_name,
          teamName: team.team_name,
          year: team.season?.year,
          value: key === 'mostWins' || key === 'fewestLosses'
            ? `${team.regular_season_wins}-${team.regular_season_losses}`
            : key.includes('Point') && key.includes('Diff')
            ? (team.points_for - team.points_against).toFixed(2)
            : team.points_for?.toFixed(2)
        } : null
      ])
    );
  }

  // ============================================================================
  // HEAD-TO-HEAD MATRIX
  // ============================================================================

  /**
   * Get complete head-to-head matrix for all franchises
   * @returns {Promise<Object>} Matrix with all H2H records
   */
  async getHeadToHeadMatrix() {
    // Get all franchises
    const { data: franchises, error: franchisesError } = await this.client
      .from('league_franchises')
      .select('id, owner_name, display_name')
      .order('owner_name');

    if (franchisesError) throw new Error(`Failed to fetch franchises: ${franchisesError.message}`);

    // Get all H2H records
    const { data: records, error: recordsError } = await this.client
      .from('head_to_head_records')
      .select('*');

    if (recordsError) throw new Error(`Failed to fetch H2H records: ${recordsError.message}`);

    // Build matrix
    const matrix = {};
    const franchiseMap = new Map(franchises.map(f => [f.id, f]));

    // Initialize matrix
    for (const f of franchises) {
      matrix[f.id] = {
        franchiseId: f.id,
        ownerName: f.owner_name,
        displayName: f.display_name,
        opponents: {}
      };
    }

    // Fill in H2H data
    for (const record of records) {
      const f1 = record.franchise1_id;
      const f2 = record.franchise2_id;

      // Add record from franchise1's perspective
      if (matrix[f1]) {
        matrix[f1].opponents[f2] = {
          opponentName: franchiseMap.get(f2)?.owner_name,
          wins: record.franchise1_wins,
          losses: record.franchise2_wins,
          totalGames: record.total_matchups,
          winPct: record.total_matchups > 0
            ? (record.franchise1_wins / record.total_matchups * 100).toFixed(1)
            : 0,
          pointsFor: record.franchise1_total_points,
          pointsAgainst: record.franchise2_total_points
        };
      }

      // Add record from franchise2's perspective
      if (matrix[f2]) {
        matrix[f2].opponents[f1] = {
          opponentName: franchiseMap.get(f1)?.owner_name,
          wins: record.franchise2_wins,
          losses: record.franchise1_wins,
          totalGames: record.total_matchups,
          winPct: record.total_matchups > 0
            ? (record.franchise2_wins / record.total_matchups * 100).toFixed(1)
            : 0,
          pointsFor: record.franchise2_total_points,
          pointsAgainst: record.franchise1_total_points
        };
      }
    }

    return {
      franchises: franchises.map(f => ({ id: f.id, name: f.owner_name })),
      matrix: Object.values(matrix)
    };
  }

  /**
   * Get franchise's best and worst matchups
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Object>} Best and worst opponents
   */
  async getFranchiseRivalries(franchiseId) {
    const h2hRecords = await this.getFranchiseHeadToHeadRecords(franchiseId);

    const rivalries = h2hRecords.map(record => {
      const isF1 = record.franchise1_id === franchiseId;
      const wins = isF1 ? record.franchise1_wins : record.franchise2_wins;
      const losses = isF1 ? record.franchise2_wins : record.franchise1_wins;
      const opponent = isF1 ? record.franchise2 : record.franchise1;

      return {
        opponentId: opponent.id,
        opponentName: opponent.owner_name,
        wins,
        losses,
        totalGames: record.total_matchups,
        winPct: record.total_matchups > 0 ? wins / record.total_matchups : 0
      };
    });

    // Sort for best/worst
    const byWinPct = [...rivalries].sort((a, b) => b.winPct - a.winPct);
    const byTotalGames = [...rivalries].sort((a, b) => b.totalGames - a.totalGames);

    return {
      bestMatchups: byWinPct.slice(0, 3),
      worstMatchups: byWinPct.slice(-3).reverse(),
      mostFrequent: byTotalGames.slice(0, 3),
      all: rivalries
    };
  }

  // ============================================================================
  // CHART & GRAPH DATA
  // ============================================================================

  /**
   * Get data for franchise performance over time chart
   * @param {string} franchiseId - Franchise UUID
   * @returns {Promise<Object>} Chart-ready data
   */
  async getFranchisePerformanceChartData(franchiseId) {
    const history = await this.getFranchiseSeasonHistory(franchiseId);

    return {
      labels: history.map(t => t.season?.year?.toString() || ''),
      datasets: {
        wins: history.map(t => t.regular_season_wins),
        losses: history.map(t => t.regular_season_losses),
        pointsFor: history.map(t => t.points_for),
        pointsAgainst: history.map(t => t.points_against),
        finalRank: history.map(t => t.final_rank),
        playoffSeed: history.map(t => t.playoff_seed)
      },
      metadata: {
        franchiseId,
        totalSeasons: history.length,
        championships: history.filter(t => t.playoff_finish === 'champion').length,
        playoffAppearances: history.filter(t => t.made_playoffs).length
      }
    };
  }

  /**
   * Get data for league-wide points distribution chart
   * @param {number} year - Season year (optional, null for all)
   * @returns {Promise<Object>} Chart-ready distribution data
   */
  async getPointsDistributionChartData(year = null) {
    let query = this.client
      .from('historical_teams')
      .select(`
        points_for,
        points_against,
        franchise:league_franchises(owner_name),
        season:historical_seasons(year)
      `);

    if (year) {
      query = query.eq('season.year', year);
    }

    const { data: teams, error } = await query;

    if (error) throw new Error(`Failed to fetch teams: ${error.message}`);

    // Group by year if no specific year
    const byYear = {};
    teams.forEach(t => {
      const y = t.season?.year;
      if (!y) return;
      if (!byYear[y]) {
        byYear[y] = { pointsFor: [], pointsAgainst: [] };
      }
      byYear[y].pointsFor.push(t.points_for);
      byYear[y].pointsAgainst.push(t.points_against);
    });

    // Calculate stats for each year
    const yearlyStats = Object.entries(byYear).map(([y, data]) => ({
      year: parseInt(y),
      avgPointsFor: data.pointsFor.reduce((a, b) => a + b, 0) / data.pointsFor.length,
      avgPointsAgainst: data.pointsAgainst.reduce((a, b) => a + b, 0) / data.pointsAgainst.length,
      minPoints: Math.min(...data.pointsFor),
      maxPoints: Math.max(...data.pointsFor),
      stdDev: this._calculateStdDev(data.pointsFor)
    })).sort((a, b) => a.year - b.year);

    return {
      labels: yearlyStats.map(s => s.year.toString()),
      datasets: {
        avgPointsFor: yearlyStats.map(s => s.avgPointsFor),
        avgPointsAgainst: yearlyStats.map(s => s.avgPointsAgainst),
        minPoints: yearlyStats.map(s => s.minPoints),
        maxPoints: yearlyStats.map(s => s.maxPoints)
      },
      summary: {
        totalTeams: teams.length,
        overallAvg: teams.reduce((sum, t) => sum + t.points_for, 0) / teams.length
      }
    };
  }

  /**
   * Get data for championship race chart (wins by week)
   * @param {number} year - Season year
   * @returns {Promise<Object>} Week-by-week standings
   */
  async getChampionshipRaceChartData(year) {
    const season = await this.getSeasonByYear(year);

    // Get all games for the season
    const { data: games, error } = await this.client
      .from('historical_games')
      .select(`
        week,
        winner_team_id,
        loser_team_id,
        team1:historical_teams!historical_games_team1_id_fkey(id, team_name, franchise:league_franchises(owner_name)),
        team2:historical_teams!historical_games_team2_id_fkey(id, team_name, franchise:league_franchises(owner_name))
      `)
      .eq('season_id', season.id)
      .eq('type', 'regular')
      .eq('is_completed', true)
      .order('week');

    if (error) throw new Error(`Failed to fetch games: ${error.message}`);

    // Get teams for the season
    const teams = await this.getSeasonTeams(season.id);

    // Track cumulative wins by week
    const weeklyStandings = {};
    const teamWins = {};

    // Initialize
    teams.forEach(t => {
      teamWins[t.id] = 0;
      weeklyStandings[t.id] = {
        teamId: t.id,
        teamName: t.team_name,
        ownerName: t.franchise?.owner_name,
        weeks: []
      };
    });

    // Calculate cumulative wins per week
    const maxWeek = Math.max(...games.map(g => g.week));

    for (let week = 1; week <= maxWeek; week++) {
      const weekGames = games.filter(g => g.week === week);

      weekGames.forEach(game => {
        if (game.winner_team_id) {
          teamWins[game.winner_team_id]++;
        }
      });

      // Record standings for this week
      teams.forEach(t => {
        weeklyStandings[t.id].weeks.push({
          week,
          cumulativeWins: teamWins[t.id]
        });
      });
    }

    return {
      year,
      weeks: Array.from({ length: maxWeek }, (_, i) => i + 1),
      teams: Object.values(weeklyStandings).sort((a, b) => {
        const lastWeekA = a.weeks[a.weeks.length - 1]?.cumulativeWins || 0;
        const lastWeekB = b.weeks[b.weeks.length - 1]?.cumulativeWins || 0;
        return lastWeekB - lastWeekA;
      })
    };
  }

  /**
   * Get data for franchise comparison radar chart
   * @param {Array<string>} franchiseIds - Array of franchise UUIDs to compare
   * @returns {Promise<Object>} Radar chart data
   */
  async getFranchiseComparisonChartData(franchiseIds) {
    const franchiseData = await Promise.all(
      franchiseIds.map(id => this.getFranchiseById(id))
    );

    // Normalize stats for radar chart (0-100 scale)
    const allStats = franchiseData.map(f => ({
      wins: f.total_regular_season_wins,
      points: f.total_points_for,
      championships: f.total_championships,
      playoffs: f.total_playoff_appearances,
      winPct: f.career_win_percentage || 0
    }));

    const maxValues = {
      wins: Math.max(...allStats.map(s => s.wins)),
      points: Math.max(...allStats.map(s => s.points)),
      championships: Math.max(...allStats.map(s => s.championships)) || 1,
      playoffs: Math.max(...allStats.map(s => s.playoffs)) || 1,
      winPct: Math.max(...allStats.map(s => s.winPct)) || 1
    };

    return {
      labels: ['Wins', 'Points', 'Championships', 'Playoffs', 'Win %'],
      datasets: franchiseData.map((f, i) => ({
        label: f.owner_name,
        data: [
          (allStats[i].wins / maxValues.wins) * 100,
          (allStats[i].points / maxValues.points) * 100,
          (allStats[i].championships / maxValues.championships) * 100,
          (allStats[i].playoffs / maxValues.playoffs) * 100,
          (allStats[i].winPct / maxValues.winPct) * 100
        ],
        rawData: allStats[i]
      }))
    };
  }

  /**
   * Get data for historical trends line chart
   * @returns {Promise<Object>} League-wide trends over time
   */
  async getHistoricalTrendsChartData() {
    const { data: seasons, error: seasonsError } = await this.client
      .from('historical_seasons')
      .select('id, year')
      .order('year');

    if (seasonsError) throw new Error(`Failed to fetch seasons: ${seasonsError.message}`);

    const trends = await Promise.all(
      seasons.map(async (season) => {
        const teams = await this.getSeasonTeams(season.id);

        const pointsForArr = teams.map(t => t.points_for);
        const avgPoints = pointsForArr.reduce((a, b) => a + b, 0) / teams.length;
        const maxPoints = Math.max(...pointsForArr);
        const minPoints = Math.min(...pointsForArr);

        return {
          year: season.year,
          avgPointsFor: avgPoints,
          maxPointsFor: maxPoints,
          minPointsFor: minPoints,
          pointsSpread: maxPoints - minPoints
        };
      })
    );

    return {
      labels: trends.map(t => t.year.toString()),
      datasets: {
        avgPoints: trends.map(t => t.avgPointsFor),
        maxPoints: trends.map(t => t.maxPointsFor),
        minPoints: trends.map(t => t.minPointsFor),
        spread: trends.map(t => t.pointsSpread)
      }
    };
  }

  /**
   * Get weekly scoring data for box plot visualization
   * @param {string} franchiseId - Franchise UUID (optional)
   * @param {number} year - Season year (optional)
   * @returns {Promise<Object>} Box plot data
   */
  async getWeeklyScoringBoxPlotData(franchiseId = null, year = null) {
    let query = this.client
      .from('historical_games')
      .select(`
        week,
        team1_score,
        team2_score,
        team1:historical_teams!historical_games_team1_id_fkey(franchise_id),
        team2:historical_teams!historical_games_team2_id_fkey(franchise_id),
        season:historical_seasons(year)
      `)
      .eq('type', 'regular')
      .eq('is_completed', true);

    if (year) {
      query = query.eq('season.year', year);
    }

    const { data: games, error } = await query;

    if (error) throw new Error(`Failed to fetch games: ${error.message}`);

    // Collect scores
    const scores = [];
    games.forEach(game => {
      if (!franchiseId || game.team1?.franchise_id === franchiseId) {
        scores.push({
          year: game.season?.year,
          week: game.week,
          score: game.team1_score
        });
      }
      if (!franchiseId || game.team2?.franchise_id === franchiseId) {
        scores.push({
          year: game.season?.year,
          week: game.week,
          score: game.team2_score
        });
      }
    });

    // Calculate quartiles
    const allScores = scores.map(s => s.score).sort((a, b) => a - b);
    const q1 = this._percentile(allScores, 25);
    const median = this._percentile(allScores, 50);
    const q3 = this._percentile(allScores, 75);
    const min = Math.min(...allScores);
    const max = Math.max(...allScores);

    return {
      min,
      q1,
      median,
      q3,
      max,
      mean: allScores.reduce((a, b) => a + b, 0) / allScores.length,
      count: allScores.length,
      scores: allScores
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Calculate standard deviation
   * @private
   */
  _calculateStdDev(values) {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const squareDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / n);
  }

  /**
   * Calculate percentile
   * @private
   */
  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const index = (p / 100) * (arr.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return arr[lower];
    return arr[lower] + (arr[upper] - arr[lower]) * (index - lower);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Refresh materialized views (admin only - requires service role)
   * Call this after importing new historical data
   * @returns {Promise<void>}
   */
  async refreshMaterializedViews() {
    const { error } = await this.client.rpc('refresh_league_history_views');

    if (error) throw new Error(`Failed to refresh views: ${error.message}`);
  }

  /**
   * Search franchises by owner name
   * @param {string} searchTerm - Search term
   * @returns {Promise<Array>} Matching franchises
   */
  async searchFranchises(searchTerm) {
    const { data, error } = await this.client
      .from('league_franchises')
      .select('*')
      .ilike('owner_name', `%${searchTerm}%`)
      .order('owner_name');

    if (error) throw new Error(`Failed to search franchises: ${error.message}`);
    return data || [];
  }
}

// Export singleton instance
export const leagueHistoryManager = new LeagueHistoryManager();

// Export class for testing/custom instances
export default LeagueHistoryManager;
