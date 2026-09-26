/**
 * The franchise profile's week-by-week view, computed from
 * `services/db/history.js::getSeasonWeekSource` and `getPlayerCareer`.
 *
 * Pure, and the only place the view's rules live — the components render what
 * this returns and nothing else, the same decide/render split as the record
 * book. Three rules carry the whole design:
 *
 * - **Nothing here knows what year it is.** Which weeks exist comes from the
 *   season row and the rows the sync has written; what a week can show comes
 *   from which rows exist for it. There is no `year >= 2025` anywhere: a power
 *   rank appears because a snapshot row exists for that week, lineups because
 *   `player_week_stats` rows do. So every season from 2026 on arrives with no
 *   code change, and anything backfilled later lights up the same way.
 * - **Unknown is absent, never zero.** A player's points stay null until the
 *   sync has evidence the game was played (the rule `actual_points` is written
 *   by); a team total is only a total when every starter is a result; a week
 *   with no stored lineup says so instead of listing nothing.
 * - **The game is the score.** The result comes from `games`; the lineup sum
 *   is shown beside it, never in place of it (a few backfilled weeks carry a
 *   stat correction applied to the matchup but not the player lines).
 */

import { getScoredTouchdownCount } from '../services/db/espnMapping.js';
import { POWER_RANKING_COMPONENT_META } from '../types/index.js';
import { getWeekLabel } from './weekLabelUtils.js';

/** Starting slots in the order a lineup is read. */
export const LINEUP_SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'D/ST', 'K'];

const slotRank = (slot) => {
  const index = LINEUP_SLOT_ORDER.indexOf(slot);
  return index === -1 ? LINEUP_SLOT_ORDER.length : index;
};

/** Labels for the columns a snapshot carried before `components` existed. */
const LEGACY_COMPONENT_LABELS = {
  performanceScore: 'Performance',
  teamStrength: 'Team strength',
  strengthOfSchedule: 'Strength of schedule',
  momentumScore: 'Momentum',
  consistencyScore: 'Consistency',
  clutchScore: 'Clutch',
  allPlayWinPct: 'All-play win %'
};

const key = (teamId, week) => `${teamId}:${week}`;
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isScored = (game) => isNumber(game.team1Score) && isNumber(game.team2Score);
const isBye = (game) => game.type === 'bye' || game.team2Id == null;

function push(map, mapKey, value) {
  const list = map.get(mapKey);
  if (list) list.push(value);
  else map.set(mapKey, [value]);
}

/**
 * Competition ranking (1, 2, 2, 4) over a numeric value, highest first.
 * @returns {Map<any, number>} id → rank
 */
function competitionRank(items, idOf, valueOf) {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  const ranks = new Map();
  let previous = null;
  let previousRank = 0;
  sorted.forEach((item, index) => {
    const value = valueOf(item);
    const rank = previous !== null && value === previous ? previousRank : index + 1;
    ranks.set(idOf(item), rank);
    previous = value;
    previousRank = rank;
  });
  return ranks;
}

/**
 * Every week of a season, from the data rather than from a constant.
 *
 * The season row says how long the season is meant to be; the rows say how far
 * it has actually got written. The longer of the two wins, so a season whose
 * row lacks `total_weeks` still shows every week anything was stored for, and a
 * season in progress shows its whole calendar with the unplayed weeks empty.
 * Postseason is whatever comes after `regularSeasonWeeks` — never a hardcoded
 * week number.
 */
export function listSeasonWeeks(season, { games = [], playerWeeks = [], ranks = [] } = {}) {
  const regular = isNumber(season?.regularSeasonWeeks) ? season.regularSeasonWeeks : null;
  const declared = isNumber(season?.totalWeeks)
    ? season.totalWeeks
    : regular != null && isNumber(season?.playoffWeeks)
      ? regular + season.playoffWeeks
      : 0;

  let observed = 0;
  for (const list of [games, playerWeeks, ranks]) {
    for (const row of list) if (isNumber(row.week) && row.week > observed) observed = row.week;
  }

  const last = Math.max(declared, observed);
  const total = Math.max(last, regular ?? 0);

  return Array.from({ length: last }, (_, i) => {
    const week = i + 1;
    return {
      week,
      isPostseason: regular != null && week > regular,
      label: getWeekLabel(week, regular, total)
    };
  });
}

