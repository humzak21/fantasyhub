/**
 * Which stat columns the game log shows for a position, in order.
 *
 * The ids come from `STAT_GROUPS` by group and short label, never typed here a
 * second time: the catalog is the one place an ESPN stat id is named.
 * `TD` for a skill player is the line's `touchdowns` (run and caught, via
 * `getScoredTouchdownCount`), the TD parlay's meaning of scoring one.
 */

import { STAT_GROUPS } from '../../../../utils/playerProfile/statCatalog.js';

function idOf(group, short) {
  const stat = STAT_GROUPS[group]?.stats.find((s) => s.short === short);
  if (!stat) throw new Error(`No ${short} in the ${group} stat group`);
  return stat;
}

/** One stat. */
const single = (group, short, header = short) => {
  const stat = idOf(group, short);
  return { key: `${group}.${stat.id}`, header, title: stat.label, ids: [stat.id] };
};
/** "made/attempted", one column. */
const pair = (group, madeShort, attShort, header) => {
  const made = idOf(group, madeShort);
  const att = idOf(group, attShort);
  return { key: `${group}.${made.id}/${att.id}`, header, title: `${made.label} / ${att.label}`, ids: [made.id, att.id], pair: true };
};
const TD = { key: 'td', header: 'TD', title: 'Touchdowns scored (rushing and receiving)', touchdowns: true };

export const GAME_LOG_STATS = Object.freeze({
  QB: [
    pair('passing', 'CMP', 'ATT', 'CMP/ATT'),
    single('passing', 'PASS YDS'),
    single('passing', 'PASS TD'),
    single('passing', 'INT'),
    single('rushing', 'RUSH YDS')
  ],
  RB: [
    single('rushing', 'CAR'),
    single('rushing', 'RUSH YDS'),
    single('receiving', 'REC'),
    single('receiving', 'REC YDS'),
    TD
  ],
  WR: [single('receiving', 'TGT'), single('receiving', 'REC'), single('receiving', 'REC YDS'), TD],
  TE: [single('receiving', 'TGT'), single('receiving', 'REC'), single('receiving', 'REC YDS'), TD],
  K: [pair('kicking', 'FGM', 'FGA', 'FGM/FGA'), single('kicking', 'XPM')],
  'D/ST': [single('defense', 'SCK'), single('defense', 'INT'), single('defense', 'TD'), single('defense', 'PA')]
});

/**
 * One week's figure for a stat column. A line with no breakdown is unknown
 * (null); a known breakdown that omits an id is a 0, because ESPN leaves a
 * category out when nothing happened in it.
 *
 * @returns {number|string|null} a number, "20/31" for a pair, or null
 */
export function statCell(line, spec) {
  if (spec.touchdowns) return line.touchdowns ?? null;
  if (!line.stats) return null;
  const values = spec.ids.map((id) => line.stats[id] ?? 0);
  if (spec.pair) return `${values[0]}/${values[1]}`;
  return values[0];
}

/** A postseason game's phase in a few letters, for the week cell's chip. */
export function shortPhase(phase) {
  if (!phase) return null;
  return {
    'Playoffs, first round': 'R1',
    Semifinal: 'Semi',
    Championship: 'Final',
    Consolation: 'Cons',
    'Placement game': 'Place',
    Bye: 'Bye'
  }[phase] ?? phase;
}
