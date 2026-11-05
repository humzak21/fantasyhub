/**
 * The best player game on each side of a rivalry: the starter who scored the
 * most in any meeting of the two franchises.
 *
 * Pure, over `getMatchupHistory`'s meetings (franchise 1 is `team1`, so index
 * 0 below is franchise 1) and `getMatchupStarters`' rows.
 *
 * Which meetings count follows the game being played now. A bracket game
 * looks at the pair's bracket meetings, if they have any; everything else,
 * and a bracket game between two franchises who have never met in the
 * bracket, looks at the regular season. Consolation games are in neither,
 * as in the record book. A pair whose only meetings are outside the chosen
 * phase falls back to every meeting rather than showing nothing.
 */

import { meetingWinner, phaseOf } from '../../src/components/history/headtohead/matchupSummary.js';

/** A bracket game, by `games.type`: `playoff%` but not `playoff_consolation%`. */
export const isBracketType = (type) =>
  typeof type === 'string' && type.startsWith('playoff') && !type.startsWith('playoff_consolation');

/**
 * @param {object[]} meetings from `getMatchupHistory`
 * @param {object[]} starters from `getMatchupStarters`
 * @param {{ gameType?: string|null }} [options] the type of the game being played now
 * @returns {null | { phase: 'playoff'|'regular'|'all', sides: Array<null | {
 *   player: { playerId, espnPlayerId, name, position, proTeamId, proTeam },
 *   points: number, game: object, teamName: string|null,
 *   result: 'W'|'L'|'T', year: number, week: number
 * }> }}
 */
export function bestGames(meetings = [], starters = [], { gameType = null } = {}) {
  const played = meetings.filter(
    (game) => Number.isFinite(game.team1Score) && Number.isFinite(game.team2Score)
  );
  if (played.length === 0) return null;

  const wantsBracket = isBracketType(gameType) && played.some((game) => phaseOf(game) === 'playoff');
  let phase = wantsBracket ? 'playoff' : 'regular';
  let pool = played.filter((game) => phaseOf(game) === phase);
  if (pool.length === 0) {
    phase = 'all';
    pool = played;
  }

  // team id + week is one team-week: team ids are per season.
  const slots = new Map();
  for (const game of pool) {
    slots.set(`${game.team1Id}:${game.week}`, { game, side: 0 });
    slots.set(`${game.team2Id}:${game.week}`, { game, side: 1 });
  }

  const best = [null, null];
  for (const row of starters) {
    if (!Number.isFinite(row.actualPoints)) continue;
    const slot = slots.get(`${row.teamId}:${row.week}`);
    if (!slot) continue;

    const current = best[slot.side];
    // A tie keeps the earlier meeting: the record was set first.
    const earlier =
      current &&
      row.actualPoints === current.points &&
      (slot.game.year - current.game.year || slot.game.week - current.game.week) < 0;
    if (!current || row.actualPoints > current.points || earlier) {
      best[slot.side] = { row, points: row.actualPoints, game: slot.game, side: slot.side };
    }
  }

  if (!best[0] && !best[1]) return null;

  return {
    phase,
    sides: best.map((entry) => {
      if (!entry) return null;
      const { row, game, side } = entry;
      const winner = meetingWinner(game);
      return {
        player: {
          playerId: row.playerId ?? null,
          espnPlayerId: row.espnPlayerId ?? null,
          name: row.name ?? null,
          position: row.position ?? null,
          proTeamId: row.proTeamId ?? null,
          proTeam: row.proTeam ?? null
        },
        points: entry.points,
        game,
        teamName: side === 0 ? game.team1Name : game.team2Name,
        result: winner === null ? 'T' : winner === side ? 'W' : 'L',
        year: game.year,
        week: game.week
      };
    })
  };
}

export default bestGames;
