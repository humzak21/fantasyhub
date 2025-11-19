import { useState, useEffect, useCallback, useMemo } from 'react';
import { leagueHistoryManager } from '../../services/leagueHistoryManager';

/**
 * Custom hook for managing league history data
 * Provides data fetching, caching, and state management for historical league data
 */
export const useLeagueHistory = () => {
  // Core data state
  const [franchises, setFranchises] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [careerStats, setCareerStats] = useState([]);
  const [championships, setChampionships] = useState([]);

  // Selected/filtered state
  const [selectedFranchiseId, setSelectedFranchiseId] = useState(null);
  const [selectedSeasonYear, setSelectedSeasonYear] = useState(null);
  const [selectedFranchiseIds, setSelectedFranchiseIds] = useState([]); // For multi-select comparisons

  // Detailed data state (loaded on demand)
  const [franchiseHistory, setFranchiseHistory] = useState({}); // keyed by franchiseId
  const [seasonDetails, setSeasonDetails] = useState({}); // keyed by seasonId
  const [h2hRecords, setH2hRecords] = useState({}); // keyed by "franchise1Id-franchise2Id"
  const [franchiseAwards, setFranchiseAwards] = useState({}); // keyed by franchiseId

  // UI state
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);

  // Cache timestamps to avoid unnecessary refetches
  const [lastFranchisesLoad, setLastFranchisesLoad] = useState(null);
  const [lastSeasonsLoad, setLastSeasonsLoad] = useState(null);

  /**
   * Load all franchises with current season stats merged (lightweight, cached)
   */
  const loadFranchises = useCallback(async (force = false) => {
    // Use cache if available and not forcing refresh (cache for 5 minutes)
    if (!force && lastFranchisesLoad && Date.now() - lastFranchisesLoad < 5 * 60 * 1000) {
      return franchises;
    }

    try {
      setLoading(true);
      setError(null);
      // Use the new method that includes current season data
      const data = await leagueHistoryManager.getAllFranchisesWithCurrentSeason();
      setFranchises(data || []);
      setLastFranchisesLoad(Date.now());
      return data || [];
    } catch (err) {
      console.error('Error loading franchises:', err);
      setError(`Failed to load franchises: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, [franchises, lastFranchisesLoad]);

  /**
   * Load all historical seasons (lightweight, cached)
   */
  const loadSeasons = useCallback(async (force = false) => {
    // Use cache if available and not forcing refresh
    if (!force && lastSeasonsLoad && Date.now() - lastSeasonsLoad < 5 * 60 * 1000) {
      return seasons;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getHistoricalSeasons();
      setSeasons(data || []);
      setLastSeasonsLoad(Date.now());
      return data || [];
    } catch (err) {
      console.error('Error loading seasons:', err);
      setError(`Failed to load seasons: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, [seasons, lastSeasonsLoad]);

  /**
   * Load career stats for all franchises with current season included
   */
  const loadCareerStats = useCallback(async (sortBy = 'championships') => {
    try {
      setLoading(true);
      setError(null);
      // Use the new method that includes current season data
      const data = await leagueHistoryManager.getAllFranchiseCareerStatsWithCurrentSeason({ sortBy });
      setCareerStats(data || []);
      return data || [];
    } catch (err) {
      console.error('Error loading career stats:', err);
      setError(`Failed to load career stats: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load all championships
   */
  const loadChampionships = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getAllChampionships();
      setChampionships(data || []);
      return data || [];
    } catch (err) {
      console.error('Error loading championships:', err);
      setError(`Failed to load championships: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Load detailed history for a specific franchise (includes current season)
   */
  const loadFranchiseHistory = useCallback(async (franchiseId) => {
    // Check cache first - but only if it has actual season history data
    const cached = franchiseHistory[franchiseId];
    if (cached && cached.seasonHistory && cached.seasonHistory.length > 0) {
      return cached;
    }

    try {
      setLoading(true);
      setError(null);

      // Load multiple data points in parallel (using methods that include current season)
      const [seasonHistory, awards, careerStats, currentSeasonStats] = await Promise.all([
        leagueHistoryManager.getFranchiseSeasonHistory(franchiseId),
        leagueHistoryManager.getFranchiseAwards(franchiseId),
        leagueHistoryManager.getFranchiseCareerStatsWithCurrentSeason(franchiseId),
        leagueHistoryManager.getCurrentSeasonStatsForFranchise(franchiseId)
      ]);

      // Add current season to season history if it exists
      let fullSeasonHistory = seasonHistory || [];
      if (currentSeasonStats) {
        fullSeasonHistory = [
          ...fullSeasonHistory,
          {
            id: `current-${currentSeasonStats.seasonId}`,
            season: { year: currentSeasonStats.year, name: `${currentSeasonStats.year} Season` },
            team_name: currentSeasonStats.teamName,
            regular_season_wins: currentSeasonStats.wins,
            regular_season_losses: currentSeasonStats.losses,
            points_for: currentSeasonStats.pointsFor,
            points_against: currentSeasonStats.pointsAgainst,
            playoff_finish: null, // Current season not complete
            is_current_season: true
          }
        ];
      }

      const data = {
        seasonHistory: fullSeasonHistory,
        awards: awards || [],
        careerStats: careerStats || {},
        currentSeason: currentSeasonStats
      };

      // Cache the result
      setFranchiseHistory(prev => ({ ...prev, [franchiseId]: data }));
      setFranchiseAwards(prev => ({ ...prev, [franchiseId]: awards || [] }));

      return data;
    } catch (err) {
      console.error(`Error loading franchise history for ${franchiseId}:`, err);
      setError(`Failed to load franchise history: ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [franchiseHistory]);

  /**
   * Load detailed data for a specific season
   */
  const loadSeasonDetail = useCallback(async (seasonId) => {
    // Check cache first
    if (seasonDetails[seasonId]) {
      return seasonDetails[seasonId];
    }

    try {
      setLoading(true);
      setError(null);

      // Load season teams and awards in parallel
      const [teams, awards] = await Promise.all([
        leagueHistoryManager.getSeasonTeams(seasonId),
        leagueHistoryManager.getSeasonAwards(seasonId)
      ]);

      const data = {
        teams: teams || [],
        awards: awards || []
      };

      // Cache the result
      setSeasonDetails(prev => ({ ...prev, [seasonId]: data }));

      return data;
    } catch (err) {
      console.error(`Error loading season detail for ${seasonId}:`, err);
      setError(`Failed to load season details: ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [seasonDetails]);

  /**
   * Load head-to-head record between two franchises
   */
  const loadH2HRecord = useCallback(async (franchise1Id, franchise2Id) => {
    const cacheKey = [franchise1Id, franchise2Id].sort().join('-');

    // Check cache first
    if (h2hRecords[cacheKey]) {
      return h2hRecords[cacheKey];
    }

    try {
      setLoading(true);
      setError(null);

      const [record, matchupHistory] = await Promise.all([
        leagueHistoryManager.getHeadToHeadRecord(franchise1Id, franchise2Id),
        leagueHistoryManager.getMatchupHistory(franchise1Id, franchise2Id)
      ]);

      const data = {
        record: record || {},
        matchupHistory: matchupHistory || []
      };

      // Cache the result
      setH2hRecords(prev => ({ ...prev, [cacheKey]: data }));

      return data;
    } catch (err) {
      console.error(`Error loading H2H record:`, err);
      setError(`Failed to load head-to-head record: ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [h2hRecords]);

  /**
   * Load all H2H records for a franchise
   */
  const loadFranchiseH2HRecords = useCallback(async (franchiseId) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getFranchiseHeadToHeadRecords(franchiseId);
      return data || [];
    } catch (err) {
      console.error(`Error loading franchise H2H records:`, err);
      setError(`Failed to load H2H records: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Compare two seasons
   */
  const compareSeasons = useCallback(async (year1, year2) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.compareSeasons(year1, year2);
      return data || null;
    } catch (err) {
      console.error(`Error comparing seasons ${year1} and ${year2}:`, err);
      setError(`Failed to compare seasons: ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get year-over-year performance for a franchise
   */
  const getFranchiseYearOverYear = useCallback(async (franchiseId) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getFranchiseYearOverYear(franchiseId);
      return data || [];
    } catch (err) {
      console.error(`Error loading YoY data:`, err);
      setError(`Failed to load year-over-year data: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get franchise records (optionally filtered by category)
   */
  const getFranchiseRecords = useCallback(async (franchiseId = null, category = null) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getFranchiseRecords(franchiseId, category);
      return data || [];
    } catch (err) {
      console.error(`Error loading franchise records:`, err);
      setError(`Failed to load records: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get a specific league record
   */
  const getLeagueRecord = useCallback(async (recordType) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getLeagueRecord(recordType);
      return data || null;
    } catch (err) {
      console.error(`Error loading league record ${recordType}:`, err);
      setError(`Failed to load league record: ${err.message}`);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get head-to-head matrix for all franchises
   */
  const getHeadToHeadMatrix = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getHeadToHeadMatrix();
      return data || { franchises: [], matrix: [] };
    } catch (err) {
      console.error('Error loading H2H matrix:', err);
      setError(`Failed to load head-to-head matrix: ${err.message}`);
      return { franchises: [], matrix: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get single-season records
   */
  const getSingleSeasonRecords = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getSingleSeasonRecords();
      return data || {};
    } catch (err) {
      console.error('Error loading single-season records:', err);
      setError(`Failed to load records: ${err.message}`);
      return {};
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get all-time leaderboard for a specific stat
   */
  const getAllTimeLeaderboard = useCallback(async (stat = 'wins', limit = 15) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getAllTimeLeaderboard(stat, limit);
      return data || [];
    } catch (err) {
      console.error('Error loading all-time leaderboard:', err);
      setError(`Failed to load leaderboard: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get franchise rivalries (best/worst matchups)
   */
  const getFranchiseRivalries = useCallback(async (franchiseId) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getFranchiseRivalries(franchiseId);
      return data || { bestMatchups: [], worstMatchups: [], mostFrequent: [], all: [] };
    } catch (err) {
      console.error('Error loading franchise rivalries:', err);
      setError(`Failed to load rivalries: ${err.message}`);
      return { bestMatchups: [], worstMatchups: [], mostFrequent: [], all: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get chart data for franchise performance over time
   */
  const getFranchisePerformanceChartData = useCallback(async (franchiseId) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getFranchisePerformanceChartData(franchiseId);
      return data || { labels: [], datasets: {}, metadata: {} };
    } catch (err) {
      console.error('Error loading franchise chart data:', err);
      setError(`Failed to load chart data: ${err.message}`);
      return { labels: [], datasets: {}, metadata: {} };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get historical trends chart data
   */
  const getHistoricalTrendsChartData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getHistoricalTrendsChartData();
      return data || { labels: [], datasets: {} };
    } catch (err) {
      console.error('Error loading historical trends:', err);
      setError(`Failed to load trends data: ${err.message}`);
      return { labels: [], datasets: {} };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get franchise comparison radar chart data
   */
  const getFranchiseComparisonChartData = useCallback(async (franchiseIds) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getFranchiseComparisonChartData(franchiseIds);
      return data || { labels: [], datasets: [] };
    } catch (err) {
      console.error('Error loading comparison chart data:', err);
      setError(`Failed to load comparison data: ${err.message}`);
      return { labels: [], datasets: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Initialize - load core data on mount
   */
  useEffect(() => {
    const initialize = async () => {
      setInitializing(true);
      try {
        // Load core data in parallel
        await Promise.all([
          loadFranchises(),
          loadSeasons(),
          loadCareerStats(),
          loadChampionships()
        ]);
      } catch (err) {
        console.error('Error initializing league history:', err);
        setError(`Failed to initialize: ${err.message}`);
      } finally {
        setInitializing(false);
      }
    };

    initialize();
  }, []); // Only run once on mount

  /**
   * Get selected franchise object
   */
  const selectedFranchise = useMemo(() => {
    if (!selectedFranchiseId) return null;
    return franchises.find(f => f.id === selectedFranchiseId) || null;
  }, [selectedFranchiseId, franchises]);

  /**
   * Get selected season object
   */
  const selectedSeason = useMemo(() => {
    if (!selectedSeasonYear) return null;
    return seasons.find(s => s.year === selectedSeasonYear) || null;
  }, [selectedSeasonYear, seasons]);

  /**
   * Get active franchises only
   */
  const activeFranchises = useMemo(() => {
    return franchises.filter(f => f.is_active);
  }, [franchises]);

  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Refresh all data
   */
  const refresh = useCallback(async () => {
    await Promise.all([
      loadFranchises(true),
      loadSeasons(true),
      loadCareerStats(),
      loadChampionships()
    ]);
  }, [loadFranchises, loadSeasons, loadCareerStats, loadChampionships]);

  /**
   * Get matchup history between two franchises
   */
  const getMatchupHistory = useCallback(async (franchise1Id, franchise2Id) => {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueHistoryManager.getMatchupHistory(franchise1Id, franchise2Id);
      return data || [];
    } catch (err) {
      console.error('Error loading matchup history:', err);
      setError(`Failed to load matchup history: ${err.message}`);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    // Core data
    franchises,
    seasons,
    careerStats,
    championships,
    activeFranchises,

    // Selected state
    selectedFranchiseId,
    setSelectedFranchiseId,
    selectedFranchise,
    selectedSeasonYear,
    setSelectedSeasonYear,
    selectedSeason,
    selectedFranchiseIds,
    setSelectedFranchiseIds,

    // Cached detailed data
    franchiseHistory,
    seasonDetails,
    h2hRecords,
    franchiseAwards,

    // Loading methods
    loadFranchises,
    loadSeasons,
    loadCareerStats,
    loadChampionships,
    loadFranchiseHistory,
    loadSeasonDetail,
    loadH2HRecord,
    loadFranchiseH2HRecords,
    compareSeasons,
    getFranchiseYearOverYear,
    getFranchiseRecords,
    getLeagueRecord,

    // New methods for matrix, records, and charts
    getHeadToHeadMatrix,
    getMatchupHistory,
    getSingleSeasonRecords,
    getAllTimeLeaderboard,
    getFranchiseRivalries,
    getFranchisePerformanceChartData,
    getHistoricalTrendsChartData,
    getFranchiseComparisonChartData,

    // Utility methods
    refresh,
    clearError,

    // State
    loading,
    initializing,
    error
  };
};