/**
 * Where every player on a league roster finished in one week, by actual
 * points: overall, and within his position.
 *
 * The pool is the players rostered in this league that week — the only players
 * `player_week_stats` holds — not the whole NFL, and the UI says so. Players
 * who did not appear that week (see `appeared`) are left out rather than ranked
 * at zero.
 *
 * @returns {Map<string, {overall: number, overallOf: number, positional: number, positionalOf: number, position: string|null}>}
 */
/**
 * Whether a player actually took the field that week, as far as the stored row
 * can say. A settled week stores 0 for everybody rostered, including the
 * injured-reserve starter who never played — ESPN's matchup counted him as 0,
 * and that stays true on the lineup. But averaging or ranking him at 0 would
 * report an injury as a bad game, so those readers ask this instead: a stat
 * line, or any non-zero points.
 *
 * `hasStatLine` is the career read's flag, which carries no breakdown.
 */
export function appeared(row) {
  if (!row || !isNumber(row.actualPoints)) return false;
  return row.actualPoints !== 0 || row.statBreakdown != null || row.hasStatLine === true;
}

export function rankPlayersForWeek(rows = []) {
  const byPlayer = new Map();
  for (const row of rows) {
    if (!appeared(row) || !row.playerId || byPlayer.has(row.playerId)) continue;
    byPlayer.set(row.playerId, row);
  }

  const scored = [...byPlayer.values()];
  const overall = competitionRank(scored, (row) => row.playerId, (row) => row.actualPoints);

  const byPosition = new Map();
  for (const row of scored) push(byPosition, row.position ?? null, row);

  const result = new Map();
  for (const [position, group] of byPosition) {
    const positional = competitionRank(group, (row) => row.playerId, (row) => row.actualPoints);
    for (const row of group) {
      result.set(row.playerId, {
        overall: overall.get(row.playerId),
        overallOf: scored.length,
        positional: positional.get(row.playerId),
        positionalOf: group.length,
        position
      });
    }
  }
  return result;
}

/**
 * Index a season's source for lookups by team, week and player. The one pass
 * everything below reads from, run once per fetch (it is the query's `select`).
 */
export function buildSeasonIndex(source) {
  if (!source?.season) return null;

  const {
    season,
    franchises = [],
    teams = [],
    games = [],
    playerWeeks = [],
    lineups = [],
    ranks = [],
    events = []
  } = source;

  const teamById = new Map(teams.map((team) => [team.id, team]));
  const teamByFranchise = new Map(teams.filter((team) => team.franchiseId).map((team) => [team.franchiseId, team]));
  const franchiseById = new Map(franchises.map((franchise) => [franchise.id, franchise]));

  const gamesByWeek = new Map();
  for (const game of games) push(gamesByWeek, game.week, game);

  const playerWeeksByKey = new Map();
  const playerWeeksByWeek = new Map();
  const playerWeeksByPlayer = new Map();
  for (const row of playerWeeks) {
    push(playerWeeksByKey, key(row.teamId, row.week), row);
    push(playerWeeksByWeek, row.week, row);
    if (row.playerId) push(playerWeeksByPlayer, row.playerId, row);
  }
  for (const list of playerWeeksByPlayer.values()) list.sort((a, b) => a.week - b.week);

  const lineupByKey = new Map(lineups.map((row) => [key(row.teamId, row.week), row]));

  // One snapshot per team per week. The sync writes `weekly`; prefer it if a
  // week somehow holds another type as well.
  const rankByKey = new Map();
  for (const row of ranks) {
    const k = key(row.teamId, row.week);
    const existing = rankByKey.get(k);
    if (!existing || (existing.snapshotType !== 'weekly' && row.snapshotType === 'weekly')) {
      rankByKey.set(k, row);
    }
  }

  const eventsByWeek = new Map();
  for (const event of events) if (isNumber(event.week)) push(eventsByWeek, event.week, event);

  const playerRanksByWeek = new Map();
  for (const [week, rows] of playerWeeksByWeek) playerRanksByWeek.set(week, rankPlayersForWeek(rows));

  return {
    season,
    teams,
    teamById,
    teamByFranchise,
    franchiseById,
    games,
    gamesByWeek,
    playerWeeksByKey,
    playerWeeksByPlayer,
    lineupByKey,
    rankByKey,
    eventsByWeek,
    playerRanksByWeek,
    weeks: listSeasonWeeks(season, { games, playerWeeks, ranks })
  };
}

