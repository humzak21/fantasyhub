/**
 * The OG Jits ranking: every player's career in this league, ranked within his
 * position, from `v_player_careers`.
 *
 * - **Points per game over games appeared**, the view's `points_per_game`,
 *   which averages only weeks that pass `appeared` — so a season on IR does not
 *   sink a player who scored whenever he played.
 * - **Qualified at `minGames` appeared games** (5 by default). Below that a
 *   player keeps his PPG and gets no rank: two big weeks are not a career, and a
 *   leaderboard topped by a one-week waiver pickup reads as a bug.
 * - **Competition ranking (1, 2, 2, 4)**, `competitionRank` from
 *   `utils/franchiseWeeks.js`, the same tie rule as the weekly ranks.
 * - **Unknown is null.** A player with no appeared game has no PPG, no rank and
 *   no percentile; a player never rostered has no start %.
 */

import { competitionRank } from '../franchiseWeeks.js';

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Rank every career. Returns `{ minGames, byPlayerId, positions }`, where
 * `positions[position]` lists the qualified entries in rank order (ties by
 * name) for the leaderboard strip.
 *
 * `startPct` is weeks started over weeks rostered, ranked the same way among
 * the qualified (`startRank` of `startOf`). `percentile` is the share of his
 * qualified peers at the position he beats or ties; null when he has none.
 */
export function rankCareers(rows = [], { minGames = 5 } = {}) {
  const entries = rows.map((row) => {
    const gamesPlayed = num(row.gamesPlayed) ?? 0;
    const weeksRostered = num(row.weeksRostered) ?? 0;
    const weeksStarted = num(row.weeksStarted) ?? 0;
    const pointsPerGame = gamesPlayed > 0 ? num(row.pointsPerGame) : null;
    return {
      playerId: row.playerId,
      espnPlayerId: row.espnPlayerId ?? null,
      name: row.name ?? null,
      position: row.position ?? null,
      pointsPerGame,
      gamesPlayed,
      weeksRostered,
      weeksStarted,
      startPct: weeksRostered > 0 ? weeksStarted / weeksRostered : null,
      qualified: pointsPerGame !== null && gamesPlayed >= minGames,
      rank: null,
      of: null,
      startRank: null,
      startOf: null,
      percentile: null
    };
  });

  const byPosition = new Map();
  for (const entry of entries) {
    if (!entry.qualified) continue;
    const list = byPosition.get(entry.position);
    if (list) list.push(entry);
    else byPosition.set(entry.position, [entry]);
  }

  const positions = {};
  for (const [position, group] of byPosition) {
    const ranks = competitionRank(group, (e) => e.playerId, (e) => e.pointsPerGame);
    const withStart = group.filter((e) => e.startPct !== null);
    const startRanks = competitionRank(withStart, (e) => e.playerId, (e) => e.startPct);
    for (const entry of group) {
      entry.rank = ranks.get(entry.playerId);
      entry.of = group.length;
      entry.startRank = startRanks.get(entry.playerId) ?? null;
      entry.startOf = entry.startRank === null ? null : withStart.length;
      const peers = group.length - 1;
      entry.percentile = peers > 0
        ? group.filter((other) => other !== entry && other.pointsPerGame <= entry.pointsPerGame).length / peers
        : null;
    }
    positions[position] = [...group].sort(
      (a, b) => a.rank - b.rank || (a.name ?? '').localeCompare(b.name ?? ''));
  }

  const byPlayerId = Object.fromEntries(entries.map((entry) => [entry.playerId, entry]));
  return { minGames, byPlayerId, positions };
}

/**
 * The entries around a player at his position: up to `span` above and `span`
 * below, with him in the middle, in rank order. At the top or bottom of a
 * position the window is simply shorter on that side.
 *
 * An unqualified player with a PPG is placed where that PPG would sit (after
 * anyone level with him), so the strip can still show whom he is chasing; he
 * stays `qualified: false` and unranked. No PPG, or no such player, is `[]`.
 */
export function neighbours(ranking, playerId, span = 2) {
  const entry = ranking?.byPlayerId?.[playerId];
  if (!entry || entry.pointsPerGame === null) return [];
  const list = [...(ranking.positions?.[entry.position] ?? [])];

  let index = list.indexOf(entry);
  if (index === -1) {
    index = list.findIndex((other) => other.pointsPerGame < entry.pointsPerGame);
    if (index === -1) index = list.length;
    list.splice(index, 0, entry);
  }

  return list.slice(Math.max(0, index - span), index + span + 1);
}
