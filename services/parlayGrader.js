/**
 * Grading the weekly TD parlay, as a pure function.
 *
 * The same split as `services/espnGameMapper.js`: this decides, and
 * `services/db/parlay.js::applyParlayGrades` writes. Nothing here touches the
 * network or the database, so every rule below is testable against a literal.
 *
 * It lives in JavaScript rather than in SQL for one reason:
 * `getScoredTouchdownCount` (`services/db/espnMapping.js`) is the single
 * definition of what "scored" means, and a grading RPC would have to restate
 * both `ESPN_STAT_IDS` and the thrown-versus-scored rule in PL/pgSQL. Two
 * definitions of a touchdown is how a quarterback ends up graded as having
 * scored four.
 *
 * ## The direction of failure
 *
 * Every uncertain case **skips**, and a skipped pick stays `NULL` — ungraded,
 * visible as "Pending", and gradable by hand or by the next run. It never
 * grades `false`. That is not caution for its own sake: `scored_td = false`
 * says "this player did not score", and a wrong `false` is invisible to the
 * person it costs, because "no TD" is the common case and nobody audits it.
 * A pick that stays pending, by contrast, is conspicuous.
 *
 * The single exception is an explicit bye, which is not uncertainty at all: a
 * player whose team did not play a game in a week that is over did not score
 * in it. A *missing* schedule row is the uncertain twin and skips — that
 * distinction is the reason `nfl_schedule` stores a row per bye instead of
 * inferring one from a gap.
 */

import { getScoredTouchdownCount } from './db/espnMapping.js';

/**
 * Both lookup tables are flat and keyed by week, because a run grades every
 * elapsed ungraded week at once and a per-week nesting would have every caller
 * re-deriving the same two composite keys. Exported so the caller building the
 * maps and the grader reading them cannot disagree about the shape.
 */
export const statKey = (week, espnPlayerId) => `${week}:${espnPlayerId}`;
export const scheduleKey = (week, proTeamId) => `${week}:${proTeamId}`;

/** Why a pick was left ungraded. Stable strings — they are counted in `sync_runs`. */
export const SKIP_REASONS = {
  FREE_TEXT: 'free-text pick',
  NO_ESPN_ID: 'player has no ESPN id',
  NO_PRO_TEAM: 'player has no NFL team',
  NO_SCHEDULE_ROW: 'no NFL schedule row for that team and week',
  NOT_OFFICIAL: 'stats are not official yet',
  NO_STATS_ROW: 'no stat line for that player and week',
  NO_BREAKDOWN: 'stat line has no category breakdown'
};

/**
 * Grade a batch of picks.
 *
 * @param {object} params
 * @param {object[]} params.picks
 *   Ungraded, player-matched picks — `{ id, week, playerId, playerNameRaw,
 *   player: { espnPlayerId, proTeamId } }`, as `getUngradedMatchedPicks`
 *   returns. Callers pass only weeks that are over.
 * @param {Object<string, object>} params.statsByEspnPlayerId
 *   `player_week_stats` rows keyed by `statKey(week, espnPlayerId)`. Rows
 *   recovered through the kona fallback are merged into this same map, so the
 *   grader cannot tell — and must not care — where a stat line came from.
 * @param {Object<string, object>} params.scheduleByTeam
 *   `nfl_schedule` rows keyed by `scheduleKey(week, proTeamId)`.
 * @returns {{ grades: object[], skipped: object[] }}
 */
