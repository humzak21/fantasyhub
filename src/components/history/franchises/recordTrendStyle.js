/**
 * How each line on the record trend chart is coloured and named.
 *
 * Which dimension the hue carries depends on what the reader is comparing:
 *
 * - **One team:** the lines differ only by season, so the hue is the season's
 *   — its position in the league's calendar, so 2023 is the same colour on
 *   every franchise's profile.
 * - **Several teams:** the hue is the franchise's own (`teamChartColor`), the
 *   colour it wears in every other chart and table. Its seasons step down in
 *   opacity, newest brightest; the legend and tooltip name each one.
 */

import { chartColor } from '../../ui/chart';
import { teamChartColor } from '../../../utils/teamColors';

const OLDEST_OPACITY = 0.35;

/**
 * @param {{ key: string, franchiseId: string, year: number }[]} series
 * @param {{ year: number }[]} years  every league season, oldest first
 * @returns {Map<string, { stroke: string, strokeOpacity: number }>}
 */
export function trendSeriesStyles(series, years) {
  const styles = new Map();
  const franchiseIds = [...new Set(series.map((line) => line.franchiseId))];

  if (franchiseIds.length <= 1) {
    for (const line of series) {
      const yearIndex = Math.max(0, years.findIndex((entry) => entry.year === line.year));
      styles.set(line.key, { stroke: chartColor(yearIndex), strokeOpacity: 1 });
    }
    return styles;
  }

  for (const franchiseId of franchiseIds) {
    const lines = series
      .filter((line) => line.franchiseId === franchiseId)
      .sort((a, b) => b.year - a.year);
    const stroke = teamChartColor({ franchiseId });
    lines.forEach((line, rank) => {
      const strokeOpacity = lines.length === 1
        ? 1
        : 1 - (rank / (lines.length - 1)) * (1 - OLDEST_OPACITY);
      styles.set(line.key, { stroke, strokeOpacity });
    });
  }
  return styles;
}

/**
 * A line's name: just the season when one team is shown, just the team when
 * one season is, both otherwise.
 *
 * @param {{ franchiseId: string, year: number }} line
 * @param {{ teamCount: number, seasonCount: number, franchiseName: (id: string) => string }} context
 */
export function trendSeriesLabel(line, { teamCount, seasonCount, franchiseName }) {
  if (teamCount <= 1) return String(line.year);
  if (seasonCount <= 1) return franchiseName(line.franchiseId);
  return `${franchiseName(line.franchiseId)} · ${line.year}`;
}
