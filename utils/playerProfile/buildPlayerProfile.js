/**
 * A player's page, computed from `services/db/playerProfiles.js::getPlayerProfileSource`.
 *
 * Pure, and the only place the page's rules live; the components render what
 * this returns. It runs as the query's `select`, once per fetch. The rules it
 * carries, each from CLAUDE.md:
 *
 * - **Unknown is null, never 0.** A season with no appeared week has
 *   `pointsPerGame: null`; a week with no breakdown has `stats: null`; a total
 *   over no games is null, because "he scored 0" and "nothing is known" read
 *   identically once printed.
 * - **Averages are over appeared weeks only** (`appeared` from
 *   `utils/franchiseWeeks.js`). A settled week stores 0 for the starter on IR,
 *   and averaging him at 0 would report an injury as a bad game. The rostered
 *   and started counts still include those weeks: he was on the team.
 * - **The week's own facts win.** Each line's NFL team is that week's
 *   `pro_team_id` (`teamOf`), its franchise is the one that rostered him that
 *   week, and its rank is the view's, among league-rostered players that week.
 * - **Franchise refs are the `franchises` array's own objects**, looked up by
 *   id and never rebuilt, so the UI masks them with `getMaskedFranchiseName`
 *   exactly as every other surface does.
 */

import { appeared as appearedRule, gamePhaseLabel } from '../franchiseWeeks.js';
import { getScoredTouchdownCount } from '../../services/db/espnMapping.js';
import { teamOf } from '../playerImages.js';
import { getWeekLabel } from '../weekLabelUtils.js';
import { statLine, sumStatLines } from './statCatalog.js';

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** How many recent appeared weeks "Last 4" means. */
export const RECENT_GAMES = 4;
/** A boom is at least this multiple of the season average; a bust at most `BUST_FACTOR`. */
export const BOOM_FACTOR = 1.5;
export const BUST_FACTOR = 0.5;
/** Fewer games than this and a boom or bust rate is noise, so it is null. */
export const MIN_RATE_GAMES = 3;
/** How many games each of the best and worst lists hold. */
export const GAME_LIST_SIZE = 5;

/** Newer first: year, then week. */
const newerFirst = (a, b) => (b.year ?? 0) - (a.year ?? 0) || (b.week ?? 0) - (a.week ?? 0);
const chronological = (a, b) => (a.year ?? 0) - (b.year ?? 0) || (a.week ?? 0) - (b.week ?? 0);

const sum = (values) => values.reduce((total, value) => total + value, 0);
const mean = (values) => (values.length ? sum(values) / values.length : null);

/** Population standard deviation; null for no values. */
export function stddevPop(values) {
  if (!values.length) return null;
  const avg = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - avg) ** 2)));
}

/**
 * The p-th percentile (0-1) by linear interpolation between the closest ranks,
 * the definition spreadsheets and numpy default to. Null for no values; one
 * value is every percentile.
 */
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function weekLabelFor(season, week) {
  const regular = num(season?.regularSeasonWeeks);
  const total = num(season?.totalWeeks) ??
    (regular != null && num(season?.playoffWeeks) != null ? regular + num(season.playoffWeeks) : null);
  if (regular == null || total == null) return `Week ${week}`;
  return getWeekLabel(week, regular, Math.max(total, week));
}

/**
 * One `v_player_week_lines` row as the page reads it (`WeekLine`).
 *
 * `appeared` is the view's column when present, because that is the rule the
 * view's ranks were computed under; otherwise the same rule is applied here.
 */
function weekLine(row, ctx) {
  const season = ctx.seasonById.get(row.seasonId) ?? null;
  const team = ctx.teamById.get(row.teamId) ?? null;
  const franchiseId = row.franchiseId ?? team?.franchiseId ?? null;
  const position = row.position ?? ctx.position;
  const regular = num(season?.regularSeasonWeeks);
  const isPostseason = regular != null && row.week > regular;
  const actualPoints = num(row.actualPoints);
  const projectedPoints = num(row.projectedPoints);
  const statBreakdown = row.statBreakdown ?? null;
  const didAppear = typeof row.appeared === 'boolean'
    ? row.appeared
    : appearedRule({ actualPoints, statBreakdown });

  const hasGame = row.gameId != null || row.gameType != null;
  const opponentFranchiseId = row.opponentFranchiseId ??
    ctx.teamById.get(row.opponentTeamId)?.franchiseId ?? null;

  return {
    seasonId: row.seasonId,
    year: num(row.year) ?? num(season?.year),
    week: row.week,
    label: weekLabelFor(season, row.week),
    isPostseason,
    phase: isPostseason ? gamePhaseLabel(row.gameType) : null,
    teamId: row.teamId ?? null,
    franchiseId,
    franchise: ctx.franchiseById.get(franchiseId) ?? null,
    position,
    started: row.started === true,
    slot: row.rosterSlot ?? row.slot ?? null,
    actualPoints,
    projectedPoints,
    appeared: didAppear,
    statBreakdown,
    stats: statLine(statBreakdown, position),
    touchdowns: statBreakdown ? getScoredTouchdownCount(statBreakdown) : null,
    rank: num(row.overallRank) != null
      ? {
          overall: num(row.overallRank),
          overallOf: num(row.overallOf),
          positional: num(row.positionRank),
          positionalOf: num(row.positionOf)
        }
      : null,
    game: hasGame
      ? {
          result: row.result ?? null,
          teamScore: num(row.teamScore),
          opponentScore: num(row.opponentScore),
          opponentTeamId: row.opponentTeamId ?? null,
          opponentFranchiseId,
          opponentFranchise: ctx.franchiseById.get(opponentFranchiseId) ?? null,
          isBye: row.isBye === true,
          type: row.gameType ?? null
        }
      : null,
    proTeamId: row.proTeamId ?? null,
    proTeam: teamOf({ proTeamId: row.proTeamId })
  };
}

