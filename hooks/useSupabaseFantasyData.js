import { useState, useEffect, useCallback, useMemo } from 'react';
import { SupabaseDataManager } from '../services/supabaseDataManager.js';
import { PowerRankingCalculator } from '../services/powerRankingCalculator.js';

let dataManagerInstance = null;

export const useSupabaseFantasyData = () => {
  const [dataManager] = useState(() => {
    if (!dataManagerInstance) {
      dataManagerInstance = new SupabaseDataManager();
    }
    return dataManagerInstance;
  });

  const [seasons, setSeasons] = useState([]);
  const [activeSeason, setActiveSeason] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [rosters, setRosters] = useState({});
  const [rosterStats, setRosterStats] = useState({});
  const [divisions, setDivisions] = useState([]);
  const [standings, setStandings] = useState({ divisions: [], unassigned: [] });

  // Initialize the data manager
  const initialize = useCallback(async () => {
    if (initialized) return;
    
    setLoading(true);
    setError(null);
    try {
      await dataManager.initialize();
      setInitialized(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized]);

  const refreshData = useCallback(async () => {
    if (!initialized) return;
    
    setLoading(true);
    setError(null);
    try {
      const [allSeasons, active] = await Promise.all([
        dataManager.getAllSeasons(),
        dataManager.getActiveSeason()
      ]);
      
      setSeasons(allSeasons);
      
      // If we have an active season, load its games as schedule
      if (active) {
        const [week, games, teams, seasonRosters, seasonDivisions, seasonStandings] = await Promise.all([
          dataManager.getCurrentWeek(active.id),
          // Get ALL games for this season (both completed and upcoming)
          dataManager.client
            .from('games')
            .select('*')
            .eq('season_id', active.id)
            .order('week', { ascending: true })
            .order('id', { ascending: true })
            .then(({ data, error }) => {
              if (error) throw error;
              return data || [];
            }),
          // Get ALL teams for this season
          dataManager.client
            .from('teams')
            .select('*')
            .eq('season_id', active.id)
            .order('id', { ascending: true })
            .then(({ data, error }) => {
              if (error) throw error;
              return data || [];
            }),
          // Get ALL rosters for this season
          dataManager.getAllRosters(active.id),
          // Get divisions for this season
          dataManager.getDivisionsForSeason(active.id),
          // Get standings with divisions
          dataManager.getStandingsByDivision(active.id)
        ]);
        
        // Format games to match expected structure
        const formattedGames = games.map(game => ({
          ...game,
          team1Id: game.team1_id,  // Map database field to expected frontend field
          team2Id: game.team2_id,  // Map database field to expected frontend field
          winnerTeamId: game.winner_team_id,  // Map winner field
          isCompleted: game.team1_score !== null && game.team2_score !== null
        }));
        
        // Attach games as schedule and teams to the active season
        active.schedule = formattedGames;
        active.teams = teams;
        setCurrentWeek(week);
        setRosters(seasonRosters || {});

        // If no divisions exist, create default ones
        if (!seasonDivisions || seasonDivisions.length === 0) {
          console.log('No divisions found, creating default divisions...');
          try {
            await dataManager.createDivision(active.id, 'Donkeys', 1);
            await dataManager.createDivision(active.id, 'Ninjas', 2);
            // Refetch divisions after creating them
            const newDivisions = await dataManager.getDivisionsForSeason(active.id);
            setDivisions(newDivisions || []);
          } catch (err) {
            console.error('Error creating default divisions:', err);
            setDivisions([]);
          }
        } else {
          setDivisions(seasonDivisions);
        }

        setStandings(seasonStandings || { divisions: [], unassigned: [] });
      }
      
      setActiveSeason(active);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    if (initialized) {
      refreshData();
    }
  }, [refreshData, initialized]);

  // Season operations
  const createSeason = useCallback(async (year, name, leagueSize, regularSeasonWeeks, playoffWeeks) => {
    setLoading(true);
    setError(null);
    try {
      const season = await dataManager.createSeason(year, name, leagueSize, regularSeasonWeeks, playoffWeeks);
      await refreshData();
      return season;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, refreshData]);

  const setActiveSeasonById = useCallback(async (seasonId) => {
    setLoading(true);
    setError(null);
    try {
      const season = await dataManager.setActiveSeason(seasonId);
      await refreshData();
      return season;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, refreshData]);

  const deleteSeason = useCallback(async (seasonId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.deleteSeason(seasonId);
      await refreshData();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, refreshData]);

  // Team operations
  const addTeam = useCallback(async (name, owner = '') => {
    if (!activeSeason) {
      throw new Error('No active season');
    }
    
    setLoading(true);
    setError(null);
    try {
      const team = await dataManager.addTeamToSeason(activeSeason.id, name, owner);
      await refreshData();
      return team;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  const updateTeam = useCallback(async (teamId, updates) => {
    if (!activeSeason) {
      throw new Error('No active season');
    }
    
    setLoading(true);
    setError(null);
    try {
      const team = await dataManager.updateTeam(activeSeason.id, teamId, updates);
      await refreshData();
      return team;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  const removeTeam = useCallback(async (teamId) => {
    if (!activeSeason) {
      throw new Error('No active season');
    }
    
    setLoading(true);
    setError(null);
    try {
      await dataManager.removeTeamFromSeason(activeSeason.id, teamId);
      await refreshData();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  // Division operations
  const renameDivision = useCallback(async (divisionId, newName) => {
    if (!activeSeason) {
      throw new Error('No active season');
    }

    setLoading(true);
    setError(null);
    try {
      await dataManager.updateDivision(divisionId, { name: newName });
      await refreshData();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  const assignTeamToDivision = useCallback(async (teamId, divisionId) => {
    if (!activeSeason) {
      throw new Error('No active season');
    }

    setLoading(true);
    setError(null);
    try {
      await dataManager.assignTeamToDivision(teamId, divisionId);
      await refreshData();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  const createDivision = useCallback(async (name, displayOrder = 1) => {
    if (!activeSeason) {
      throw new Error('No active season');
    }

    setLoading(true);
    setError(null);
    try {
      const division = await dataManager.createDivision(activeSeason.id, name, displayOrder);
      await refreshData();
      return division;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  const deleteDivision = useCallback(async (divisionId) => {
    if (!activeSeason) {
      throw new Error('No active season');
    }

    setLoading(true);
    setError(null);
    try {
      await dataManager.deleteDivision(divisionId);
      await refreshData();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  // Game operations
  const addGame = useCallback(async (week, team1Id, team2Id, team1Score = null, team2Score = null, type = 'regular') => {
    if (!activeSeason) {
      throw new Error('No active season');
    }
    
    setLoading(true);
    setError(null);
    try {
      const game = await dataManager.addGame(activeSeason.id, week, team1Id, team2Id, team1Score, team2Score, type);
      await refreshData();
      return game;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  const updateGameScore = useCallback(async (gameId, team1Score, team2Score) => {
    if (!activeSeason) {
      throw new Error('No active season');
    }
    
    setLoading(true);
    setError(null);
    try {
      const game = await dataManager.updateGameScore(activeSeason.id, gameId, team1Score, team2Score);
      await refreshData();
      return game;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  const addWeekScores = useCallback(async (week, scores) => {
    if (!activeSeason) {
      throw new Error('No active season');
    }
    
    setLoading(true);
    setError(null);
    try {
      const games = [];
      
      // Convert scores object to games
      for (const [matchupKey, matchup] of Object.entries(scores)) {
        const { team1Id, team2Id, team1Score, team2Score } = matchup;
        const game = await dataManager.addGame(
          activeSeason.id, 
          week, 
          team1Id, 
          team2Id, 
          team1Score, 
          team2Score
        );
        games.push(game);
      }
      
      // Complete the week if all games are done
      await dataManager.completeWeek(activeSeason.id, week);
      await refreshData();
      return games;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  // Schedule operations
  const generateSchedule = useCallback(async () => {
    if (!activeSeason) {
      throw new Error('No active season');
    }
    
    setLoading(true);
    setError(null);
    try {
      const schedule = await dataManager.generateRoundRobinSchedule(activeSeason.id);
      await refreshData();
      return schedule;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  // Data retrieval
  const getGamesForWeek = useCallback(async (week) => {
    if (!activeSeason) return [];
    try {
      return await dataManager.getGamesForWeek(activeSeason.id, week);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, activeSeason]);

  const getCompletedGames = useCallback(async (upToWeek = null) => {
    if (!activeSeason) return [];
    try {
      return await dataManager.getCompletedGames(activeSeason.id, upToWeek);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, activeSeason]);

  // Power rankings calculation (using database function)
  const [powerRankings, setPowerRankings] = useState([]);
  
  

  const getPowerRankingsFromDatabase = useCallback(async (weekNumber = null) => {
    if (!activeSeason) return [];
    
    setLoading(true);
    try {
      const rankings = await dataManager.calculatePowerRankings(activeSeason.id, weekNumber);
      return rankings;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason]);

  const getPowerRankingsHistory = useCallback(async (weekNumber = null) => {
    if (!activeSeason) return [];
    
    try {
      return await dataManager.getPowerRankingsHistory(activeSeason.id, weekNumber);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, activeSeason]);

  const getPowerRankingsForWeek = useCallback(async (week, viewingWeek = null) => {
    if (!activeSeason) return [];

    try {
      console.log('Getting power rankings for week:', week, 'viewingWeek:', viewingWeek);

      // ALWAYS use live calculations - no more snapshots
      // Get all necessary data for the calculator
      const [teams, games, players] = await Promise.all([
        dataManager.client
          .from('teams')
          .select('*')
          .eq('season_id', activeSeason.id),
        dataManager.client
          .from('games')
          .select('*')
          .eq('season_id', activeSeason.id),
        dataManager.getAllPlayers(activeSeason.id)
      ]);

      console.log('Data loaded:', {
        teams: teams.data?.length,
        games: games.data?.length,
        players: players?.length,
        sampleGame: games.data?.[0]
      });

      // Create calculator with viewingWeek parameter for historical accuracy
      const calculator = new PowerRankingCalculator(
        teams.data || [],
        games.data?.map(g => ({
          ...g,
          team1Id: g.team1_id,
          team2Id: g.team2_id,
          team1Score: g.team1_score,
          team2Score: g.team2_score,
          isCompleted: g.team1_score !== null && g.team2_score !== null
        })) || [],
        currentWeek,
        players || [],
        viewingWeek || week // Pass viewing week for historical calculations
      );

      const rankings = calculator.getRankings();
      console.log('Calculated rankings:', rankings?.length, 'teams');
      if (rankings.length > 0) {
        console.log('Sample ranking data:', {
          name: rankings[0].name,
          powerRating: rankings[0].powerRating,
          pointsFor: rankings[0].pointsFor,
          pointsAgainst: rankings[0].pointsAgainst,
          pointDifferential: rankings[0].pointDifferential,
          wins: rankings[0].wins,
          losses: rankings[0].losses,
          gamesPlayed: rankings[0].gamesPlayed
        });
      }

      return rankings;
    } catch (err) {
      console.error('Error getting power rankings for week:', err);
      setError(err.message);
      return [];
    }
  }, [activeSeason, dataManager, currentWeek]);

  // New functions for enhanced power rankings management
  const saveWeeklySnapshot = useCallback(async (weekNumber, snapshotType = 'manual') => {
    if (!activeSeason) {
      throw new Error('No active season');
    }
    
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.saveWeeklyPowerRankingsSnapshot(
        activeSeason.id, 
        weekNumber, 
        snapshotType
      );
      console.log(`Saved ${result} team rankings for week ${weekNumber}`);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason]);

  const checkWeeklySnapshotStatus = useCallback(async () => {
    try {
      return await dataManager.checkWeeklySnapshotStatus(activeSeason?.year || 2025);
    } catch (err) {
      console.warn('Error checking weekly snapshot status:', err.message);
      return { should_trigger: false, reason: 'Error checking status' };
    }
  }, [dataManager, activeSeason]);

  const executeWeeklySnapshotIfNeeded = useCallback(async () => {
    try {
      return await dataManager.executeWeeklySnapshotIfNeeded(activeSeason?.year || 2025);
    } catch (err) {
      console.error('Error executing weekly snapshot:', err.message);
      setError(err.message);
      return { status: 'error', error_message: err.message };
    }
  }, [dataManager, activeSeason]);

  const getCurrentNFLWeek = useCallback(async () => {
    try {
      return await dataManager.getCurrentNFLWeek(activeSeason?.year || 2025);
    } catch (err) {
      console.warn('Error getting current NFL week:', err.message);
      return 1;
    }
  }, [dataManager, activeSeason]);

  const getAvailableSnapshotWeeks = useCallback(async () => {
    if (!activeSeason) return [];
    
    try {
      return await dataManager.getAvailableSnapshotWeeks(activeSeason.id);
    } catch (err) {
      console.error('Error getting available snapshot weeks:', err.message);
      return [];
    }
  }, [dataManager, activeSeason]);

  const refreshPowerRankings = useCallback(async (viewingWeek = null) => {
    if (!activeSeason) {
      setPowerRankings([]);
      return;
    }

    try {
      console.log('Refreshing power rankings for viewing week:', viewingWeek);

      // Use the viewing week or current week for live calculations
      const weekToUse = viewingWeek || currentWeek || activeSeason.current_week || 1;
      const rankings = await getPowerRankingsForWeek(weekToUse, viewingWeek);

      console.log('Setting power rankings:', rankings);
      setPowerRankings(rankings);
    } catch (err) {
      console.error('Error calculating power rankings:', err);
      setPowerRankings([]);
    }
  }, [activeSeason, getPowerRankingsForWeek, currentWeek]);
  
  // Effect to refresh power rankings when active season or current week changes
  useEffect(() => {
    if (activeSeason) {
      refreshPowerRankings(currentWeek);
    }
  }, [activeSeason, currentWeek, refreshPowerRankings]);

  // Utility functions
  const clearAllData = useCallback(async () => {
    // Since we're using Supabase, we'll just clear the cache and reset state
    setSeasons([]);
    setActiveSeason(null);
    setCurrentWeek(1);
    dataManager.seasonsCache.clear();
    dataManager.activeSeasonId = null;
  }, [dataManager]);

  const exportSeason = useCallback(async (seasonId) => {
    try {
      return await dataManager.exportSeasonData(seasonId);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [dataManager]);

  const importSeason = useCallback(async (_data) => {
    setLoading(true);
    setError(null);
    try {
      // For now, importing will need to be handled differently with Supabase
      // This would require creating a new season and populating it with the imported data
      throw new Error('Import functionality needs to be implemented for Supabase');
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Roster operations
  const getRosterForTeam = useCallback(async (teamId) => {
    if (!initialized) return [];
    try {
      return await dataManager.getTeamRoster(teamId);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);
  
  const syncRosterFromESPN = useCallback(async (teamId, rosterData, currentWeek) => {
    if (!initialized) throw new Error('Not initialized');
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.syncTeamRosterFromESPN(teamId, rosterData, currentWeek);
      await refreshData(); // Refresh to get updated roster data
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized, refreshData]);

  const getAllPlayers = useCallback(async (seasonId = null) => {
    try {
      return await dataManager.getAllPlayers(seasonId || activeSeason?.id);
    } catch (err) {
      console.error('Error getting all players:', err);
      setError(err.message);
      return [];
    }
  }, [dataManager, activeSeason?.id]);
  
  const getAllRostersForSeason = useCallback(async (seasonId) => {
    if (!initialized) return {};
    try {
      return await dataManager.getAllRosters(seasonId);
    } catch (err) {
      setError(err.message);
      return {};
    }
  }, [dataManager, initialized]);

  // ESPN Schedule Import operations
  const getPendingScheduleImports = useCallback(async () => {
    if (!initialized) return [];
    try {
      return await dataManager.getPendingScheduleImports();
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);

  const getScheduleImportDetails = useCallback(async (importId) => {
    if (!initialized) return null;
    try {
      return await dataManager.getScheduleImportDetails(importId);
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [dataManager, initialized]);

  const assignScheduleToSeason = useCallback(async (importId, seasonId, notes = null) => {
    if (!initialized) throw new Error('Not initialized');
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.assignScheduleToSeason(importId, seasonId, notes);
      await refreshData();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized, refreshData]);

  const rejectScheduleImport = useCallback(async (importId, notes = null) => {
    if (!initialized) throw new Error('Not initialized');
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.rejectScheduleImport(importId, notes);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized]);

  // ================================
  // PICK'EMS OPERATIONS
  // ================================

  // Pick'em week management
  const createPickEmWeek = useCallback(async (seasonId, weekNumber, customSchedule = null) => {
    if (!initialized) throw new Error('Not initialized');
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.createPickEmWeek(seasonId, weekNumber, customSchedule);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized]);

  const getPickEmWeek = useCallback(async (seasonId, weekNumber) => {
    if (!initialized) return null;
    try {
      return await dataManager.getPickEmWeek(seasonId, weekNumber);
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [dataManager, initialized]);

  const getAllPickEmWeeks = useCallback(async (seasonId) => {
    if (!initialized) return [];
    try {
      return await dataManager.getAllPickEmWeeks(seasonId);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);

  const getPickEmStatus = useCallback(async (seasonId) => {
    if (!initialized) return [];
    try {
      return await dataManager.getPickEmStatus(seasonId);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);

  // Pick'em submissions
  const submitPickEmPicks = useCallback(async (pickEmWeekId, picks) => {
    if (!initialized) throw new Error('Not initialized');
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.submitPickEmPicks(pickEmWeekId, picks);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized]);

  const getUserPicksForWeek = useCallback(async (pickEmWeekId, userId = null) => {
    if (!initialized) return [];
    try {
      return await dataManager.getUserPicksForWeek(pickEmWeekId, userId);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);

  const getAllPicksForWeek = useCallback(async (pickEmWeekId) => {
    if (!initialized) return [];
    try {
      return await dataManager.getAllPicksForWeek(pickEmWeekId);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);

  // Pick'em results and scoring
  const calculatePickEmResults = useCallback(async (pickEmWeekId) => {
    if (!initialized) throw new Error('Not initialized');
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.calculatePickEmResults(pickEmWeekId);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized]);

  const getWeeklyPickEmScores = useCallback(async (pickEmWeekId) => {
    if (!initialized) return [];
    try {
      return await dataManager.getWeeklyPickEmScores(pickEmWeekId);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);

  const getSeasonPickEmStandings = useCallback(async (seasonId) => {
    if (!initialized) return [];
    try {
      return await dataManager.getSeasonPickEmStandings(seasonId);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);

  const getPickEmGameData = useCallback(async (seasonId, weekNumber) => {
    if (!initialized) return [];
    try {
      return await dataManager.getPickEmGameData(seasonId, weekNumber);
    } catch (err) {
      setError(err.message);
      return [];
    }
  }, [dataManager, initialized]);

  // Administrative functions
  const createPickEmWeeksForSeason = useCallback(async (seasonId, startWeek = 1, endWeek = null) => {
    if (!initialized) throw new Error('Not initialized');
    setLoading(true);
    setError(null);
    try {
      const result = await dataManager.createPickEmWeeksForSeason(seasonId, startWeek, endWeek);
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, initialized]);

  return {
    // State
    seasons,
    activeSeason,
    currentWeek,
    loading,
    error,
    initialized,
    powerRankings,
    rosters,
    rosterStats,
    divisions,
    standings,
    dataManager, // Expose dataManager for direct access

    // Season operations
    createSeason,
    setActiveSeasonById,
    deleteSeason,

    // Team operations
    addTeam,
    updateTeam,
    removeTeam,

    // Division operations
    renameDivision,
    assignTeamToDivision,
    createDivision,
    deleteDivision,
    
    // Game operations
    addGame,
    updateGameScore,
    addWeekScores,
    
    // Schedule operations
    generateSchedule,
    
    // Data retrieval
    getGamesForWeek,
    getCompletedGames,
    getPowerRankingsForWeek,
    getPowerRankingsFromDatabase,
    getPowerRankingsHistory,
    refreshPowerRankings,
    
    // Enhanced power rankings management
    saveWeeklySnapshot,
    checkWeeklySnapshotStatus,
    executeWeeklySnapshotIfNeeded,
    getCurrentNFLWeek,
    getAvailableSnapshotWeeks,
    
    // Roster operations
    getRosterForTeam,
    syncRosterFromESPN,
    getAllRostersForSeason,
    getAllPlayers,
    
    // ESPN Schedule Import operations
    getPendingScheduleImports,
    getScheduleImportDetails,
    assignScheduleToSeason,
    rejectScheduleImport,

    // Pick'ems operations
    createPickEmWeek,
    getPickEmWeek,
    getAllPickEmWeeks,
    getPickEmStatus,
    submitPickEmPicks,
    getUserPicksForWeek,
    getAllPicksForWeek,
    calculatePickEmResults,
    getWeeklyPickEmScores,
    getSeasonPickEmStandings,
    getPickEmGameData,
    createPickEmWeeksForSeason,

    // Utility
    refreshData,
    clearAllData,
    exportSeason,
    importSeason,

    // Week navigation
    setCurrentWeek
  };
};