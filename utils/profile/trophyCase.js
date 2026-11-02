/**
 * What goes in a franchise's trophy case: its titles, its division wins and
 * every record it holds. Pure, so the rules are tested without the page.
 */

import { recordRows } from '../recordBook/index.js';
import { rankRows } from '../recordBook/rank.js';
import { RECORDS, hidesZero } from '../../src/components/history/records/recordCatalog.js';

const number = (value) => Number(value ?? 0);

const winPct = (row) => {
  const games = number(row.wins) + number(row.losses) + number(row.ties);
  return games > 0 ? (number(row.wins) + number(row.ties) / 2) / games : 0;
};

/** The canonical standings sort: win % desc, points for desc, points against asc. */
const byStanding = (a, b) =>
  winPct(b) - winPct(a) ||
  number(b.points_for) - number(a.points_for) ||
  number(a.points_against) - number(b.points_against);

/**
 * Who won each division in each completed season: the best regular-season
 * record in it, by the sort `computeSeeds` and `get_standings_by_division` use.
 * A season in progress has no division winner yet, so it gives no title.
 *
 * @param {object} source - `history.getDivisionTitleSource()`
 * @returns {Array<{ franchiseId: string, year: number, divisionName: string, teamId: string, teamName: string, wins: number, losses: number, ties: number }>}
 *   newest season first
 */
export function deriveDivisionTitles({ standings = [], divisions = [], completedSeasonIds = [] } = {}) {
  const completed = new Set(completedSeasonIds);
  const names = new Map(divisions.map((division) => [division.id, division.name]));

  const groups = new Map();
  for (const row of standings) {
    if (!completed.has(row.season_id) || !row.division_id) continue;
    if (number(row.wins) + number(row.losses) + number(row.ties) === 0) continue;
    const key = `${row.season_id}|${row.division_id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()]
    .map((rows) => {
      const [winner] = [...rows].sort(byStanding);
      return {
        franchiseId: winner.franchise_id,
        year: winner.season_year,
        divisionName: names.get(winner.division_id) ?? 'Division',
        teamId: winner.team_id,
        teamName: winner.team_name,
        wins: number(winner.wins),
        losses: number(winner.losses),
        ties: number(winner.ties)
      };
    })
    .sort((a, b) => b.year - a.year || a.divisionName.localeCompare(b.divisionName));
}

/** One franchise's finals, from its own season history, newest first. */
export function finalsOf(seasonHistory = []) {
  const seasons = [...seasonHistory].sort((a, b) => (b.season?.year ?? 0) - (a.season?.year ?? 0));
  return {
    titles: seasons.filter((season) => season.playoff_finish === 'champion'),
    runnerUps: seasons.filter((season) => season.playoff_finish === '2nd')
  };
}

/**
 * Every record a franchise is #1 on, good or bad: the record book has no
 * best/dubious split, and neither does this. A tie for #1 is held. Game
 * records read the regular season, which is the record proper, as the home
 * page's cards do. A record the franchise has several #1 rows on (its two best
 * weeks tied) appears once, with each row.
 *
 * @returns {Array<{ record: object, rows: object[], shared: boolean }>} in catalog order
 */
export function recordsHeldBy(book, franchiseId, catalog = RECORDS) {
  if (!book || !franchiseId) return [];

  const held = [];
  for (const record of catalog) {
    const ranked = rankRows(
      recordRows(book, record.scope, record.data, { phase: record.phases ? 'regular' : null }),
      { direction: record.direction, hideZero: hidesZero(record) }
    );
    const leaders = ranked.filter((row) => row.rank === 1);
    const rows = leaders.filter(
      (row) => row.franchiseId === franchiseId || row.partnerFranchiseId === franchiseId
    );
    if (rows.length === 0) continue;
    held.push({
      record,
      rows,
      shared: leaders.some(
        (row) => row.franchiseId !== franchiseId && row.partnerFranchiseId !== franchiseId
      )
    });
  }
  return held;
}
