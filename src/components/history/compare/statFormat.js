/**
 * How a comparison stat reads — in the value list and tooltips, and in
 * shorter form on an axis. The catalog (`utils/statComparison/catalog.js`)
 * names a `format`; this is the only place that knows what each one looks like.
 *
 *   int         a count: "7" (averaged per season: "3.5")
 *   signedInt   wins minus losses: "+3"
 *   half        all-play wins, which come in halves: "41.5"
 *   pct         0-100: "62.5%"
 *   points      "1,432.6"
 *   score       one game's score, to the hundredth as ESPN keeps it: "168.04"
 *   signedPoints "+12.4"
 *   wins        luck, in wins: "+1.25"
 *   rank        a place, or an average place: "3rd" / "4.5"
 *   money       "$240"
 */

import {
  EMPTY,
  formatDelta,
  formatOrdinal,
  formatPct,
  formatPoints,
  formatScore
} from '../../../utils/format';

export function formatStatValue(stat, value, { averaged = false } = {}) {
  if (value == null || !Number.isFinite(value)) return EMPTY;

  switch (stat?.format) {
    case 'int':
      return averaged ? formatPoints(value, 1) : formatPoints(value, 0);
    case 'signedInt':
      return formatDelta(value, averaged ? 1 : 0);
    case 'half':
      return formatPoints(value, Number.isInteger(value) ? 0 : 1);
    case 'pct':
      return formatPct(value);
    case 'score':
      return formatScore(value);
    case 'signedPoints':
      return formatDelta(value, 1);
    case 'wins':
      return formatDelta(value, 2);
    case 'rank':
      return Number.isInteger(value) ? formatOrdinal(value) : formatPoints(value, 1);
    case 'money':
      return `$${formatPoints(value, averaged ? 1 : 0)}`;
    case 'points':
    default:
      return formatPoints(value, 1);
  }
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** A tick label: short, and without the precision the value list carries. */
export function formatStatTick(stat, value) {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const number = abs >= 10000 ? compact.format(abs) : String(Math.round(abs * 10) / 10);
  const sign = value < 0 ? '−' : '';

  switch (stat?.format) {
    case 'pct':
      return `${sign}${number}%`;
    case 'money':
      return `${sign}$${number}`;
    case 'signedInt':
    case 'signedPoints':
    case 'wins':
      return value > 0 ? `+${number}` : `${sign}${number}`;
    default:
      return `${sign}${number}`;
  }
}