/** The higher scorer, ties to the newer week. */
const better = (a, b) => (b.actualPoints > a.actualPoints || (b.actualPoints === a.actualPoints && newerFirst(b, a) < 0) ? b : a);
const worse = (a, b) => (b.actualPoints < a.actualPoints || (b.actualPoints === a.actualPoints && newerFirst(b, a) < 0) ? b : a);

/**
 * The figures every span shares, a season or a career (`Aggregates`).
 *
 * A sum or mean over no qualifying weeks is null. `projectedDelta` is actual
 * minus projected over the weeks that have both an appeared actual and a
 * projection (`projectedDeltaWeeks` of them), so a week he sat out does not
 * read as missing his projection by all of it.
 */
export function aggregate(weeks = []) {
  const played = weeks.filter((w) => w.appeared && isNumber(w.actualPoints));
  const startedPlayed = played.filter((w) => w.started);
  const benchPlayed = played.filter((w) => !w.started);
  const ranked = weeks.filter((w) => w.rank && isNumber(w.rank.positional));
  const projected = weeks.filter((w) => isNumber(w.projectedPoints));
  const both = played.filter((w) => isNumber(w.projectedPoints));
  const weeksStarted = weeks.filter((w) => w.started).length;
  const points = (list) => (list.length ? sum(list.map((w) => w.actualPoints)) : null);

  return {
    weeksRostered: weeks.length,
    weeksStarted,
    gamesPlayed: played.length,
    startedGames: startedPlayed.length,
    benchGames: benchPlayed.length,
    totalPoints: points(played),
    pointsPerGame: played.length ? points(played) / played.length : null,
    startedPoints: points(startedPlayed),
    benchPoints: points(benchPlayed),
    best: played.length ? played.reduce(better) : null,
    worst: played.length ? played.reduce(worse) : null,
    startPct: weeks.length ? weeksStarted / weeks.length : null,
    avgPositionRank: ranked.length ? mean(ranked.map((w) => w.rank.positional)) : null,
    top5Finishes: ranked.length ? ranked.filter((w) => w.rank.positional <= 5).length : null,
    projectedTotal: projected.length ? sum(projected.map((w) => w.projectedPoints)) : null,
    avgProjected: projected.length ? mean(projected.map((w) => w.projectedPoints)) : null,
    projectedDelta: both.length ? sum(both.map((w) => w.actualPoints - w.projectedPoints)) : null,
    projectedDeltaWeeks: both.length
  };
}

/**
 * His team's results in the weeks he started and the game was scored. A bye
 * or an unscored game is not a result, and a bench week is not his.
 */
export function recordWhenStarted(weeks = []) {
  const record = { wins: 0, losses: 0, ties: 0 };
  for (const w of weeks) {
    if (!w.started || !w.game || w.game.isBye) continue;
    if (w.game.result === 'W') record.wins += 1;
    else if (w.game.result === 'L') record.losses += 1;
    else if (w.game.result === 'T') record.ties += 1;
  }
  return record;
}

/**
 * How his newest season with a game is going (`trends`), or null when he has
 * never appeared.
 *
 * `recent` is the last `RECENT_GAMES` appeared weeks, `span` every appeared
 * week that season, and `delta` the one minus the other. Boom and bust are
 * shares of appeared weeks at or beyond 1.5x and 0.5x the season average:
 * null under `MIN_RATE_GAMES` games, and null for an average at or below zero,
 * where a multiple of it means nothing. `floor` and `ceiling` are the 20th and
 * 80th percentiles, `consistency` the population standard deviation (lower is
 * steadier). `currentStreak` counts the newest weeks on the same side of the
 * average; a week exactly on it ends the streak.
 */
