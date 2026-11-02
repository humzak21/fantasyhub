/**
 * Which rows of the record book are in a top five, and which of those are new.
 *
 * One definition for the two surfaces that ask: the Records tab highlights a
 * row new to a top five over the last two seasons, and the home page's carousel
 * asks the same of the latest scored week (`utils/home/records.js`). Both rank
 * through `topFive` and compare through `rowIdentity`.
 *
 * Apart from `utils/recordBook/index.js` because it reads the catalog: the
 * engine computes rows and knows nothing of how the Records tab ranks them.
 *
 * Pure.
 */

import { buildRecordBook, rankRows, recordRows, recordSetYear } from './index.js';
import { RECORDS, hidesZero } from '../../src/components/history/records/recordCatalog.js';

export const TOP = 5;

/**
 * Who or what a row is, independent of its value or place, so the same
 * achievement can be found in two books. A streak is keyed on where it began:
 * one still running keeps its start as it grows.
 */
export function rowIdentity(record, row) {
  switch (record.kind) {
    case 'franchise':
      return `f:${row.franchiseId}`;
    case 'teamSeason':
      return `t:${row.teamId}`;
    case 'game':
      return `g:${row.teamId}:${row.week}`;
    case 'streak':
      return `s:${row.franchiseId}:${row.start?.year}:${row.start?.week}`;
    case 'seasonStreak':
      return `ss:${row.franchiseId}:${row.startYear}`;
    case 'pair':
      return `p:${[row.franchiseId, row.partnerFranchiseId].sort().join(':')}:${row.year ?? ''}`;
    case 'bid':
      return `b:${row.franchiseId}:${row.year}:${row.week}:${row.playerName ?? ''}`;
    case 'leagueWeek':
      return `lw:${row.year}:${row.week}`;
    case 'leagueSeason':
      return `ls:${row.year}`;
    case 'lock':
      return `l:${record.data}:${row.year}`;
    default:
      return `x:${row.franchiseId ?? ''}:${row.teamId ?? ''}:${row.year ?? ''}:${row.week ?? ''}`;
  }
}

/**
 * Every row placed in a record's top five, across all seasons, ranked the way
 * its card ranks.
 *
 * A place, not a position: ties share a place (`rankRows`), so this can be more
 * than five rows, and the extra ones are the newest. A tie lists the earlier
 * achievement first, so cutting at five rows is what drops a new row that ties
 * its way in.
 *
 * @param {object} book from `buildRecordBook`
 * @param {object} record from the catalog
 * @param {string} [phase] a game record's phase; the regular season is the record proper
 */
export function topFive(book, record, phase = 'regular') {
  return rankRows(
    recordRows(book, record.scope, record.data, { phase: record.phases ? phase : null }),
    { direction: record.direction, hideZero: hidesZero(record) }
  ).filter((row) => row.rank <= TOP);
}

/**
 * Every (record, row) placed in its record's top five, across the whole book.
 *
 * @returns {Array<{ record: object, row: object, rank: number, key: string }>}
 */
export function topFiveEntries(book, catalog = RECORDS) {
  if (!book) return [];
  return catalog.flatMap((record) =>
    topFive(book, record).map((row) => ({
      record,
      row,
      rank: row.rank,
      key: `${record.id}|${rowIdentity(record, row)}`
    }))
  );
}

/**
 * The source as it stood going into `year`: every season before it, and
 * nothing of that year or after, transactions included. A week cannot be
 * subtracted from a season's transaction counts, but a whole season can.
 */
export function beforeSeason(source, year) {
  const seasons = (source?.seasons ?? []).filter((season) => season.year < year);
  const ids = new Set(seasons.map((season) => season.id));
  const kept = (rows) => (rows ?? []).filter((row) => ids.has(row.seasonId));
  return {
    ...source,
    seasons,
    teams: kept(source?.teams),
    games: kept(source?.games),
    transactions: kept(source?.transactions),
    trades: kept(source?.trades),
    bids: kept(source?.bids),
    lineups: kept(source?.lineups)
  };
}

/**
 * The two books the Records tab compares, from one source: the book as it
 * stands, and the book going into the league's recent seasons. `before` is null
 * when no season came first, since a league with no earlier book has nothing to
 * enter.
 *
 * @returns {{ book: object, before: object|null }}
 */
export function buildRecordBooks(source) {
  const book = buildRecordBook(source);
  const firstRecent = Math.min(...book.recentYears);
  const hasEarlier = (source?.seasons ?? []).some((season) => season.year < firstRecent);
  return { book, before: hasEarlier ? buildRecordBook(beforeSeason(source, firstRecent)) : null };
}

/**
 * The rows of one record that are new to its top five, as `rowIdentity` values.
 *
 * - A row with a moment (`recordSetYear`: a team-season, a game, a bid, a week,
 *   a streak by the season it ended in) is new when that moment is one of the
 *   book's recent seasons.
 * - A row with no moment (a career total, an all-time trade pair) only ever
 *   grows, so it was never set in a year. It is new when it has entered the top
 *   five in those seasons: in it now, and not in it in `before`. A career
 *   already there stays unmarked however far it climbs, or every leader would be
 *   marked every week.
 *
 * Always measured on the whole board, so a row keeps its mark with one season
 * picked, where the card ranks it only against that season.
 *
 * @param {object} record from the catalog
 * @param {{ book: object, before: object|null, phase?: string }} books
 * @returns {Set<string>}
 */
export function newRowIds(record, { book, before, phase = 'regular' }) {
  const recentYears = book?.recentYears ?? [];
  const hadPlace = new Set(
    before ? topFive(before, record, phase).map((row) => rowIdentity(record, row)) : []
  );

  const ids = new Set();
  for (const row of book ? topFive(book, record, phase) : []) {
    const id = rowIdentity(record, row);
    const year = recordSetYear(row);
    const isNew = year != null ? recentYears.includes(year) : Boolean(before) && !hadPlace.has(id);
    if (isNew) ids.add(id);
  }
  return ids;
}
