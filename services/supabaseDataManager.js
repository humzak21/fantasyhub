/**
 * `SupabaseDataManager` — now a facade.
 *
 * This file used to be 4,132 lines and roughly a hundred methods covering
 * seasons, teams, rosters, ESPN sync, divisions, games, weeks, power rankings,
 * schedule imports, pick'ems, transactions, awards and playoffs. Every feature
 * change touched it and none of it could be tested in isolation.
 *
 * The implementations now live in `services/db/`, one module per domain. What
 * remains here is delegation: the class keeps its exact public API so the
 * components, hooks, scripts and services that construct a `SupabaseDataManager`
 * keep working unchanged, and it keeps ownership of the two things that were
 * genuinely instance state — the client and the season cache — which it hands
 * to the domain modules as a context object.
 *
 * New code should use `services/db` directly:
 *
 *     import { getDb } from './services/db/index.js';
 *     const db = getDb();
 *     await db.awards.getAwards(seasonId);
 *
 * This class is expected to disappear once the UI layer (§6) stops holding a
 * data-manager instance.
 */

import { resolveClient, isAdminClient } from './db/client.js';
import { createContext } from './db/context.js';
import { throwDbError } from './db/errors.js';

import * as awards from './db/awards.js';
import * as divisions from './db/divisions.js';
import * as espnMapping from './db/espnMapping.js';
import * as games from './db/games.js';
import * as pickems from './db/pickems.js';
import * as players from './db/players.js';
import * as playoffs from './db/playoffs.js';
import * as rankings from './db/rankings.js';
import * as rosters from './db/rosters.js';
import * as schedule from './db/schedule.js';
import * as seasons from './db/seasons.js';
import * as teams from './db/teams.js';
import * as transactions from './db/transactions.js';
import * as users from './db/users.js';

export class SupabaseDataManager {
  /** Shared with every domain module: { client, seasonsCache, activeSeasonId }. */
  #ctx = createContext(null);

  constructor() {
    this._initialized = false;
    this.isAdminMode = false;
    this.isAuthenticated = false;
  }

  /**
   * Idempotent. Resolves the client — service-role in Node, anon in the
   * browser — records whether a user is signed in, and confirms the schema is
   * reachable. Callers still invoke it directly, and every method below awaits
   * it, so ordering is not something a caller has to think about.
   */
  async initialize() {
    if (this._initialized) return;

    try {
      if (!this.#ctx.client) {
        this.#ctx.client = resolveClient();
        this.isAdminMode = isAdminClient();
      }

      if (!this.isAdminMode) {
        // Read-only access is allowed for signed-out visitors, so a missing
        // user is recorded, not thrown.
        const { data: { user }, error } = await this.#ctx.client.auth.getUser();
        this.isAuthenticated = !!(user && !error);
      } else {
        this.isAuthenticated = true;
      }

      const { error: tableError } = await this.#ctx.client
        .from('seasons')
        .select('count', { count: 'exact', head: true });

      if (tableError) {
        if (tableError.code === '42P01') {
          throw new Error('Database tables not found. Please run the database migration.');
        }
        throw tableError;
      }

      this._initialized = true;
    } catch (error) {
      throwDbError(error, 'Initialization');
    }
  }

  /**
   * The raw supabase-js client. Still exposed because scripts and a few
   * components reach through it for one-off queries; each of those is a
   * candidate for a domain-module function instead.
   */
  get client() {
    return this.#ctx.client;
  }

  set client(client) {
    this.#ctx.client = client;
  }

  /** seasonId → hydrated season. Shared with the domain modules. */
  get seasonsCache() {
    return this.#ctx.seasonsCache;
  }

  get activeSeasonId() {
    return this.#ctx.activeSeasonId;
  }

  set activeSeasonId(seasonId) {
    this.#ctx.activeSeasonId = seasonId;
  }

  /** The context to hand to `getDb(ctx)` when mixing this class with `services/db`. */
  get context() {
    return this.#ctx;
  }

  // ------------------------------------------------------------------------
  // Seasons
  // ------------------------------------------------------------------------

