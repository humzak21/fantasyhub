/**
 * The live snapshot laid over what the app already reads.
 *
 * Pure. **The precedence is official → live → projected,** and this is the one
 * place it is decided: a score in `games` always wins, then the snapshot, and a
 * projection fills what is left. Nothing here writes, and nothing here sets a
 * game's own score fields, because `team1Score` is what every surface takes to
 * mean a result. A live score travels on `game.live`.
 */

import { getNFLTeamAbbreviation, mapESPNInjuryStatus, mapESPNRosterSlot } from '../services/db/espnMapping.js';
import { GAME_STATE } from '../services/espnLiveScoreMapper.js';
import { isRefreshableWeek, nflGameOf } from '../services/liveScores.js';

const key = (id) => (id == null ? null : String(id));

const isOfficial = (game) => game.team1Score != null && game.team2Score != null;

/**
 * Is there anything to overlay on this week? Never for history: only this week
 * or last week (which reads the snapshot until Tuesday's sync lands), and only
 * while one of its games still has no score.
 */
export function canBeLive({ week, actualWeek, games }) {
  if (!week || actualWeek == null || !games) return false;
  if (!isRefreshableWeek(week, actualWeek)) return false;

  return games.some((game) => game.week === week && game.type !== 'bye' && !isOfficial(game));
}

/**
 * The snapshot, in this league's ids. ESPN's team and matchup ids stop here.
 *
 * Matchups find their game by `espn_matchup_id`, then by the same pair of teams
 * (a row created before ESPN ids were stored). A game with a score drops out,
 * lineup and all, which is the official half of the precedence: its rows are
 * the sync's from then on.
 *
 * @param {object|null} raw what `getLiveWeek` returned
 * @param {{ teams?: Array, games?: Array, week: number }} league
 * @returns {null | {
 *   games: Object<string, { team1: object|null, team2: object|null, espnWinner: string|null }>,
 *   lineups: Object<string, Array>,
 *   nflGames: object,
 *   live: boolean,
 *   refreshedAt: string
 * }} null until something has been stored, so a caller has one thing to check
 */
export function joinLiveWeek(raw, { teams = [], games = [], week } = {}) {
  if (!raw?.refreshedAt) return null;

  const teamIdByEspnId = new Map(
    (teams ?? []).map((team) => [key(team.espnTeamId ?? team.espn_team_id), team.id])
  );
  const weekGames = (games ?? []).filter((game) => game.week === week);

  const byGameId = {};
  const officialTeams = new Set();

  for (const game of weekGames) {
    if (isOfficial(game)) officialTeams.add(game.team1Id).add(game.team2Id);
  }

  for (const matchup of raw.matchups ?? []) {
    const homeId = teamIdByEspnId.get(key(matchup.home?.espnTeamId)) ?? null;
    const awayId = teamIdByEspnId.get(key(matchup.away?.espnTeamId)) ?? null;

    const game =
      weekGames.find((g) => key(g.espn_matchup_id) === key(matchup.espnMatchupId)) ??
      weekGames.find(
        (g) =>
          (g.team1Id === homeId && g.team2Id === awayId) ||
          (g.team1Id === awayId && g.team2Id === homeId)
      );

    if (!game || isOfficial(game)) continue;

    const sideOf = (teamId) => {
      if (teamId === homeId) return matchup.home;
      if (teamId === awayId) return matchup.away;
      return null;
    };

    byGameId[game.id] = {
      team1: sideOf(game.team1Id),
      team2: sideOf(game.team2Id),
      espnWinner: matchup.espnWinner ?? null
    };
  }

  const lineups = {};
  for (const [espnTeamId, entries] of Object.entries(raw.lineups ?? {})) {
    const teamId = teamIdByEspnId.get(espnTeamId);
    if (teamId != null && !officialTeams.has(teamId)) lineups[teamId] = entries;
  }

  return {
    games: byGameId,
    lineups,
    nflGames: raw.nflGames ?? {},
    live: Boolean(raw.live),
    refreshedAt: raw.refreshedAt
  };
}

/**
 * A game with its live side attached, as `game.live` (`{ team1, team2 }`), or
 * `null` when there is none. Its own score fields are untouched on purpose.
 */
export function overlayGame(game, live) {
  return { ...game, live: live?.games?.[game.id] ?? null };
}

/** A player's NFL game state. An empty slate is unknown, not a league of byes. */
function nflStateOf(proTeamId, nflGames) {
  if (Object.keys(nflGames).length === 0) return null;
  return nflGameOf(proTeamId, nflGames)?.state ?? GAME_STATE.NO_GAME;
}

/** One team: whichever lineup was read last, with the snapshot's points on it. */
function overlayTeam(rows, entries, { nflGames, refreshedAt }) {
  const rowsById = new Map(rows.map((row) => [key(row.espnPlayerId), row]));
  const entriesById = new Map(entries.map((entry) => [key(entry.espnPlayerId), entry]));

  // Membership and slots belong to whichever read is newer, so the lineup a
  // manager changes at 12:55 shows from the first refresh after it, and a
  // Thursday snapshot cannot stand over Friday's waivers. Points are the
  // snapshot's either way: nothing else has them.
  const rosterReadAt = Math.max(0, ...rows.map((row) => Date.parse(row.updatedAt) || 0));
  const snapshotIsNewer = Date.parse(refreshedAt) > rosterReadAt;

  const points = (row, entry) => {
    const proTeamId = entry?.proTeamId ?? row?.proTeamId ?? null;
    return {
      proTeamId,
      actualPoints: entry?.actualPoints ?? row?.actualPoints ?? null,
      projectedPoints: entry?.projectedPoints ?? row?.projectedPoints ?? null,
      nflState: nflStateOf(proTeamId, nflGames)
    };
  };

  if (!snapshotIsNewer) {
    return rows.map((row) => ({ ...row, ...points(row, entriesById.get(key(row.espnPlayerId))) }));
  }

  return entries.map((entry) => {
    const row = rowsById.get(key(entry.espnPlayerId));

    return {
      ...row,
      id: row?.id ?? `live-${entry.espnPlayerId}`,
      espnPlayerId: entry.espnPlayerId,
      rosterSlot: mapESPNRosterSlot(entry.lineupSlotId),
      started: entry.started,
      position: entry.position ?? row?.position ?? null,
      injuryStatus: mapESPNInjuryStatus(entry.injuryStatus),
      // A Sunday-noon pickup has no `players` row until the next sync.
      player: row?.player ?? {
        name: entry.playerName,
        position: entry.position,
        teamAbbreviation: getNFLTeamAbbreviation(entry.proTeamId),
        proTeamId: entry.proTeamId
      },
      ...points(row, entry)
    };
  });
}

/**
 * Lineup rows with the live week laid over them.
 *
 * Rows come back as they went in, for a team the snapshot has nothing on, or
 * with no snapshot at all, so every surface still renders from this.
 *
 * @param {Object<string, Array>|undefined} rowsByTeam `{ [teamId]: rows }`
 * @param {object|null} live from `joinLiveWeek`
 */
export function overlayLineups(rowsByTeam, live) {
  if (!rowsByTeam || !live) return rowsByTeam;

  const overlaid = { ...rowsByTeam };
  for (const [teamId, entries] of Object.entries(live.lineups)) {
    overlaid[teamId] = overlayTeam(rowsByTeam[teamId] ?? [], entries, live);
  }
  return overlaid;
}
