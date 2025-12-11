import { useState, useEffect, useCallback, useMemo } from 'react';
import { DataManager } from '../services/dataManager.js';
import { PowerRankingCalculator } from '../services/powerRankingCalculator.js';

let dataManagerInstance = null;

export const useFantasyData = () => {
  const [dataManager] = useState(() => {
    if (!dataManagerInstance) {
      dataManagerInstance = new DataManager();
    }
    return dataManagerInstance;
  });

  const [seasons, setSeasons] = useState([]);
  const [activeSeason, setActiveSeason] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshData = useCallback(() => {
    try {
      const allSeasons = dataManager.getAllSeasons();
      setSeasons(allSeasons);
      
      const active = dataManager.getActiveSeason();
      setActiveSeason(active);
      
      if (active) {
        const week = dataManager.getCurrentWeek(active.id);
        setCurrentWeek(week);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [dataManager]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Season operations
  const createSeason = useCallback(async (year, name, leagueSize, regularSeasonWeeks, playoffWeeks) => {
    setLoading(true);
    setError(null);
    try {
      const season = dataManager.createSeason(year, name, leagueSize, regularSeasonWeeks, playoffWeeks);
      refreshData();
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
      const season = dataManager.setActiveSeason(seasonId);
      refreshData();
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
      const result = dataManager.deleteSeason(seasonId);
      refreshData();
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
      const team = dataManager.addTeamToSeason(activeSeason.id, name, owner);
      refreshData();
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
      const team = dataManager.updateTeam(activeSeason.id, teamId, updates);
      refreshData();
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
      dataManager.removeTeamFromSeason(activeSeason.id, teamId);
      refreshData();
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
      const game = dataManager.addGame(activeSeason.id, week, team1Id, team2Id, team1Score, team2Score, type);
      refreshData();
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
      const game = dataManager.updateGameScore(activeSeason.id, gameId, team1Score, team2Score);
      refreshData();
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
      dataManager.completeWeek(activeSeason.id, week);
      refreshData();
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
      const schedule = dataManager.generateRoundRobinSchedule(activeSeason.id);
      refreshData();
      return schedule;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, activeSeason, refreshData]);

  // Data retrieval
  const getGamesForWeek = useCallback((week) => {
    if (!activeSeason) return [];
    return dataManager.getGamesForWeek(activeSeason.id, week);
  }, [dataManager, activeSeason]);

  const getCompletedGames = useCallback((upToWeek = null) => {
    if (!activeSeason) return [];
    return dataManager.getCompletedGames(activeSeason.id, upToWeek);
  }, [dataManager, activeSeason]);

  // Power rankings calculation
  const powerRankings = useMemo(() => {
    if (!activeSeason || !activeSeason.teams.length) return [];
    
    try {
      const completedGames = getCompletedGames();
      const calculator = new PowerRankingCalculator(activeSeason.teams, completedGames, currentWeek);
      return calculator.getRankings();
    } catch (err) {
      console.error('Error calculating power rankings:', err);
      return [];
    }
  }, [activeSeason, currentWeek, getCompletedGames]);

  const getPowerRankingsForWeek = useCallback((week) => {
    if (!activeSeason || !activeSeason.teams.length) return [];
    
    try {
      const completedGames = getCompletedGames(week);
      const calculator = new PowerRankingCalculator(activeSeason.teams, completedGames, week);
      return calculator.getRankings();
    } catch (err) {
      console.error('Error calculating power rankings for week:', err);
      return [];
    }
  }, [activeSeason, getCompletedGames]);

  // Utility functions
  const clearAllData = useCallback(() => {
    dataManager.clearStorage();
    refreshData();
  }, [dataManager, refreshData]);

  const exportSeason = useCallback((seasonId) => {
    return dataManager.exportSeasonData(seasonId);
  }, [dataManager]);

  const importSeason = useCallback(async (data) => {
    setLoading(true);
    setError(null);
    try {
      const seasonId = dataManager.importSeasonData(data);
      refreshData();
      return seasonId;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [dataManager, refreshData]);

  return {
    // State
    seasons,
    activeSeason,
    currentWeek,
    loading,
    error,
    powerRankings,
    
    // Season operations
    createSeason,
    setActiveSeasonById,
    deleteSeason,
    
    // Team operations
    addTeam,
    updateTeam,
    removeTeam,
    
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
    
    // Utility
    refreshData,
    clearAllData,
    exportSeason,
    importSeason,
    
    // Week navigation
    setCurrentWeek
  };
};