/**
 * The ESPN stat categories the player page names, and the arithmetic over them.
 *
 * `player_week_stats.stat_breakdown` is ESPN's raw per-category map, keyed by a
 * numeric stat id as a *string*. ESPN documents none of it, so this catalog
 * names only the ids that were checked against real rows (Myers' 5 made field
 * goals are his 1 from 50+ plus 4 from 40-49; Allen's 20 completions of 31
 * attempts; Gibbs' 20 carries for 99 yards), and anything else in the map is
 * simply not shown. Never "Unknown stat": a guessed label is a wrong number with
 * a confident name on it.
 *
 * Three rules:
 *
 * - **Unknown is null, never 0.** A row with no breakdown has no stat line
 *   (`statLine` returns null), and summing skips it rather than counting it as a
 *   game of zeros. Per-game figures divide by the appeared weeks that *have* a
 *   breakdown, so a pre-breakdown week cannot drag an average down.
 * - **Ratios come from the sums.** Completion % over a season is completions
 *   over attempts for the season, never the mean of seventeen weekly
 *   percentages — the stat comparison's "sum the components, then compute".
 * - **The touchdown ids are `ESPN_STAT_IDS`.** `services/db/espnMapping.js` is
 *   the one definition of a touchdown; the TD rows here are display only and
 *   take their ids from it.
 */

import { ESPN_STAT_IDS, getScoredTouchdownCount } from '../../services/db/espnMapping.js';
import { appeared } from '../franchiseWeeks.js';

const stat = (id, label, short, format = 'count') => ({ id: String(id), label, short, format });

/**
 * Every named stat, by group, in the order a group reads. `format` is how the
 * UI prints the figure: every catalog stat is a `count` (yards, attempts and
 * points allowed included); derived ratios are a `fraction` (0-1, through
 * `formatFraction`) or a `decimal`.
 */
export const STAT_GROUPS = Object.freeze({
  passing: {
    id: 'passing',
    label: 'Passing',
    stats: [
      stat(0, 'Attempts', 'ATT'),
      stat(1, 'Completions', 'CMP'),
      stat(3, 'Passing yards', 'PASS YDS'),
      stat(ESPN_STAT_IDS.PASSING_TD, 'Passing TDs', 'PASS TD'),
      stat(20, 'Interceptions', 'INT'),
      stat(19, 'Passing 2-pt', '2PT'),
      stat(64, 'Sacked', 'SCK')
    ],
    derived: [{ id: 'completionPct', label: 'Completion %', format: 'fraction', numerator: '1', denominator: '0' }]
  },
  rushing: {
    id: 'rushing',
    label: 'Rushing',
    stats: [
      stat(23, 'Carries', 'CAR'),
      stat(24, 'Rushing yards', 'RUSH YDS'),
      stat(ESPN_STAT_IDS.RUSHING_TD, 'Rushing TDs', 'RUSH TD'),
      stat(26, 'Rushing 2-pt', '2PT')
    ],
    derived: [{ id: 'yardsPerCarry', label: 'Yards per carry', format: 'decimal', numerator: '24', denominator: '23' }]
  },
  receiving: {
    id: 'receiving',
    label: 'Receiving',
    stats: [
      stat(58, 'Targets', 'TGT'),
      stat(53, 'Receptions', 'REC'),
      stat(42, 'Receiving yards', 'REC YDS'),
      stat(ESPN_STAT_IDS.RECEIVING_TD, 'Receiving TDs', 'REC TD'),
      stat(44, 'Receiving 2-pt', '2PT'),
      stat(59, 'Yards after catch', 'YAC')
    ],
    derived: [
      { id: 'yardsPerReception', label: 'Yards per reception', format: 'decimal', numerator: '42', denominator: '53' },
      { id: 'catchRate', label: 'Catch rate', format: 'fraction', numerator: '53', denominator: '58' }
    ]
  },
  ballSecurity: {
    id: 'ballSecurity',
    label: 'Ball security',
    stats: [stat(68, 'Fumbles', 'FUM'), stat(72, 'Fumbles lost', 'FUML')],
    derived: []
  },
  kicking: {
    id: 'kicking',
    label: 'Kicking',
    stats: [
      stat(83, 'FG made', 'FGM'),
      stat(84, 'FG attempts', 'FGA'),
      stat(74, 'FG 50+ made', '50+'),
      stat(77, 'FG 40–49 made', '40–49'),
      stat(80, 'FG 0–39 made', '0–39'),
      stat(85, 'FG missed', 'FG MISS'),
      stat(86, 'XP made', 'XPM'),
      stat(87, 'XP attempts', 'XPA'),
      stat(88, 'XP missed', 'XP MISS')
    ],
    derived: [{ id: 'fgPct', label: 'FG %', format: 'fraction', numerator: '83', denominator: '84' }]
  },
  defense: {
    id: 'defense',
    label: 'Defense',
    stats: [
      stat(99, 'Sacks', 'SCK'),
      stat(95, 'Interceptions', 'INT'),
      stat(96, 'Fumble recoveries', 'FR'),
      stat(106, 'Forced fumbles', 'FF'),
      stat(97, 'Blocked kicks', 'BLK'),
      stat(98, 'Safeties', 'SFTY'),
      stat(105, 'Defensive/ST TDs', 'TD'),
      stat(103, 'INT return TD', 'INT TD'),
      stat(104, 'Fumble return TD', 'FUM TD'),
      stat(101, 'Kick return TD', 'KR TD'),
      stat(102, 'Punt return TD', 'PR TD'),
      stat(120, 'Points allowed', 'PA'),
      stat(127, 'Yards allowed', 'YA'),
      stat(109, 'Total tackles', 'TKL'),
      stat(113, 'Passes defensed', 'PD')
    ],
    derived: []
  }
});

