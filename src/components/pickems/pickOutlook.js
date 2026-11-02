/**
 * How the viewer's pick stands, as one chip and one reason.
 *
 * Pure. It answers from three things per side: the points so far, the
 * projection for what is left, and the state of each starter's NFL game. The
 * margin is the picked side's live projection minus the other's; the
 * uncertainty is each remaining starter's spread, shrunk by how much of his game
 * is left. That gives a probability, and the probability picks the chip.
 *
 * Two chips need no probability, because the arithmetic is finished: **Locked**
 * when the other side has nobody left and trails, **Lost** when the picked side
 * has nobody left and trails. **Hit** and **Miss** wait for an official score.
 * A chip never reads red while the pick can still hit.
 *
 * `POSITION_SPREADS` are measured, by `scripts/calibrate-outlook-spreads.js`:
 * how far a starter's week lands from his projection, over weeks 1-7 of 2026.
 * Summed across a lineup they give a team 22.7 points of spread, against the
 * 22.0 its weeks actually missed by, so the width is right. The middle is
 * softer: pregame favourites won 22 of 48 games in the same stretch, so a chip
 * early in a game is a weak signal and it sharpens as points replace
 * projections. The thresholds are a first guess, to be tuned after a live Sunday.
 */

import { GAME_STATE } from '../../../services/espnLiveScoreMapper.js';
import { nflGameOf } from '../../../services/liveScores.js';
import { isScoringStarter } from '../../../utils/lineupTotals.js';
import { formatPoints } from '../../utils/format';

export const POSITION_SPREADS = Object.freeze({
  QB: 8,
  RB: 7.9,
  WR: 8.4,
  TE: 7.6,
  K: 5.9,
  'D/ST': 4.9
});

const DEFAULT_SPREAD = 7.5;

/** A pick this far behind on projection before kickoff is an underdog pick. */
export const UNDERDOG_MARGIN = 8;

const SAFE_FROM = 0.9;
const COIN_FLIP_FROM = 0.4;
const COIN_FLIP_TO = 0.6;

const QUARTER_MINUTES = 15;
const GAME_MINUTES = 4 * QUARTER_MINUTES;

/** What overtime has left, near enough: a score or two at most. */
const OVERTIME_LEFT = 0.05;

/** With no clock to read, assume the middle of the game. */
const UNKNOWN_CLOCK_LEFT = 0.5;

/** The share of an NFL game still to play, from its quarter and clock. */
export function fractionLeft(state, game = null) {
  if (state === GAME_STATE.FINAL || state === GAME_STATE.NO_GAME) return 0;
  if (state !== GAME_STATE.IN_PROGRESS) return 1;

  const { period, clock } = game ?? {};
  if (period > 4) return OVERTIME_LEFT;

  const [minutes, seconds] = String(clock ?? '').split(':').map(Number);
  if (!period || !Number.isFinite(minutes)) return UNKNOWN_CLOCK_LEFT;

  const inQuarter = minutes + (Number.isFinite(seconds) ? seconds : 0) / 60;
  return ((4 - period) * QUARTER_MINUTES + inQuarter) / GAME_MINUTES;
}

/** The standard normal CDF (Abramowitz and Stegun 26.2.17). */
function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const density = 0.3989423 * Math.exp((-z * z) / 2);
  const tail =
    density * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - tail : tail;
}

/**
 * One side's position.
 *
 * `points` and `expected` prefer ESPN's own figures, which include what a player
 * has already done in a game this cannot see into. The rows decide everything
 * only they know: who is left, and how uncertain that is.
 *
 * @param {{ rows?: object[], live?: { points?: number|null, projected?: number|null }|null, nflGames?: object }} input
 */
export function sideOutlook({ rows = [], live = null, nflGames = {} }) {
  const starters = rows.filter(isScoringStarter);

  let scored = 0;
  let pregame = 0;
  let toCome = 0;
  let variance = 0;
  let left = 0;
  let underway = false;

  for (const row of starters) {
    const projected = Number(row.projectedPoints ?? 0) || 0;
    pregame += projected;

    if (row.actualPoints != null) scored += Number(row.actualPoints);

    const share = fractionLeft(row.nflState, nflGameOf(row.proTeamId, nflGames));
    if (share > 0) {
      left += 1;
      toCome += projected * share;
      variance += (POSITION_SPREADS[row.position] ?? DEFAULT_SPREAD) ** 2 * share;
    }

    if (row.actualPoints != null || (row.nflState && row.nflState !== GAME_STATE.NOT_STARTED)) {
      underway = true;
    }
  }

  return {
    hasLineup: starters.length > 0,
    underway,
    left,
    pregame,
    variance,
    points: live?.points ?? scored,
    expected: live?.projected ?? scored + toCome
  };
}

const players = (count) => `${count} ${count === 1 ? 'player' : 'players'}`;

/** The reason under a chip. Trailing says what it takes; leading, what can catch it. */
function describe(own, other) {
  const needs = other.expected - own.points;
  if (own.left > 0 && needs > 0) return `needs ${formatPoints(needs)} from ${players(own.left)}`;

  return other.left === 0 ? 'opponent has nobody left' : `opponent has ${other.left} left`;
}