/** The game a team played in a week, or null. */
function gameFor(index, teamId, week) {
  return (index.gamesByWeek.get(week) ?? []).find(
    (game) => game.team1Id === teamId || game.team2Id === teamId
  ) ?? null;
}

function resultOf(game, teamId) {
  if (!game || isBye(game) || !isScored(game)) return null;
  const mine = game.team1Id === teamId ? game.team1Score : game.team2Score;
  const theirs = game.team1Id === teamId ? game.team2Score : game.team1Score;
  if (mine > theirs) return 'W';
  if (mine < theirs) return 'L';
  return 'T';
}

/**
 * Regular-season standings as they stood after `week`, reconstructed from the
 * games: win % desc, points for desc, points against asc — the league's
 * canonical sort. A postseason week reads the final regular-season table.
 *
 * @returns {Map<string, {wins, losses, ties, pointsFor, pointsAgainst, rank, of}>}
 */
export function standingsThrough(index, week) {
  const table = new Map(index.teams.map((team) => [team.id, { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: 0 }]));

  for (const game of index.games) {
    if (game.type !== 'regular' || !isScored(game) || isBye(game) || game.week > week) continue;
    for (const [teamId, mine, theirs] of [
      [game.team1Id, game.team1Score, game.team2Score],
      [game.team2Id, game.team2Score, game.team1Score]
    ]) {
      const row = table.get(teamId);
      if (!row) continue;
      row.games += 1;
      row.pointsFor += mine;
      row.pointsAgainst += theirs;
      if (mine > theirs) row.wins += 1;
      else if (mine < theirs) row.losses += 1;
      else row.ties += 1;
    }
  }

  const pct = (row) => (row.games ? (row.wins + row.ties / 2) / row.games : 0);
  const sorted = [...table.entries()].sort(([, a], [, b]) =>
    pct(b) - pct(a) || b.pointsFor - a.pointsFor || a.pointsAgainst - b.pointsAgainst
  );

  const out = new Map();
  let previous = null;
  let previousRank = 0;
  sorted.forEach(([teamId, row], i) => {
    const same = previous &&
      pct(previous) === pct(row) &&
      previous.pointsFor === row.pointsFor &&
      previous.pointsAgainst === row.pointsAgainst;
    const rank = same ? previousRank : i + 1;
    out.set(teamId, { ...row, rank, of: sorted.length });
    previous = row;
    previousRank = rank;
  });
  return out;
}

/**
 * One chip per week for the scrubber: the label, whether it is postseason, and
 * how the franchise's week went, if it has been played.
 */
export function franchiseWeekStrip(index, franchiseId) {
  const team = index?.teamByFranchise.get(franchiseId);
  if (!team) return [];

  return index.weeks.map(({ week, isPostseason, label }) => {
    const game = gameFor(index, team.id, week);
    const bye = Boolean(game && isBye(game));
    const result = resultOf(game, team.id);
    const hasLineup = index.playerWeeksByKey.has(key(team.id, week));
    return {
      week,
      label,
      isPostseason,
      isBye: bye,
      result,
      hasLineup,
      hasData: Boolean(result || bye || hasLineup || index.rankByKey.has(key(team.id, week)))
    };
  });
}

