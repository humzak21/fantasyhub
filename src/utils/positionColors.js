/**
 * The colour of a lineup slot.
 *
 * This map existed twice — in ScheduleManager with `dark:` variants and in
 * TeamsAndRosters without them — so the same QB chip was styled two different
 * ways on two pages, and the Teams one only rendered at all because a
 * dark-mode remap in globals.css happens to catch `bg-red-100`.
 *
 * Positions are a categorical scale, not a status one: red for QB says nothing
 * about the quarterback being bad. These are the chart palette's hues, used at
 * low alpha so a roster list of a dozen chips stays quiet.
 */
const POSITION_COLORS = {
  QB: 'bg-chart-6/15 text-chart-6',
  RB: 'bg-chart-3/15 text-chart-3',
  WR: 'bg-chart-2/15 text-chart-2',
  TE: 'bg-chart-1/15 text-chart-1',
  K: 'bg-chart-10/15 text-chart-10',
  'D/ST': 'bg-chart-7/15 text-chart-7',
  FLEX: 'bg-chart-5/15 text-chart-5',
};

const FALLBACK = 'bg-muted text-muted-foreground';

/**
 * @param {string} position - QB, RB, WR, TE, K, D/ST, FLEX, or anything else
 * @returns {string} Tailwind classes for a position chip
 */
export function getPositionColor(position) {
  return POSITION_COLORS[position] || FALLBACK;
}

export { POSITION_COLORS };