const CHIPS = {
  hit: { label: 'Hit', variant: 'success' },
  miss: { label: 'Miss', variant: 'destructive' },
  locked: { label: 'Locked', variant: 'success', settled: true },
  lost: { label: 'Lost', variant: 'destructive', settled: true },
  safe: { label: 'Safe', variant: 'success' },
  onTrack: { label: 'On track', variant: 'info' },
  coinFlip: { label: 'Coin flip', variant: 'secondary' },
  inDanger: { label: 'In danger', variant: 'warning' },
  upsetAlert: { label: 'Upset alert', variant: 'warning' },
  underdog: { label: 'Underdog pick', variant: 'secondary' }
};

const chip = (key, detail = null, extra = {}) => ({ key, ...CHIPS[key], detail, ...extra });

/**
 * The chip for one game, or null when there is nothing to say: no pick, a bye,
 * no lineups, or a pick that is simply the favourite before kickoff.
 *
 * @param {object} input
 * @param {object} input.game a pick'em game, with `team1`/`team2`
 * @param {string|null} input.pickedTeamId
 * @param {object} [input.rowsByTeam] `{ [teamId]: rows }`, as `useLineupsForWeek` returns
 * @param {object|null} [input.liveSides] `{ team1, team2 }`, as `overlayGame` attaches
 * @param {object} [input.nflGames]
 */
export function pickOutlook({ game, pickedTeamId, rowsByTeam = {}, liveSides = null, nflGames = {} }) {
  const team1Id = game?.team1?.id ?? game?.team1Id ?? null;
  const team2Id = game?.team2?.id ?? game?.team2Id ?? null;
  if (!pickedTeamId || !team1Id || !team2Id) return null;

  const pickedFirst = pickedTeamId === team1Id;
  if (!pickedFirst && pickedTeamId !== team2Id) return null;

  if (game.isCompleted) {
    if (game.winnerTeamId === pickedTeamId) return chip('hit');
    return chip('miss', game.winnerTeamId ? null : 'the game tied');
  }

  const sideOf = (teamId, live) => sideOutlook({ rows: rowsByTeam[teamId] ?? [], live, nflGames });
  const team1 = sideOf(team1Id, liveSides?.team1);
  const team2 = sideOf(team2Id, liveSides?.team2);
  const [own, other] = pickedFirst ? [team1, team2] : [team2, team1];

  if (!own.hasLineup || !other.hasLineup) return null;

  const pregameMargin = own.pregame - other.pregame;

  if (!own.underway && !other.underway) {
    return pregameMargin <= -UNDERDOG_MARGIN
      ? chip('underdog', `projected ${formatPoints(-pregameMargin)} behind`)
      : null;
  }

  const lead = own.points - other.points;

  if (other.left === 0 && lead > 0) return chip('locked', 'opponent has nobody left');
  if (own.left === 0 && lead < 0) return chip('lost', `lost by ${formatPoints(-lead)}`);

  const spread = Math.sqrt(own.variance + other.variance);
  const margin = own.expected - other.expected;
  const probability = spread > 0 ? normalCdf(margin / spread) : margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  const detail = describe(own, other);
  const inPlay = { probability };

  if (probability >= SAFE_FROM) return chip('safe', detail, inPlay);

  const underdogLeading = pregameMargin <= -UNDERDOG_MARGIN && lead > 0;
  const favouriteCaught = pregameMargin >= UNDERDOG_MARGIN && lead < 0 && other.left > own.left;
  if (underdogLeading || favouriteCaught) {
    return chip('upsetAlert', detail, { ...inPlay, trailing: lead < 0 });
  }

  if (probability >= COIN_FLIP_TO) return chip('onTrack', detail, inPlay);
  if (probability >= COIN_FLIP_FROM) return chip('coinFlip', detail, inPlay);
  return chip('inDanger', detail, inPlay);
}

/**
 * The week's chips, counted for the home tile: "7 of 14 safe · 2 in danger".
 * `live` is false until a pick has something to report beyond its kickoff, so
 * the tile does not change before there is a game to talk about.
 *
 * @param {Array<object|null>} outlooks
 */
export function countOutlooks(outlooks = []) {
  const chips = outlooks.filter(Boolean);
  const inDanger = (outlook) =>
    outlook.key === 'inDanger' || (outlook.key === 'upsetAlert' && outlook.trailing);

  return {
    live: chips.some((outlook) => outlook.key !== 'underdog'),
    safe: chips.filter((outlook) => ['hit', 'locked', 'safe'].includes(outlook.key)).length,
    danger: chips.filter(inDanger).length
  };
}

/**
 * How far starters land from their projections, by position: the numbers behind
 * `POSITION_SPREADS`. Pass real starters with both figures; the script does.
 * A row with no projection is left out, because it has nothing to miss by.
 *
 * @param {Array<{ position: string, actualPoints: number, projectedPoints: number }>} rows
 */
export function calibrateSpreads(rows = []) {
  const misses = {};

  for (const row of rows) {
    const projected = Number(row.projectedPoints);
    const actual = Number(row.actualPoints);
    if (!row.position || !Number.isFinite(actual) || !(projected > 0)) continue;

    (misses[row.position] ??= []).push(actual - projected);
  }

  const round = (value) => Math.round(value * 10) / 10;

  return Object.fromEntries(
    Object.entries(misses).map(([position, list]) => {
      const squares = list.reduce((sum, miss) => sum + miss ** 2, 0);
      const mean = list.reduce((sum, miss) => sum + miss, 0) / list.length;

      return [position, { spread: round(Math.sqrt(squares / list.length)), mean: round(mean), rows: list.length }];
    })
  );
}