/**
 * The week the view opens on: the latest one with anything to show, so a
 * finished season opens on its last game and a season in progress on the most
 * recent week the sync has filled in.
 */
export function defaultWeek(strip) {
  // A bye alone is not much of a week to open on; prefer a game or a lineup.
  for (const wanted of [(w) => w.result || w.hasLineup, (w) => w.hasData]) {
    for (let i = strip.length - 1; i >= 0; i -= 1) {
      if (wanted(strip[i])) return strip[i].week;
    }
  }
  return strip[0]?.week ?? null;
}

/**
 * The franchise's power rank across the season, for the season arc: the
 * snapshot's rank where one exists, otherwise the record-based standing
 * (flagged, so the chart can say which it is plotting).
 */
export function seasonArc(index, franchiseId) {
  const team = index?.teamByFranchise.get(franchiseId);
  if (!team) return [];

  return franchiseWeekStrip(index, franchiseId)
    .filter((week) => week.hasData && !week.isPostseason)
    .map(({ week, label, result }) => {
      const snapshot = index.rankByKey.get(key(team.id, week));
      return {
        week,
        label,
        result,
        powerRank: snapshot?.rank ?? null,
        standing: result ? standingsThrough(index, week).get(team.id)?.rank ?? null : null
      };
    });
}

function componentsOf(snapshot) {
  if (snapshot.components && typeof snapshot.components === 'object') {
    return {
      legacy: false,
      items: Object.entries(POWER_RANKING_COMPONENT_META)
        .filter(([componentKey]) => isNumber(snapshot.components[componentKey]))
        .map(([componentKey, meta]) => ({
          key: componentKey,
          label: meta.label,
          description: meta.description,
          value: snapshot.components[componentKey]
        }))
    };
  }
  if (snapshot.legacy) {
    return {
      legacy: true,
      items: Object.entries(LEGACY_COMPONENT_LABELS)
        .filter(([componentKey]) => isNumber(snapshot.legacy[componentKey]))
        .map(([componentKey, label]) => ({ key: componentKey, label, value: snapshot.legacy[componentKey] }))
    };
  }
  return { legacy: false, items: [] };
}

function lineupRow(row, ranks) {
  return {
    playerId: row.playerId,
    name: row.name,
    position: row.position,
    slot: row.slot,
    started: row.started,
    actualPoints: isNumber(row.actualPoints) ? row.actualPoints : null,
    touchdowns: row.statBreakdown ? getScoredTouchdownCount(row.statBreakdown) : null,
    proTeamId: row.proTeamId,
    proTeam: row.proTeam,
    rank: ranks?.get(row.playerId) ?? null
  };
}

function movesFor(index, franchiseId, week) {
  return (index.eventsByWeek.get(week) ?? [])
    .filter((event) => event.franchiseId === franchiseId || event.franchiseIds.includes(franchiseId))
    .map((event) => {
      const known = event.players.filter((p) => p.from !== undefined || p.to !== undefined);
      const directionStored = known.length === event.players.length && event.players.length > 0;
      return {
        id: event.id,
        kind: event.type === 'TRADE_ACCEPT' ? 'trade' : event.type === 'WAIVER' ? 'waiver' : 'free_agent',
        bidAmount: event.type === 'WAIVER' ? event.bidAmount : null,
        processedAt: event.processedAt,
        counterparts: event.franchiseIds
          .filter((id) => id !== franchiseId)
          .map((id) => index.franchiseById.get(id) ?? { id }),
        added: directionStored ? event.players.filter((p) => p.to === franchiseId) : [],
        dropped: directionStored ? event.players.filter((p) => p.from === franchiseId) : [],
        // Stored before direction was: listed without a side rather than guessed.
        involved: directionStored ? [] : event.players
      };
    })
    .filter((move) => move.added.length || move.dropped.length || move.involved.length);
}