/**
 * Which groups a position shows, in reading order. A position not listed shows
 * nothing rather than a guess.
 */
export const GROUPS_BY_POSITION = Object.freeze({
  QB: ['passing', 'rushing', 'ballSecurity'],
  RB: ['rushing', 'receiving', 'ballSecurity'],
  WR: ['receiving', 'rushing', 'ballSecurity'],
  TE: ['receiving', 'rushing', 'ballSecurity'],
  K: ['kicking'],
  'D/ST': ['defense']
});

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** The catalog groups for a position, as group objects. */
export function groupsFor(position) {
  return (GROUPS_BY_POSITION[position] ?? []).map((id) => STAT_GROUPS[id]);
}

/** Every catalog stat id a position shows. */
function idsFor(position) {
  return groupsFor(position).flatMap((group) => group.stats.map((s) => s.id));
}

/**
 * One week's catalog figures for a position: `{ [statId]: number }` for each of
 * the position's named ids present in the breakdown. Null when there is no
 * breakdown at all — that week's categories are unknown, not zero. A breakdown
 * that carries none of the position's ids is `{}`: known, and empty.
 */
export function statLine(breakdown, position) {
  if (!breakdown || typeof breakdown !== 'object') return null;
  const line = {};
  for (const id of idsFor(position)) {
    if (!Object.hasOwn(breakdown, id)) continue;
    const value = Number(breakdown[id]);
    if (Number.isFinite(value)) line[id] = value;
  }
  return line;
}

const ratio = (numerator, denominator) =>
  isNumber(numerator) && isNumber(denominator) && denominator > 0 ? numerator / denominator : null;

/**
 * A span of weeks, summed by group: each stat's total and per-game figure, and
 * the group's derived ratios.
 *
 * Only appeared weeks with a breakdown count, and they are also the per-game
 * denominator. A stat absent from every counted week has no row; a group whose
 * every total is absent or 0 is dropped, so a quarterback with no receptions
 * has no Receiving block, and a running back who never fumbled has no Ball
 * security block. A derived ratio with a zero denominator is left out.
 *
 * Accepts week lines carrying `statBreakdown` (raw) or `stats` (already a
 * `statLine`), and `actualPoints` for the appeared rule.
 *
 * @returns {Array<{ group: string, label: string, games: number,
 *   rows: Array<{ id, label, short, format, total, perGame }>,
 *   derived: Array<{ id, label, format, value }> }>}
 */
export function sumStatLines(lines = [], position) {
  const counted = [];
  for (const line of lines) {
    if (!line || !appeared(line)) continue;
    const stats = line.stats !== undefined && line.stats !== null
      ? line.stats
      : statLine(line.statBreakdown, position);
    if (stats) counted.push(stats);
  }
  if (!counted.length) return [];

  const games = counted.length;
  const totals = {};
  for (const stats of counted) {
    for (const [id, value] of Object.entries(stats)) {
      if (!isNumber(value)) continue;
      totals[id] = (totals[id] ?? 0) + value;
    }
  }

  const byGroup = [];
  for (const group of groupsFor(position)) {
    const rows = group.stats
      .filter((s) => isNumber(totals[s.id]))
      .map((s) => ({ ...s, total: totals[s.id], perGame: totals[s.id] / games }));
    if (!rows.some((row) => row.total !== 0)) continue;
    const derived = group.derived
      .map(({ id, label, format, numerator, denominator }) => ({
        id,
        label,
        format,
        value: ratio(totals[numerator], totals[denominator])
      }))
      .filter((d) => d.value !== null);
    byGroup.push({ group: group.id, label: group.label, games, rows, derived });
  }
  return byGroup;
}

