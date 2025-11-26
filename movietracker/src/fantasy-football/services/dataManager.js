import { createSeason, createTeam, createGame, createWeek, validateSeason, validateTeam, validateGame } from '../types/index.js';

export class DataManager {
  constructor() {
    this.seasons = new Map();
    this.activeSeasonId = null;
    this.loadFromStorage();
  }

  // Storage management
  saveToStorage() {
    const data = {
      seasons: Array.from(this.seasons.entries()),
      activeSeasonId: this.activeSeasonId
    };
    localStorage.setItem('fantasy-football-data', JSON.stringify(data));
  }

  loadFromStorage() {
    try {
      const data = localStorage.getItem('fantasy-football-data');
      if (data) {
        const parsed = JSON.parse(data);
        this.seasons = new Map(parsed.seasons || []);
        this.activeSeasonId = parsed.activeSeasonId;
      }
    } catch (error) {
      console.error('Error loading data from storage:', error);
      this.seasons = new Map();
      this.activeSeasonId = null;
    }
  }

  clearStorage() {
    localStorage.removeItem('fantasy-football-data');
    this.seasons = new Map();
    this.activeSeasonId = null;
  }

  // Season management
  createSeason(year, name = '', leagueSize = 14, regularSeasonWeeks = 14, playoffWeeks = 3) {
    const season = createSeason(year, name, leagueSize, regularSeasonWeeks, playoffWeeks);
    
    if (!validateSeason(season)) {
      throw new Error('Invalid season data');
    }

    // Initialize weeks
    for (let week = 1; week <= season.totalWeeks; week++) {
      season.weeks.push(createWeek(week, season.id));
    }

    this.seasons.set(season.id, season);
    this.saveToStorage();
    return season;
  }

  getSeason(seasonId) {
    return this.seasons.get(seasonId);
  }

  getAllSeasons() {
    return Array.from(this.seasons.values()).sort((a, b) => b.year - a.year);
  }

  setActiveSeason(seasonId) {
    if (this.seasons.has(seasonId)) {
      this.activeSeasonId = seasonId;
      const season = this.seasons.get(seasonId);
      season.isActive = true;
      
      // Deactivate other seasons
      this.seasons.forEach((s, id) => {
        if (id !== seasonId) {
          s.isActive = false;
        }
      });
      
      this.saveToStorage();
      return season;
    }
    throw new Error('Season not found');
  }

  getActiveSeason() {
    return this.activeSeasonId ? this.seasons.get(this.activeSeasonId) : null;
  }

  deleteSeason(seasonId) {
    if (this.seasons.has(seasonId)) {
      this.seasons.delete(seasonId);
      if (this.activeSeasonId === seasonId) {
        this.activeSeasonId = null;
      }
      this.saveToStorage();
      return true;
    }
    return false;
  }

  // Team management
  addTeamToSeason(seasonId, name, owner = '') {
    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const teamId = `${seasonId}-team-${season.teams.length + 1}`;
    const team = createTeam(teamId, name, owner);
    
    if (!validateTeam(team)) {
      throw new Error('Invalid team data');
    }

    season.teams.push(team);
    this.saveToStorage();
    return team;
  }

  updateTeam(seasonId, teamId, updates) {
    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const teamIndex = season.teams.findIndex(team => team.id === teamId);
    if (teamIndex === -1) {
      throw new Error('Team not found');
    }

    season.teams[teamIndex] = { ...season.teams[teamIndex], ...updates };
    this.saveToStorage();
    return season.teams[teamIndex];
  }

  removeTeamFromSeason(seasonId, teamId) {
    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    season.teams = season.teams.filter(team => team.id !== teamId);
    // Also remove all games involving this team
    season.schedule = season.schedule.filter(game => 
      game.team1Id !== teamId && game.team2Id !== teamId
    );
    
    this.saveToStorage();
  }

  // Game management
  addGame(seasonId, week, team1Id, team2Id, team1Score = null, team2Score = null, type = 'regular') {
    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const game = createGame(week, team1Id, team2Id, team1Score, team2Score, type);
    
    if (!validateGame(game)) {
      throw new Error('Invalid game data');
    }

    // Check if game already exists
    const existingGameIndex = season.schedule.findIndex(g => 
      g.week === week && 
      ((g.team1Id === team1Id && g.team2Id === team2Id) || 
       (g.team1Id === team2Id && g.team2Id === team1Id))
    );

    if (existingGameIndex !== -1) {
      // Update existing game
      season.schedule[existingGameIndex] = this.completeGame(game);
    } else {
      // Add new game
      season.schedule.push(this.completeGame(game));
    }

    // Update week data
    const weekData = season.weeks.find(w => w.weekNumber === week);
    if (weekData) {
      const weekGameIndex = weekData.games.findIndex(g => g.id === game.id);
      if (weekGameIndex !== -1) {
        weekData.games[weekGameIndex] = game;
      } else {
        weekData.games.push(game);
      }
    }

    this.saveToStorage();
    return game;
  }

