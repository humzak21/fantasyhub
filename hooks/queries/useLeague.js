/**
 * League data hooks, one query per thing.
 *
 * These replace the fetch half of `useSupabaseFantasyData`, which loaded
 * seasons, the active season, the current week, games, teams, rosters,
 * divisions and standings in a single `refreshData()` — and re-ran the whole
 * thing after every mutation, behind a modal "Loading..." overlay. Here each
 * query owns its own loading and error state, and each mutation invalidates
 * only the keys it actually affected.
 *
 * Everything goes through `services/db/`; nothing in this file talks to
 * Supabase directly.
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb, seasons as seasonsModule, getContext } from '../../services/db/index.js';
import { setSeasonConfig } from '../../utils/seasonConfig.js';
import { qk } from './keys.js';

const db = () => getDb();

/**
 * Season reads are memoised inside `ctx.seasonsCache`, which would otherwise
 * hand a refetch the same stale object it was trying to replace.
 */
const forgetSeasonCache = (seasonId = null) =>
  seasonsModule.forgetSeason(getContext(), seasonId);

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

export function useSeasons() {
  return useQuery({
    queryKey: qk.seasons.list(),
    queryFn: () => db().seasons.getAllSeasons()
  });
}

/**
 * The active season row.
 *
 * Publishing it to `setSeasonConfig` is a side effect on purpose: week math,
 * pick'em windows and the awards gate are read synchronously from that module
 * singleton by ~40 call sites that are not React components. Components should
 * prefer `useSeasonConfig()` below, which does not depend on when this ran.
 */
export function useActiveSeason() {
  return useQuery({
    queryKey: qk.seasons.active(),
    queryFn: async () => {
      // Drop the data layer's own memo first, so a refetch is a real refetch
      // rather than a second look at the object we are trying to replace.
      // TanStack owns caching now; `ctx.seasonsCache` only serves scripts.
      forgetSeasonCache();
      const season = await db().seasons.getActiveSeason();
      setSeasonConfig(season);
      return season ?? null;
    }
  });
}