/** A figure for a sentence: whole numbers bare, anything else to one decimal. */
function figure(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * One week in a few words, for the best and worst games lists: "24 car, 148
 * yds, 2 TD". Each position says what it is judged on, and a zero is left out
 * unless it is the headline (a quarterback's yards, a kicker's attempts).
 *
 * Touchdowns for a skill player are `getScoredTouchdownCount` — run and caught,
 * never thrown — so the summary agrees with the TD parlay about what scoring
 * one means; a quarterback's passing TDs are said as passing TDs.
 *
 * @param {object} line a week line with `statBreakdown` (or `stats`)
 * @param {string} [position] defaults to `line.position`
 * @returns {string|null} null without a breakdown or with nothing to say
 */
export function summarizeLine(line, position = line?.position) {
  if (!line) return null;
  const stats = line.stats ?? statLine(line.statBreakdown, position);
  if (!stats) return null;
  const has = (id) => isNumber(stats[id]);
  const get = (id) => (has(id) ? stats[id] : 0);
  const parts = [];

  const rushing = () => {
    if (!has('23') && !has('24')) return null;
    return { carries: get('23'), yards: get('24') };
  };
  const receiving = () => {
    if (!has('53') && !has('42')) return null;
    return { receptions: get('53'), yards: get('42') };
  };

  if (position === 'QB') {
    if (has('0') || has('1')) parts.push(`${figure(get('1'))}/${figure(get('0'))}`);
    if (has('3')) parts.push(`${figure(get('3'))} pass yds`);
    if (get(ESPN_STAT_IDS.PASSING_TD) > 0) parts.push(`${figure(get(ESPN_STAT_IDS.PASSING_TD))} pass TD`);
    if (get('20') > 0) parts.push(`${figure(get('20'))} INT`);
    if (get('24') !== 0) parts.push(`${figure(get('24'))} rush yds`);
    if (get(ESPN_STAT_IDS.RUSHING_TD) > 0) parts.push(`${figure(get(ESPN_STAT_IDS.RUSHING_TD))} rush TD`);
  } else if (position === 'RB' || position === 'WR' || position === 'TE') {
    const rush = rushing();
    const rec = receiving();
    // Yards say whose they are only when both kinds are in the sentence.
    const both = rush && rec && rush.carries > 0 && rec.receptions > 0;
    const rushPart = rush && (rush.carries > 0 || rush.yards !== 0)
      ? `${figure(rush.carries)} car, ${figure(rush.yards)} ${both ? 'rush yds' : 'yds'}`
      : null;
    const recPart = rec && (rec.receptions > 0 || rec.yards !== 0)
      ? `${figure(rec.receptions)} rec, ${figure(rec.yards)} ${both ? 'rec yds' : 'yds'}`
      : null;
    const ordered = position === 'RB' ? [rushPart, recPart] : [recPart, rushPart];
    parts.push(...ordered.filter(Boolean));
    const touchdowns = getScoredTouchdownCount(line.statBreakdown ?? stats);
    if (touchdowns > 0) parts.push(`${figure(touchdowns)} TD`);
  } else if (position === 'K') {
    if (has('83') || has('84')) parts.push(`${figure(get('83'))}/${figure(get('84'))} FG`);
    if (get('74') > 0) parts.push(`${figure(get('74'))} from 50+`);
    if (has('86') || has('87')) parts.push(`${figure(get('86'))}/${figure(get('87'))} XP`);
  } else if (position === 'D/ST') {
    if (get('99') > 0) parts.push(`${figure(get('99'))} sck`);
    if (get('95') > 0) parts.push(`${figure(get('95'))} INT`);
    if (get('96') > 0) parts.push(`${figure(get('96'))} FR`);
    if (get('105') > 0) parts.push(`${figure(get('105'))} TD`);
    if (has('120')) parts.push(`${figure(get('120'))} PA`);
  }

  return parts.length ? parts.join(', ') : null;
}