  completeGame(game) {
    if (game.team1Score !== null && game.team2Score !== null) {
      game.isCompleted = true;
      game.completedAt = new Date().toISOString();
      game.pointDifferential = Math.abs(game.team1Score - game.team2Score);
      
      if (game.team1Score > game.team2Score) {
        game.winnerTeamId = game.team1Id;
        game.loserTeamId = game.team2Id;
      } else if (game.team2Score > game.team1Score) {
        game.winnerTeamId = game.team2Id;
        game.loserTeamId = game.team1Id;
      } else {
        game.isTie = true;
      }

      // Determine if it's a blowout or close game
      game.isBlowout = game.pointDifferential >= 30;
      game.isClose = game.pointDifferential <= 5;
    }
    
    return game;
  }

  updateGameScore(seasonId, gameId, team1Score, team2Score) {
    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const gameIndex = season.schedule.findIndex(game => game.id === gameId);
    if (gameIndex === -1) {
      throw new Error('Game not found');
    }

    const game = season.schedule[gameIndex];
    game.team1Score = team1Score;
    game.team2Score = team2Score;
    season.schedule[gameIndex] = this.completeGame(game);

    this.saveToStorage();
    return season.schedule[gameIndex];
  }

  // Week management
  completeWeek(seasonId, weekNumber) {
    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const week = season.weeks.find(w => w.weekNumber === weekNumber);
    if (!week) {
      throw new Error('Week not found');
    }

    const weekGames = season.schedule.filter(game => game.week === weekNumber);
    const allGamesCompleted = weekGames.every(game => game.isCompleted);

    if (allGamesCompleted && weekGames.length > 0) {
      week.isCompleted = true;
      week.completedAt = new Date().toISOString();
      
      // Calculate week stats
      const scores = [];
      weekGames.forEach(game => {
        scores.push(game.team1Score, game.team2Score);
      });

      week.weeklyStats = {
        highestScore: {
          teamId: this.getTeamIdForScore(weekGames, Math.max(...scores)),
          score: Math.max(...scores)
        },
        lowestScore: {
          teamId: this.getTeamIdForScore(weekGames, Math.min(...scores)),
          score: Math.min(...scores)
        },
        averageScore: scores.reduce((sum, score) => sum + score, 0) / scores.length,
        totalPoints: scores.reduce((sum, score) => sum + score, 0),
        blowouts: weekGames.filter(game => game.isBlowout).length,
        upsets: 0 // Would need current rankings to calculate
      };
    }

    this.saveToStorage();
    return week;
  }

  getTeamIdForScore(games, targetScore) {
    for (const game of games) {
      if (game.team1Score === targetScore) return game.team1Id;
      if (game.team2Score === targetScore) return game.team2Id;
    }
    return null;
  }

  // Schedule generation
  generateRoundRobinSchedule(seasonId) {
    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    const teams = season.teams;
    const schedule = [];
    const teamCount = teams.length;
    
    if (teamCount % 2 !== 0) {
      throw new Error('Round robin requires even number of teams');
    }

    const rounds = teamCount - 1;
    const matchesPerRound = teamCount / 2;
    let week = 1;

    for (let round = 0; round < rounds && week <= season.regularSeasonWeeks; round++) {
      for (let match = 0; match < matchesPerRound; match++) {
        let team1Index, team2Index;
        
        if (match === 0) {
          team1Index = 0;
          team2Index = round + 1;
        } else {
          team1Index = (round - match + teamCount) % (teamCount - 1) + 1;
          team2Index = (round + match) % (teamCount - 1) + 1;
        }

        const team1 = teams[team1Index];
        const team2 = teams[team2Index];
        
        if (team1 && team2) {
          const game = createGame(week, team1.id, team2.id);
          schedule.push(game);
        }
      }
      week++;
    }

    season.schedule = schedule;
    this.saveToStorage();
    return schedule;
  }

  // Analytics helpers
  getCurrentWeek(seasonId) {
    const season = this.seasons.get(seasonId);
    if (!season) return 1;

    const completedWeeks = season.weeks.filter(week => week.isCompleted);
    return Math.min(completedWeeks.length + 1, season.totalWeeks);
  }

  getGamesForWeek(seasonId, weekNumber) {
    const season = this.seasons.get(seasonId);
    if (!season) return [];

    return season.schedule.filter(game => game.week === weekNumber);
  }

  getCompletedGames(seasonId, upToWeek = null) {
    const season = this.seasons.get(seasonId);
    if (!season) return [];

    return season.schedule.filter(game => 
      game.isCompleted && 
      (upToWeek === null || game.week <= upToWeek)
    );
  }

  // Data export/import
  exportSeasonData(seasonId) {
    const season = this.seasons.get(seasonId);
    if (!season) {
      throw new Error('Season not found');
    }

    return {
      season,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
  }

  importSeasonData(data) {
    if (!data.season || !validateSeason(data.season)) {
      throw new Error('Invalid season data for import');
    }

    const seasonId = data.season.id;
    this.seasons.set(seasonId, data.season);
    this.saveToStorage();
    return seasonId;
  }
}