  async createSeason(year, name = '', leagueSize = 14, regularSeasonWeeks = 14, playoffWeeks = 3) {
    await this.initialize();
    return seasons.createSeason(this.#ctx, year, name, leagueSize, regularSeasonWeeks, playoffWeeks);
  }

  async getSeason(seasonId) {
    await this.initialize();
    return seasons.getSeason(this.#ctx, seasonId);
  }

  async getAllSeasons() {
    await this.initialize();
    return seasons.getAllSeasons(this.#ctx);
  }

  async setActiveSeason(seasonId) {
    await this.initialize();
    return seasons.setActiveSeason(this.#ctx, seasonId);
  }

  async getActiveSeason() {
    await this.initialize();
    return seasons.getActiveSeason(this.#ctx);
  }

  async deleteSeason(seasonId) {
    await this.initialize();
    return seasons.deleteSeason(this.#ctx, seasonId);
  }

  async resolveSeasonYear(seasonYear) {
    await this.initialize();
    return seasons.resolveSeasonYear(this.#ctx, seasonYear);
  }

  async exportSeasonData(seasonId) {
    await this.initialize();
    return seasons.exportSeasonData(this.#ctx, seasonId);
  }

  // ------------------------------------------------------------------------
  // Divisions
  // ------------------------------------------------------------------------

  async getDivisions(seasonId) {
    await this.initialize();
    return divisions.getDivisions(this.#ctx, seasonId);
  }

  async getDivisionsForSeason(seasonId) {
    await this.initialize();
    return divisions.getDivisionsForSeason(this.#ctx, seasonId);
  }

  async createDivision(seasonId, name, displayOrder = 1) {
    await this.initialize();
    return divisions.createDivision(this.#ctx, seasonId, name, displayOrder);
  }

  async updateDivision(divisionId, updates) {
    await this.initialize();
    return divisions.updateDivision(this.#ctx, divisionId, updates);
  }

  async deleteDivision(divisionId) {
    await this.initialize();
    return divisions.deleteDivision(this.#ctx, divisionId);
  }

  async assignTeamToDivision(teamId, divisionId) {
    await this.initialize();
    return divisions.assignTeamToDivision(this.#ctx, teamId, divisionId);
  }

  async getStandingsByDivision(seasonId) {
    await this.initialize();
    return divisions.getStandingsByDivision(this.#ctx, seasonId);
  }

  // ------------------------------------------------------------------------
  // Teams
  // ------------------------------------------------------------------------

  async getTeamsForSeason(seasonId) {
    await this.initialize();
    return teams.getTeamsForSeason(this.#ctx, seasonId);
  }

  async addTeamToSeason(seasonId, name, owner = '') {
    await this.initialize();
    return teams.addTeamToSeason(this.#ctx, seasonId, name, owner);
  }

  async updateTeam(seasonId, teamId, updates) {
    await this.initialize();
    return teams.updateTeam(this.#ctx, seasonId, teamId, updates);
  }

  async removeTeamFromSeason(seasonId, teamId) {
    await this.initialize();
    return teams.removeTeamFromSeason(this.#ctx, seasonId, teamId);
  }

  // ------------------------------------------------------------------------
  // Rosters
  // ------------------------------------------------------------------------

  async syncTeamRosterFromESPN(teamId, rosterData, currentWeek = 1) {
    await this.initialize();
    return rosters.syncTeamRosterFromESPN(this.#ctx, teamId, rosterData, currentWeek);
  }

  async manualSyncTeamRoster(teamId, userId, rosterData, currentWeek = 1) {
    await this.initialize();
    return rosters.manualSyncTeamRoster(this.#ctx, teamId, userId, rosterData, currentWeek);
  }

  async fallbackRosterInsert(rosterEntries) {
    return rosters.fallbackRosterInsert(this.#ctx, rosterEntries);
  }

  async insertRosterOneByOne(rosterEntries) {
    return rosters.insertRosterOneByOne(this.#ctx, rosterEntries);
  }

  async getTeamRoster(teamId) {
    await this.initialize();
    return rosters.getTeamRoster(this.#ctx, teamId);
  }

  async getAllRosters(seasonId) {
    await this.initialize();
    return rosters.getAllRosters(this.#ctx, seasonId);
  }

  async getRosterStats(seasonId) {
    await this.initialize();
    return rosters.getRosterStats(this.#ctx, seasonId);
  }

  // ------------------------------------------------------------------------
  // Players
  // ------------------------------------------------------------------------

  async syncPlayerFromESPN(espnPlayerId, name, position, nflTeam, playerStats = {}) {
    await this.initialize();
    return players.syncPlayerFromESPN(this.#ctx, espnPlayerId, name, position, nflTeam, playerStats);
  }

  async getAllPlayers(seasonId = null) {
    await this.initialize();
    return players.getAllPlayers(this.#ctx, seasonId);
  }

  // ------------------------------------------------------------------------
  // ESPN value mapping (pure)
  // ------------------------------------------------------------------------

  mapESPNInjuryStatus(espnInjuryStatus) {
    return espnMapping.mapESPNInjuryStatus(espnInjuryStatus);
  }

  getNFLTeamAbbreviation(proTeamId) {
    return espnMapping.getNFLTeamAbbreviation(proTeamId);
  }

  mapESPNRosterSlot(espnSlot) {
    return espnMapping.mapESPNRosterSlot(espnSlot);
  }

  // ------------------------------------------------------------------------
  // Games and weeks
  // ------------------------------------------------------------------------

  async getSeasonGames(seasonId) {
    await this.initialize();
    return games.getSeasonGames(this.#ctx, seasonId);
  }

  async addGame(seasonId, week, team1Id, team2Id, team1Score = null, team2Score = null, type = 'regular') {
    await this.initialize();
    return games.addGame(this.#ctx, seasonId, week, team1Id, team2Id, team1Score, team2Score, type);
  }

  async updateGameScore(seasonId, gameId, team1Score, team2Score) {
    await this.initialize();
    return games.updateGameScore(this.#ctx, seasonId, gameId, team1Score, team2Score);
  }

  async completeWeek(seasonId, weekNumber) {
    await this.initialize();
    return games.completeWeek(this.#ctx, seasonId, weekNumber);
  }

  async getCurrentWeek(seasonId) {
    await this.initialize();
    return games.getCurrentWeek(this.#ctx, seasonId);
  }

  async getLastCompletedWeek(seasonId) {
    await this.initialize();
    return games.getLastCompletedWeek(this.#ctx, seasonId);
  }

  async getCompletedWeeks(seasonId) {
    await this.initialize();
    return games.getCompletedWeeks(this.#ctx, seasonId);
  }

  async getGamesForWeek(seasonId, weekNumber) {
    await this.initialize();
    return games.getGamesForWeek(this.#ctx, seasonId, weekNumber);
  }

  async getCompletedGames(seasonId, upToWeek = null) {
    await this.initialize();
    return games.getCompletedGames(this.#ctx, seasonId, upToWeek);
  }

  async generateRoundRobinSchedule(seasonId) {
    await this.initialize();
    return games.generateRoundRobinSchedule(this.#ctx, seasonId);
  }

  // ------------------------------------------------------------------------
  // Power rankings
  // ------------------------------------------------------------------------

  async calculateRankingsForViewedWeek(seasonId, options) {
    await this.initialize();
    return rankings.calculateRankingsForViewedWeek(this.#ctx, seasonId, options);
  }

  async calculatePowerRankings(seasonId, weekNumber = null) {
    await this.initialize();
    return rankings.calculatePowerRankings(this.#ctx, seasonId, weekNumber);
  }

  async calculateLivePowerRankings(seasonId, weekNumber = null, skipPreviousWeekLookup = false) {
    await this.initialize();
    return rankings.calculateLivePowerRankings(this.#ctx, seasonId, weekNumber, skipPreviousWeekLookup);
  }

  async getPowerRankingsForWeek(seasonId, weekNumber) {
    await this.initialize();
    return rankings.getPowerRankingsForWeek(this.#ctx, seasonId, weekNumber);
  }

  async getPowerRankingsHistory(seasonId, weekNumber = null) {
    await this.initialize();
    return rankings.getPowerRankingsHistory(this.#ctx, seasonId, weekNumber);
  }

  async saveWeeklyPowerRankingsSnapshot(seasonId, weekNumber, snapshotType = 'weekly') {
    await this.initialize();
    return rankings.saveWeeklyPowerRankingsSnapshot(this.#ctx, seasonId, weekNumber, snapshotType);
  }

  async checkWeeklySnapshotStatus(seasonYear) {
    await this.initialize();
    return rankings.checkWeeklySnapshotStatus(this.#ctx, seasonYear);
  }

  async executeWeeklySnapshotIfNeeded(seasonYear) {
    await this.initialize();
    return rankings.executeWeeklySnapshotIfNeeded(this.#ctx, seasonYear);
  }

  async getCurrentNFLWeek(seasonYear) {
    await this.initialize();
    return rankings.getCurrentNFLWeek(this.#ctx, seasonYear);
  }

  async getAvailableSnapshotWeeks(seasonId) {
    await this.initialize();
    return rankings.getAvailableSnapshotWeeks(this.#ctx, seasonId);
  }

  // ------------------------------------------------------------------------
  // ESPN schedule imports
  // ------------------------------------------------------------------------

  async getPendingScheduleImports() {
    await this.initialize();
    return schedule.getPendingScheduleImports(this.#ctx);
  }

  async assignScheduleToSeason(importId, seasonId, notes = null) {
    await this.initialize();
    return schedule.assignScheduleToSeason(this.#ctx, importId, seasonId, notes);
  }

  async importTeamsFromESPNImport(importId, seasonId) {
    await this.initialize();
    return schedule.importTeamsFromESPNImport(this.#ctx, importId, seasonId);
  }

  async manualAssignScheduleToSeason(importId, seasonId, notes = null) {
    await this.initialize();
    return schedule.manualAssignScheduleToSeason(this.#ctx, importId, seasonId, notes);
  }

  async getScheduleImportDetails(importId) {
    await this.initialize();
    return schedule.getScheduleImportDetails(this.#ctx, importId);
  }

  async getAssignedSchedules(seasonId) {
    await this.initialize();
    return schedule.getAssignedSchedules(this.#ctx, seasonId);
  }

  async rejectScheduleImport(importId, notes = null) {
    await this.initialize();
    return schedule.rejectScheduleImport(this.#ctx, importId, notes);
  }

  // ------------------------------------------------------------------------
  // Pick'ems
  // ------------------------------------------------------------------------

  async createPickEmWeek(seasonId, weekNumber, customSchedule = null) {
    await this.initialize();
    return pickems.createPickEmWeek(this.#ctx, seasonId, weekNumber, customSchedule);
  }

  async getPickEmWeek(seasonId, weekNumber) {
    await this.initialize();
    return pickems.getPickEmWeek(this.#ctx, seasonId, weekNumber);
  }

  async getAllPickEmWeeks(seasonId) {
    await this.initialize();
    return pickems.getAllPickEmWeeks(this.#ctx, seasonId);
  }

  async getPickEmStatus(seasonId) {
    await this.initialize();
    return pickems.getPickEmStatus(this.#ctx, seasonId);
  }

  async submitPickEmPicks(pickEmWeekId, picks) {
    await this.initialize();
    return pickems.submitPickEmPicks(this.#ctx, pickEmWeekId, picks);
  }

  async getUserPicksForWeek(pickEmWeekId, userId = null) {
    await this.initialize();
    return pickems.getUserPicksForWeek(this.#ctx, pickEmWeekId, userId);
  }

  async getAllPicksForWeek(pickEmWeekId) {
    await this.initialize();
    return pickems.getAllPicksForWeek(this.#ctx, pickEmWeekId);
  }

  async getAdminSubmissionsForWeek(pickEmWeekId) {
    await this.initialize();
    return pickems.getAdminSubmissionsForWeek(this.#ctx, pickEmWeekId);
  }

  async calculatePickEmResults(pickEmWeekId) {
    await this.initialize();
    return pickems.calculatePickEmResults(this.#ctx, pickEmWeekId);
  }

  async getWeeklyPickEmScores(pickEmWeekId) {
    await this.initialize();
    return pickems.getWeeklyPickEmScores(this.#ctx, pickEmWeekId);
  }

  async getSeasonPickEmStandings(seasonId) {
    await this.initialize();
    return pickems.getSeasonPickEmStandings(this.#ctx, seasonId);
  }

  async getAllSeasonPicks(seasonId) {
    await this.initialize();
    return pickems.getAllSeasonPicks(this.#ctx, seasonId);
  }

  async getPickEmWeeklyBreakdown(seasonId) {
    await this.initialize();
    return pickems.getPickEmWeeklyBreakdown(this.#ctx, seasonId);
  }

  async getPickEmGameData(seasonId, weekNumber) {
    await this.initialize();
    return pickems.getPickEmGameData(this.#ctx, seasonId, weekNumber);
  }

  async createPickEmWeeksForSeason(seasonId, startWeek = 1, endWeek = null) {
    await this.initialize();
    return pickems.createPickEmWeeksForSeason(this.#ctx, seasonId, startWeek, endWeek);
  }

  async updatePickEmWeekStatus(pickEmWeekId, status) {
    await this.initialize();
    return pickems.updatePickEmWeekStatus(this.#ctx, pickEmWeekId, status);
  }

  // ------------------------------------------------------------------------
  // Users
  // ------------------------------------------------------------------------

  async getUserDisplayNames(userIds) {
    return users.getUserDisplayNames(this.#ctx, userIds);
  }

  // ------------------------------------------------------------------------
  // Transactions
  // ------------------------------------------------------------------------

  async getTransactionLeaderboard() {
    await this.initialize();
    return transactions.getTransactionLeaderboard(this.#ctx);
  }

  async getTransactionLeaderboardFallback() {
    return transactions.getTransactionLeaderboardFallback(this.#ctx);
  }

  async getFranchiseTransactionHistory(franchiseId) {
    await this.initialize();
    return transactions.getFranchiseTransactionHistory(this.#ctx, franchiseId);
  }

  async getSeasonTransactions(seasonId) {
    await this.initialize();
    return transactions.getSeasonTransactions(this.#ctx, seasonId);
  }

  async upsertTeamTransaction(transactionData) {
    await this.initialize();
    return transactions.upsertTeamTransaction(this.#ctx, transactionData);
  }

  async refreshTransactionViews() {
    await this.initialize();
    return transactions.refreshTransactionViews(this.#ctx);
  }

  async getCurrentSeasonTransactions() {
    await this.initialize();
    return transactions.getCurrentSeasonTransactions(this.#ctx);
  }

  async getCurrentSeasonTransactionsByOwner(ownerName) {
    await this.initialize();
    return transactions.getCurrentSeasonTransactionsByOwner(this.#ctx, ownerName);
  }

  // ------------------------------------------------------------------------
  // Awards
  // ------------------------------------------------------------------------

  async getAwards(seasonId) {
    await this.initialize();
    return awards.getAwards(this.#ctx, seasonId);
  }

  async createAward(seasonId, awardData) {
    await this.initialize();
    return awards.createAward(this.#ctx, seasonId, awardData);
  }

  async updateAward(awardId, updates) {
    await this.initialize();
    return awards.updateAward(this.#ctx, awardId, updates);
  }

  async deleteAward(awardId) {
    await this.initialize();
    return awards.deleteAward(this.#ctx, awardId);
  }

  async getUserVotes(seasonId, userId) {
    await this.initialize();
    return awards.getUserVotes(this.#ctx, seasonId, userId);
  }

  async submitAwardVotes(seasonId, votes) {
    await this.initialize();
    return awards.submitAwardVotes(this.#ctx, seasonId, votes);
  }

  async getAwardsUnlockStatus(seasonId) {
    await this.initialize();
    return awards.getAwardsUnlockStatus(this.#ctx, seasonId);
  }

  async releaseAwardResults(seasonId) {
    await this.initialize();
    return awards.releaseAwardResults(this.#ctx, seasonId);
  }

  async toggleVotingAccess(seasonId, votingOpenToAll) {
    await this.initialize();
    return awards.toggleVotingAccess(this.#ctx, seasonId, votingOpenToAll);
  }

  async getAwardResults(seasonId) {
    await this.initialize();
    return awards.getAwardResults(this.#ctx, seasonId);
  }

  // ------------------------------------------------------------------------
  // Playoffs
  // ------------------------------------------------------------------------

  async getPlayoffBracketConfig(seasonId) {
    await this.initialize();
    return playoffs.getPlayoffBracketConfig(this.#ctx, seasonId);
  }

  async upsertPlayoffBracketConfig(seasonId, configData) {
    await this.initialize();
    return playoffs.upsertPlayoffBracketConfig(this.#ctx, seasonId, configData);
  }

  async getPlayoffGames(seasonId) {
    await this.initialize();
    return playoffs.getPlayoffGames(this.#ctx, seasonId);
  }

  async getUserPlayoffPicks(seasonId, userId = null) {
    await this.initialize();
    return playoffs.getUserPlayoffPicks(this.#ctx, seasonId, userId);
  }

  async submitPlayoffPicks(seasonId, picks) {
    await this.initialize();
    return playoffs.submitPlayoffPicks(this.#ctx, seasonId, picks);
  }

  async getAllPlayoffPicks(seasonId) {
    await this.initialize();
    return playoffs.getAllPlayoffPicks(this.#ctx, seasonId);
  }

  async getPlayoffStandings(seasonId) {
    await this.initialize();
    return playoffs.getPlayoffStandings(this.#ctx, seasonId);
  }

  async getPlayoffBracketStatus(seasonId) {
    await this.initialize();
    return playoffs.getPlayoffBracketStatus(this.#ctx, seasonId);
  }

  async releasePlayoffResults(seasonId) {
    await this.initialize();
    return playoffs.releasePlayoffResults(this.#ctx, seasonId);
  }

  async updateConsolationGameSlots(seasonId, slotAssignments) {
    await this.initialize();
    return playoffs.updateConsolationGameSlots(this.#ctx, seasonId, slotAssignments);
  }

}