export function useSeasonTeams(seasonId) {
  return useQuery({
    queryKey: qk.teams.forSeason(seasonId),
    queryFn: () => db().teams.getTeamsForSeason(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function useSeasonGames(seasonId) {
  return useQuery({
    queryKey: qk.games.forSeason(seasonId),
    queryFn: () => db().games.getSeasonGames(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function useDivisions(seasonId) {
  return useQuery({
    queryKey: qk.divisions.forSeason(seasonId),
    queryFn: () => db().divisions.getDivisionsForSeason(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function useStandings(seasonId) {
  return useQuery({
    queryKey: qk.divisions.standings(seasonId),
    queryFn: () => db().divisions.getStandingsByDivision(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function useSeasonRosters(seasonId) {
  return useQuery({
    queryKey: qk.rosters.forSeason(seasonId),
    queryFn: () => db().rosters.getAllRosters(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function useTeamRoster(teamId) {
  return useQuery({
    queryKey: qk.rosters.forTeam(teamId),
    queryFn: () => db().rosters.getTeamRoster(teamId),
    enabled: Boolean(teamId)
  });
}

export function useCompletedWeeks(seasonId) {
  return useQuery({
    queryKey: qk.games.completedWeeks(seasonId),
    queryFn: () => db().games.getCompletedWeeks(seasonId),
    enabled: Boolean(seasonId)
  });
}

export function useGamesForWeek(seasonId, week) {
  return useQuery({
    queryKey: qk.games.forWeek(seasonId, week),
    queryFn: () => db().games.getGamesForWeek(seasonId, week),
    enabled: Boolean(seasonId) && Boolean(week)
  });
}

// ---------------------------------------------------------------------------
// The composite both app shells need
// ---------------------------------------------------------------------------

/**
 * The active season with its teams and schedule attached.
 *
 * The old hook built this by mutating the cached season object in place
 * (`active.schedule = games`), which meant every consumer of that same cached
 * object saw the mutation. Here the composition is a fresh object derived from
 * three independent queries, so a games refetch does not silently rewrite a
 * season someone else is holding.
 *
 * @returns {{
 *   activeSeason: Object|null,
 *   divisions: Array,
 *   standings: Object,
 *   rosters: Object,
 *   completedWeeks: Array<number>,
 *   isLoading: boolean,
 *   isFetching: boolean,
 *   error: Error|null
 * }}
 */
export function useLeagueData() {
  const seasonQuery = useActiveSeason();
  const seasonId = seasonQuery.data?.id ?? null;

  const teamsQuery = useSeasonTeams(seasonId);
  const gamesQuery = useSeasonGames(seasonId);
  const divisionsQuery = useDivisions(seasonId);
  const standingsQuery = useStandings(seasonId);
  const rostersQuery = useSeasonRosters(seasonId);
  const completedWeeksQuery = useCompletedWeeks(seasonId);

  const activeSeason = useMemo(() => {
    if (!seasonQuery.data) return null;
    return {
      ...seasonQuery.data,
      teams: teamsQuery.data ?? seasonQuery.data.teams ?? [],
      schedule: gamesQuery.data ?? []
    };
  }, [seasonQuery.data, teamsQuery.data, gamesQuery.data]);

  const queries = [
    seasonQuery,
    teamsQuery,
    gamesQuery,
    divisionsQuery,
    standingsQuery,
    rostersQuery,
    completedWeeksQuery
  ];

  return {
    activeSeason,
    divisions: divisionsQuery.data ?? [],
    standings: standingsQuery.data ?? { divisions: [], unassigned: [] },
    rosters: rostersQuery.data ?? {},
    completedWeeks: completedWeeksQuery.data ?? [],

    // The season gates everything else, so "loading" means the season itself is
    // still in flight — not "some widget is refreshing". That distinction is
    // what removes the full-screen overlay.
    isLoading: seasonQuery.isLoading,
    isFetching: queries.some((query) => query.isFetching),
    error: queries.find((query) => query.error)?.error ?? null
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Invalidation helpers. Each mutation names the domains it touched; nothing
 * refetches the whole league.
 */
function useInvalidators() {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const invalidate = (queryKey) => queryClient.invalidateQueries({ queryKey });

    return {
      /** Season row itself changed (created, activated, deleted). */
      seasons: async () => {
        forgetSeasonCache();
        await Promise.all([invalidate(qk.seasons.all), invalidate(qk.teams.all)]);
      },
      /** Roster of teams changed: standings and rankings depend on it. */
      teams: (seasonId) =>
        Promise.all([
          invalidate(qk.teams.forSeason(seasonId)),
          invalidate(qk.divisions.standings(seasonId)),
          invalidate(qk.rankings.season(seasonId))
        ]),
      divisions: (seasonId) =>
        Promise.all([
          invalidate(qk.divisions.forSeason(seasonId)),
          invalidate(qk.divisions.standings(seasonId))
        ]),
      /** A score moved: games, standings and every ranking derived from them. */
      games: (seasonId) =>
        Promise.all([
          invalidate(qk.games.season(seasonId)),
          invalidate(qk.divisions.standings(seasonId)),
          invalidate(qk.rankings.season(seasonId))
        ]),
      // `qk.rosters.all`, not the per-season key: single-team roster queries
      // are keyed by team id and would not match a season prefix.
      rosters: (seasonId) =>
        Promise.all([invalidate(qk.rosters.all), invalidate(qk.rankings.season(seasonId))]),
      schedule: () => invalidate(qk.schedule.all)
    };
  }, [queryClient]);
}

/** Mutations scoped to a season, ready to hand to admin components. */
export function useLeagueMutations(seasonId) {
  const invalidators = useInvalidators();

  const createSeason = useMutation({
    mutationFn: ({ year, name, leagueSize, regularSeasonWeeks, playoffWeeks }) =>
      db().seasons.createSeason(year, name, leagueSize, regularSeasonWeeks, playoffWeeks),
    onSuccess: invalidators.seasons
  });

  const setActiveSeason = useMutation({
    mutationFn: (id) => db().seasons.setActiveSeason(id),
    onSuccess: invalidators.seasons
  });

  const deleteSeason = useMutation({
    mutationFn: (id) => db().seasons.deleteSeason(id),
    onSuccess: invalidators.seasons
  });

  const addTeam = useMutation({
    mutationFn: ({ name, owner = '' }) => db().teams.addTeamToSeason(seasonId, name, owner),
    onSuccess: () => invalidators.teams(seasonId)
  });

  const updateTeam = useMutation({
    mutationFn: ({ teamId, updates }) => db().teams.updateTeam(seasonId, teamId, updates),
    onSuccess: () => invalidators.teams(seasonId)
  });

  const removeTeam = useMutation({
    mutationFn: (teamId) => db().teams.removeTeamFromSeason(seasonId, teamId),
    onSuccess: () => invalidators.teams(seasonId)
  });

  const createDivision = useMutation({
    mutationFn: ({ name, displayOrder = 1 }) =>
      db().divisions.createDivision(seasonId, name, displayOrder),
    onSuccess: () => invalidators.divisions(seasonId)
  });

  const renameDivision = useMutation({
    mutationFn: ({ divisionId, name }) => db().divisions.updateDivision(divisionId, { name }),
    onSuccess: () => invalidators.divisions(seasonId)
  });

  const deleteDivision = useMutation({
    mutationFn: (divisionId) => db().divisions.deleteDivision(divisionId),
    onSuccess: () => invalidators.divisions(seasonId)
  });

  const assignTeamToDivision = useMutation({
    mutationFn: ({ teamId, divisionId }) =>
      db().divisions.assignTeamToDivision(teamId, divisionId),
    onSuccess: () =>
      Promise.all([invalidators.divisions(seasonId), invalidators.teams(seasonId)])
  });

  const addGame = useMutation({
    mutationFn: ({ week, team1Id, team2Id, team1Score = null, team2Score = null, type = 'regular' }) =>
      db().games.addGame(seasonId, week, team1Id, team2Id, team1Score, team2Score, type),
    onSuccess: () => invalidators.games(seasonId)
  });

  const updateGameScore = useMutation({
    mutationFn: ({ gameId, team1Score, team2Score }) =>
      db().games.updateGameScore(seasonId, gameId, team1Score, team2Score),
    onSuccess: () => invalidators.games(seasonId)
  });

  /** Write a week's worth of scores, then mark the week complete. */
  const addWeekScores = useMutation({
    mutationFn: async ({ week, scores }) => {
      const games = [];
      for (const matchup of Object.values(scores)) {
        const { team1Id, team2Id, team1Score, team2Score } = matchup;
        games.push(
          await db().games.addGame(seasonId, week, team1Id, team2Id, team1Score, team2Score)
        );
      }
      await db().games.completeWeek(seasonId, week);
      return games;
    },
    onSuccess: () => invalidators.games(seasonId)
  });

  const generateSchedule = useMutation({
    mutationFn: () => db().games.generateRoundRobinSchedule(seasonId),
    onSuccess: () => invalidators.games(seasonId)
  });

  const syncRosterFromESPN = useMutation({
    mutationFn: ({ teamId, rosterData, week }) =>
      db().rosters.syncTeamRosterFromESPN(teamId, rosterData, week),
    onSuccess: () => invalidators.rosters(seasonId)
  });

  return {
    createSeason,
    setActiveSeason,
    deleteSeason,
    addTeam,
    updateTeam,
    removeTeam,
    createDivision,
    renameDivision,
    deleteDivision,
    assignTeamToDivision,
    addGame,
    updateGameScore,
    addWeekScores,
    generateSchedule,
    syncRosterFromESPN
  };
}
