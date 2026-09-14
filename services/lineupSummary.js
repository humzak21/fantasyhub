/**
 * One team's week, reduced to what the lineup records need.
 *
 * Pure. `upsertPlayerWeekStats` calls it per team with the rows it has just
 * mapped and stores the answer in `team_week_lineups`; the records read that
 * table, never the player rows. The two definitions it leans on are not
 * restated here:
 *
 *   * the starters' total, and whether it is still a projection, is
 *     `starterTotal` (`utils/lineupTotals.js`) — the same total Schedule and
 *     the pick'ems research header show;
 *   * the best legal lineup is `optimalLineupPoints`
 *     (`services/powerRankingCalculator.js`) — the same one the ranking's
 *     lineup-efficiency component uses.
 *
 * A week that is not settled has no summary. A projection is not a lineup
 * result, and storing one would count a Sunday-morning guess as a perfect
 * lineup.
 */

import { optimalLineupPoints } from './powerRankingCalculator.js';
import { isScoringStarter, starterTotal } from '../utils/lineupTotals.js';

const round2 = (value) => Math.round(value * 100) / 100;

/**
 * @param {object[]} rows one team's week: `{ lineupSlotId, rosterSlot, started,
 *   position, actualPoints, projectedPoints }`, bench and IR included — the
 *   optimal lineup is chosen from the whole roster.
 * @returns {{ starterPoints: number, optimalPoints: number, startersScoring: number } | null}
 */
export function summarizeTeamWeek(rows = []) {
  const starters = starterTotal(rows);
  if (starters.total == null || starters.isProjected) return null;

  const starterPoints = round2(starters.total);

  // The optimal lineup can never score less than the lineup that was started,
  // since that lineup was itself legal. If ESPN ever reports a start the
  // template cannot reproduce (a player in a slot his position is not eligible
  // for), the started total is the better lower bound — and storing less would
  // make the bench carry negative points.
  const optimalPoints = Math.max(round2(optimalLineupPoints(rows)), starterPoints);

  const startersScoring = rows
    .filter(isScoringStarter)
    .filter((row) => Number(row.actualPoints) > 0).length;

  return { starterPoints, optimalPoints, startersScoring };
}

export default summarizeTeamWeek;