export function buildTrends(seasons = []) {
  const season = seasons.find((s) => s.weeks.some((w) => w.appeared && isNumber(w.actualPoints)));
  if (!season) return null;

  const played = season.weeks.filter((w) => w.appeared && isNumber(w.actualPoints));
  const points = played.map((w) => w.actualPoints);
  const recentPoints = points.slice(-RECENT_GAMES);
  const spanAvg = mean(points);
  const recentAvg = mean(recentPoints);
  const rateable = played.length >= MIN_RATE_GAMES && spanAvg > 0;

  let currentStreak = null;
  const sideOf = (value) => (value > spanAvg ? 'above' : value < spanAvg ? 'below' : null);
  const newestSide = sideOf(points[points.length - 1]);
  if (newestSide) {
    let length = 0;
    for (let i = points.length - 1; i >= 0 && sideOf(points[i]) === newestSide; i -= 1) length += 1;
    currentStreak = { kind: newestSide, length };
  }

  return {
    seasonId: season.seasonId,
    year: season.year,
    recent: { games: recentPoints.length, avg: recentAvg },
    span: { games: points.length, avg: spanAvg },
    delta: recentAvg - spanAvg,
    boomRate: rateable ? points.filter((p) => p >= BOOM_FACTOR * spanAvg).length / points.length : null,
    bustRate: rateable ? points.filter((p) => p <= BUST_FACTOR * spanAvg).length / points.length : null,
    floor: percentile(points, 0.2),
    ceiling: percentile(points, 0.8),
    consistency: stddevPop(points),
    currentStreak
  };
}

/**
 * Consecutive rostered weeks on one franchise. A different franchise or a gap
 * in the weeks (he was dropped and picked up again) starts a new stint; so
 * does a new season. Newest season first, each season's stints in week order.
 */