/**
 * Everything the profile shows for one franchise in one week.
 *
 * Returns null when the franchise has no team that season. Every part is
 * independently present or absent — a week can have a result and no lineup
 * (2024 week 1), a lineup and no rank snapshot (before 2025), or nothing yet
 * (the week in progress) — and the component renders each part's own empty
 * state rather than one blanket "no data".
 */
/**
 * What a postseason game was, from its own type rather than the calendar: the
 * league calendar calls the last week "Championship" for everybody, and for
 * most of the league that week is a consolation game. Null for a regular or
 * unknown type.
 */
export function gamePhaseLabel(type) {
  if (!type || type === 'regular') return null;
  if (type === 'bye') return 'Bye';
  if (type.startsWith('playoff_consolation')) return 'Consolation';
  if (type === 'playoff_first_round') return 'Playoffs, first round';
  if (type === 'playoff_semifinals') return 'Semifinal';
  if (type === 'playoff_championship') return 'Championship';
  if (type.startsWith('playoff')) return 'Placement game';
  return null;
}

export function buildWeekDossier(index, franchiseId, week) {
  const team = index?.teamByFranchise.get(franchiseId);
  if (!team || !isNumber(week)) return null;

  const meta = index.weeks.find((w) => w.week === week) ?? { week, isPostseason: false, label: `Week ${week}` };
  const game = gameFor(index, team.id, week);

  let matchup = null;
  if (game) {
    const home = game.team1Id === team.id;
    const opponentTeam = index.teamById.get(home ? game.team2Id : game.team1Id) ?? null;
    const pointsFor = home ? game.team1Score : game.team2Score;
    const pointsAgainst = home ? game.team2Score : game.team1Score;
    const result = resultOf(game, team.id);
    matchup = {
      type: game.type,
      isBye: isBye(game),
      opponentTeam,
      opponentFranchise: opponentTeam ? index.franchiseById.get(opponentTeam.franchiseId) ?? null : null,
      pointsFor: isNumber(pointsFor) ? pointsFor : null,
      pointsAgainst: isNumber(pointsAgainst) ? pointsAgainst : null,
      result,
      margin: result ? pointsFor - pointsAgainst : null,
      isBlowout: result ? game.isBlowout : false,
      isClose: result ? game.isClose : false
    };
  }

  const regular = index.season.regularSeasonWeeks;
  const standingWeek = isNumber(regular) ? Math.min(week, regular) : week;
  const standing = standingsThrough(index, standingWeek).get(team.id) ?? null;

  const snapshot = index.rankByKey.get(key(team.id, week)) ?? null;
  const previous = index.rankByKey.get(key(team.id, week - 1)) ?? null;
  const power = snapshot
    ? {
        rank: snapshot.rank,
        powerRating: snapshot.powerRating,
        change: previous ? previous.rank - snapshot.rank : null,
        ...componentsOf(snapshot)
      }
    : null;

  const ranks = index.playerRanksByWeek.get(week);
  const rows = (index.playerWeeksByKey.get(key(team.id, week)) ?? []).map((row) => lineupRow(row, ranks));
  const starters = rows
    .filter((row) => row.started)
    .sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || (a.name ?? '').localeCompare(b.name ?? ''));
  const bench = rows
    .filter((row) => !row.started)
    .sort((a, b) => (b.actualPoints ?? -Infinity) - (a.actualPoints ?? -Infinity));

  const stored = index.lineupByKey.get(key(team.id, week)) ?? null;
  const everyStarterScored = starters.length > 0 && starters.every((row) => row.actualPoints != null);
  const starterPoints = stored?.starterPoints ??
    (everyStarterScored ? starters.reduce((sum, row) => sum + row.actualPoints, 0) : null);
  const optimalPoints = stored?.optimalPoints ?? null;

  return {
    week,
    label: meta.label,
    isPostseason: meta.isPostseason,
    phase: meta.isPostseason ? gamePhaseLabel(game?.type) : null,
    team,
    franchise: index.franchiseById.get(franchiseId) ?? null,
    matchup,
    record: standing
      ? { wins: standing.wins, losses: standing.losses, ties: standing.ties }
      : null,
    standing: standing && standing.games > 0 ? { rank: standing.rank, of: standing.of } : null,
    power,
    lineup: {
      hasLineup: rows.length > 0,
      starters,
      bench
    },
    totals: rows.length
      ? {
          starterPoints,
          optimalPoints,
          benchPoints: stored?.benchPoints ?? null,
          efficiency: isNumber(starterPoints) && isNumber(optimalPoints) && optimalPoints > 0
            ? starterPoints / optimalPoints
            : null
        }
      : null,
    moves: movesFor(index, franchiseId, week)
  };
}