export function gradeParlayPicks({
  picks = [],
  statsByEspnPlayerId = {},
  scheduleByTeam = {}
} = {}) {
  const grades = [];
  const skipped = [];

  const skip = (pick, reason, extra = {}) =>
    skipped.push({
      pickId: pick.id,
      week: pick.week,
      player: pick.playerNameRaw ?? null,
      reason,
      ...extra
    });

  for (const pick of picks) {
    // A free-text pick names somebody `players` has never heard of, so there
    // is no id to look a stat line up by. Manual by construction, not by
    // omission.
    if (!pick.playerId) {
      skip(pick, SKIP_REASONS.FREE_TEXT);
      continue;
    }

    const espnPlayerId = pick.player?.espnPlayerId ?? null;
    if (espnPlayerId == null) {
      skip(pick, SKIP_REASONS.NO_ESPN_ID);
      continue;
    }

    const stat = statsByEspnPlayerId[statKey(pick.week, espnPlayerId)] ?? null;

    // The week's own row wins over the player's current NFL team: a player
    // traded in October played week 4 for whoever he played it for, and
    // `players.pro_team_id` is a last-write-wins snapshot of today.
    const proTeamId = stat?.proTeamId ?? pick.player?.proTeamId ?? null;
    if (proTeamId == null) {
      skip(pick, SKIP_REASONS.NO_PRO_TEAM, { espnPlayerId });
      continue;
    }

    const game = scheduleByTeam[scheduleKey(pick.week, proTeamId)] ?? null;

    // No row is "we do not know", not "he was off". Inferring a bye from a
    // gap would grade a whole league false the first time an import dropped
    // half the calendar.
    if (!game) {
      skip(pick, SKIP_REASONS.NO_SCHEDULE_ROW, { espnPlayerId, proTeamId });
      continue;
    }

    // An explicit bye, in a week that is over: no game, no touchdown. The one
    // place this grades false without a stat line, and it is a fact rather
    // than an inference.
    if (game.opponentProTeamId == null) {
      grades.push({ pickId: pick.id, week: pick.week, espnPlayerId, scoredTd: false });
      continue;
    }

    // Stalling is the designed failure direction. 2021 has games ESPN never
    // marked official; those picks stay pending forever rather than being
    // graded off a stat line that may still move.
    if (game.statsOfficial !== true) {
      skip(pick, SKIP_REASONS.NOT_OFFICIAL, { espnPlayerId, proTeamId });
      continue;
    }

    if (!stat) {
      // Dropped mid-week, most likely: the matchup payload only carries
      // rostered players. The kona fallback exists for exactly this and has
      // already run by the time we get here, so reaching this line means even
      // ESPN could not tell us.
      skip(pick, SKIP_REASONS.NO_STATS_ROW, { espnPlayerId, proTeamId });
      continue;
    }

    // Every row written before 2026-09 has no breakdown. Null is "we do not
    // know", and 0 would report the whole of league history as having scored
    // nothing — the same rule the power ranking's components follow.
    const scored = getScoredTouchdownCount(stat.statBreakdown);
    if (scored == null) {
      skip(pick, SKIP_REASONS.NO_BREAKDOWN, { espnPlayerId, proTeamId });
      continue;
    }

    // Rushing and receiving only. A quarterback who threw four has scored
    // none, which is what this parlay's question means.
    grades.push({ pickId: pick.id, week: pick.week, espnPlayerId, scoredTd: scored >= 1 });
  }

  return { grades, skipped };
}

/**
 * The picks that a kona lookup could still rescue: an official game, and no
 * stat line for the player.
 *
 * Split out so the sync can run the fallback *before* grading and merge what
 * comes back into the same map — the grader then sees one kind of stat line
 * and has no idea a fallback exists.
 *
 * @returns {Array<{ week: number, espnPlayerId: number }>} one entry per gap
 */
export function findMissingStatLines({
  picks = [],
  statsByEspnPlayerId = {},
  scheduleByTeam = {}
} = {}) {
  const missing = new Map();

  for (const pick of picks) {
    const espnPlayerId = pick.player?.espnPlayerId ?? null;
    if (!pick.playerId || espnPlayerId == null) continue;

    const stat = statsByEspnPlayerId[statKey(pick.week, espnPlayerId)] ?? null;
    if (stat) continue;

    const proTeamId = pick.player?.proTeamId ?? null;
    if (proTeamId == null) continue;

    const game = scheduleByTeam[scheduleKey(pick.week, proTeamId)] ?? null;
    // A bye needs no stat line, and an unofficial or unknown game is not
    // something a second fetch can fix.
    if (!game || game.opponentProTeamId == null || game.statsOfficial !== true) continue;

    missing.set(statKey(pick.week, espnPlayerId), { week: pick.week, espnPlayerId });
  }

  return [...missing.values()];
}

export default gradeParlayPicks;