function buildStints(lines, ctx) {
  const stints = [];
  for (const line of [...lines].sort(chronological)) {
    const last = stints[stints.length - 1];
    if (last && last.seasonId === line.seasonId && last.franchiseId === line.franchiseId && line.week === last.toWeek + 1) {
      last.toWeek = line.week;
      last.weeks += 1;
      if (line.started) last.starts += 1;
      continue;
    }
    const team = ctx.teamById.get(line.teamId) ?? null;
    stints.push({
      seasonId: line.seasonId,
      year: line.year,
      franchiseId: line.franchiseId,
      franchise: line.franchise,
      teamId: line.teamId,
      teamName: team?.name ?? null,
      owner: team?.owner ?? null,
      fromWeek: line.week,
      toWeek: line.week,
      weeks: 1,
      starts: line.started ? 1 : 0
    });
  }
  // Stable sort: seasons newest first, the weeks inside each left in order.
  return stints.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * His transactions, newest first.
 *
 * Direction is his own element of `playerFromFranchiseIds` /
 * `playerToFranchiseIds`, found by his index in `espnPlayerIds`; a null element
 * is ESPN's free-agent pool. A `TRADE_ACCEPT` that moved him between two
 * franchises is a `trade`; otherwise arriving on a franchise is a `waiver` (with
 * the bid) or an `add`, and leaving one for the pool is a `drop` — including the
 * drop that made room in someone else's claim or trade, which is his drop, not
 * his waiver. A row written before direction was stored is `unknown`, listed
 * with its franchises and no sides, rather than given a guessed one.
 *
 * `counterparts` are the event's other legs, `{ espnPlayerId, fromFranchise,
 * toFranchise }`, so a trade can say what moved the other way.
 */
function buildMoves(events, ctx, espnPlayerId) {
  const ref = (id) => (id == null ? null : ctx.franchiseById.get(id) ?? null);

  return events
    .map((event) => {
      const ids = event.espnPlayerIds ?? [];
      const index = ids.findIndex((id) => sameId(id, espnPlayerId));
      const fromIds = event.playerFromFranchiseIds;
      const toIds = event.playerToFranchiseIds;
      const directed = Array.isArray(fromIds) && Array.isArray(toIds) && index !== -1;
      const franchises = (event.franchiseIds ?? []).map(ref).filter(Boolean);

      const base = {
        id: event.id,
        seasonId: event.seasonId ?? null,
        year: num(event.year),
        week: num(event.week),
        type: event.type ?? null,
        processedAt: event.processedAt ?? null,
        franchises
      };

      if (!directed) {
        return { ...base, kind: 'unknown', bidAmount: null, fromFranchise: null, toFranchise: null, counterparts: [] };
      }

      const from = fromIds[index] ?? null;
      const to = toIds[index] ?? null;
      let kind = 'unknown';
      if (event.type === 'TRADE_ACCEPT' && from != null && to != null) kind = 'trade';
      else if (to != null) kind = event.type === 'WAIVER' ? 'waiver' : 'add';
      else if (from != null) kind = 'drop';

      const counterparts = ids.flatMap((id, i) =>
        i === index || id == null || Number(id) === 0
          ? []
          : [{ espnPlayerId: id, fromFranchise: ref(fromIds[i]), toFranchise: ref(toIds[i]) }]);

      return {
        ...base,
        kind,
        bidAmount: kind === 'waiver' ? num(event.bidAmount) : null,
        fromFranchise: ref(from),
        toFranchise: ref(to),
        counterparts
      };
    })
    .sort((a, b) =>
      (b.year ?? 0) - (a.year ?? 0) ||
      (b.week ?? 0) - (a.week ?? 0) ||
      String(b.processedAt ?? '').localeCompare(String(a.processedAt ?? '')));
}

/**
 * The whole page from one source, or null for a null source (the player does
 * not exist). See the module docblock for the rules; the shape is Contract 3
 * of the player-detail plan.
 */
export function buildPlayerProfile(source) {
  if (!source) return null;
  const {
    player: rawPlayer = {},
    lines: rawLines = [],
    teams = [],
    franchises = [],
    seasons: rawSeasons = [],
    current: rawCurrent = null,
    events = []
  } = source;

  const ctx = {
    seasonById: new Map(rawSeasons.map((s) => [s.id, s])),
    teamById: new Map(teams.map((t) => [t.id, t])),
    franchiseById: new Map(franchises.map((f) => [f.id, f])),
    position: rawPlayer.position ?? null
  };

  const lines = rawLines.map((row) => weekLine(row, ctx)).sort(chronological);
  // The page's position is today's, falling back to the newest week's.
  const position = rawPlayer.position ?? lines[lines.length - 1]?.position ?? null;

  const player = {
    id: rawPlayer.id ?? null,
    espnPlayerId: rawPlayer.espnPlayerId ?? null,
    name: rawPlayer.name ?? null,
    position,
    proTeam: teamOf(rawPlayer),
    proTeamId: rawPlayer.proTeamId ?? null,
    injuryStatus: rawPlayer.injuryStatus ?? null,
    projectedPoints: num(rawPlayer.projectedPoints),
    isActive: rawPlayer.isActive ?? null
  };

  const bySeason = new Map();
  for (const line of lines) {
    const list = bySeason.get(line.seasonId);
    if (list) list.push(line);
    else bySeason.set(line.seasonId, [line]);
  }

  const seasons = [...bySeason.entries()]
    .map(([seasonId, weeks]) => {
      const season = ctx.seasonById.get(seasonId) ?? null;
      return {
        seasonId,
        year: num(season?.year) ?? weeks[0].year,
        nflSeasonYear: num(season?.nflSeasonYear) ?? num(season?.year) ?? weeks[0].year,
        isCurrent: season?.isActive === true,
        weeks,
        totals: aggregate(weeks),
        byGroup: sumStatLines(weeks, position),
        recordWhenStarted: recordWhenStarted(weeks)
      };
    })
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

  const years = lines.map((l) => l.year).filter(isNumber);
  const career = {
    ...aggregate(lines),
    byGroup: sumStatLines(lines, position),
    seasonsPlayed: bySeason.size,
    franchisesCount: new Set(lines.map((l) => l.franchiseId).filter(Boolean)).size,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null
  };

  const played = lines.filter((l) => l.appeared && isNumber(l.actualPoints));
  const bestGames = [...played]
    .sort((a, b) => b.actualPoints - a.actualPoints || newerFirst(a, b))
    .slice(0, GAME_LIST_SIZE);
  const worstGames = [...played]
    .sort((a, b) => a.actualPoints - b.actualPoints || newerFirst(a, b))
    .slice(0, GAME_LIST_SIZE);

  let current = null;
  if (rawCurrent) {
    const team = ctx.teamById.get(rawCurrent.teamId) ?? null;
    const franchiseId = team?.franchiseId ?? null;
    current = {
      teamId: rawCurrent.teamId ?? null,
      franchiseId,
      franchise: ctx.franchiseById.get(franchiseId) ?? null,
      rosterSlot: rawCurrent.rosterSlot ?? null,
      seasonYear: num(ctx.seasonById.get(rawCurrent.seasonId)?.year)
    };
  }

  return {
    player,
    current,
    seasons,
    career,
    trends: buildTrends(seasons),
    bestGames,
    worstGames,
    stints: buildStints(lines, ctx),
    moves: buildMoves(events, ctx, player.espnPlayerId),
    recordWhenStarted: recordWhenStarted(lines)
  };
}