function splitsOf(weeks) {
  const scored = weeks.filter(appeared);
  if (!scored.length) return null;
  const total = scored.reduce((sum, row) => sum + row.actualPoints, 0);
  const best = scored.reduce((a, b) => (b.actualPoints > a.actualPoints ? b : a));
  const worst = scored.reduce((a, b) => (b.actualPoints < a.actualPoints ? b : a));
  return {
    total,
    games: scored.length,
    average: total / scored.length,
    best: { points: best.actualPoints, week: best.week },
    worst: { points: worst.actualPoints, week: worst.week },
    starts: weeks.filter((row) => row.started).length,
    rostered: weeks.length
  };
}

/**
 * One player's season in the league: every week he was on a roster here, what
 * he scored, where he ranked that week, and whose team he was on.
 */
export function buildPlayerSeason(index, playerId) {
  const rows = index?.playerWeeksByPlayer.get(playerId) ?? [];
  const weeks = rows.map((row) => {
    const team = index.teamById.get(row.teamId) ?? null;
    return {
      week: row.week,
      label: index.weeks.find((w) => w.week === row.week)?.label ?? `Week ${row.week}`,
      teamId: row.teamId,
      franchiseId: team?.franchiseId ?? null,
      started: row.started,
      slot: row.slot,
      actualPoints: isNumber(row.actualPoints) ? row.actualPoints : null,
      appeared: appeared(row),
      touchdowns: row.statBreakdown ? getScoredTouchdownCount(row.statBreakdown) : null,
      proTeamId: row.proTeamId,
      rank: index.playerRanksByWeek.get(row.week)?.get(playerId) ?? null
    };
  });
  return { weeks, splits: splitsOf(weeks) };
}

/**
 * A player's whole history in the league, season by season, with the stints he
 * spent on each franchise (consecutive rostered weeks on one team).
 */
export function buildPlayerCareer(career) {
  const bySeason = new Map();
  for (const row of career?.weeks ?? []) {
    if (!isNumber(row.year)) continue;
    push(bySeason, row.year, row);
  }

  return [...bySeason.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, rows]) => {
      const sorted = [...rows].sort((a, b) => a.week - b.week);
      const stints = [];
      for (const row of sorted) {
        const last = stints[stints.length - 1];
        if (last && last.franchiseId === row.franchiseId && row.week === last.toWeek + 1) {
          last.toWeek = row.week;
          last.weeks += 1;
          if (row.started) last.starts += 1;
        } else {
          stints.push({
            franchiseId: row.franchiseId,
            teamId: row.teamId,
            teamName: row.teamName,
            owner: row.owner,
            fromWeek: row.week,
            toWeek: row.week,
            weeks: 1,
            starts: row.started ? 1 : 0
          });
        }
      }
      return { year, stints, splits: splitsOf(sorted) };
    });
}
