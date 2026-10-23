/**
 * The home page's records carousel, decided.
 *
 * Three kinds of card, all read off the record book the History tab builds
 * (`utils/recordBook`) and ranked the way its cards rank (`rankRows`, the
 * catalog's direction and zero rule):
 *
 * - **New this week** — a row in a record's top five now that was not in it
 *   before the most recent scored week. "Before" is the same book built from
 *   the same source with that week taken out (`withoutWeek`), compared by row
 *   identity. Season transaction *counts* (`transactions`) cannot be rolled
 *   back a week, so the records built on them are left out of this slot.
 * - **Record of the day** — one #1, chosen by a hash of the date over the
 *   sorted list of #1s, so every member sees the same one all day and nothing
 *   is stored.
 * - **Yours** — the viewer's franchise's best top-five place; among equal
 *   places the date picks, so it rotates.
 *
 * Pure: the component renders these and nothing else.
 */

import { buildRecordBook, rankRows, recordRows } from '../recordBook/index.js';
import { RECORDS, hidesZero } from '../../src/components/history/records/recordCatalog.js';

export const TOP = 5;

/**
 * Row sets built on `transactions` (season-level counts) or on the trade log
 * those counts mirror. A week cannot be subtracted from a season count, so a
 * "before" book would still contain it, and "new" would be meaningless.
 */
const TRANSACTION_DATA = new Set([
  'trades',
  'rosterMoves',
  'waiverClaims',
  'faabSpent',
  'tradePartners',
  'leagueTrades',
  'leagueRosterMoves',
  'leagueFaabSpent'
]);

export const canBeNew = (record) => !TRANSACTION_DATA.has(record.data);

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
    default:
      return `x:${row.franchiseId ?? ''}:${row.teamId ?? ''}:${row.year ?? ''}:${row.week ?? ''}`;
  }
}

/**
 * Every (record, row) placed in its record's top five, across the whole book.
 * Game records read the regular season, which is the record proper.
 *
 * @returns {Array<{ record: object, row: object, rank: number, key: string }>}
 */
export function topFiveEntries(book, catalog = RECORDS) {
  if (!book) return [];
  const entries = [];
  for (const record of catalog) {
    const rows = rankRows(
      recordRows(book, record.scope, record.data, { phase: record.phases ? 'regular' : null }),
      { direction: record.direction, hideZero: hidesZero(record), limit: TOP }
    );
    for (const row of rows) {
      if (row.rank > TOP) continue;
      entries.push({ record, row, rank: row.rank, key: `${record.id}|${rowIdentity(record, row)}` });
    }
  }
  return entries;
}

/**
 * The last scored regular-season week of the newest season that has one.
 *
 * @returns {{ year: number, seasonId: string, week: number } | null}
 */
export function latestScoredWeek(source) {
  const seasons = [...(source?.seasons ?? [])].sort((a, b) => b.year - a.year);
  for (const season of seasons) {
    const weeks = (source.games ?? [])
      .filter(
        (game) =>
          game.seasonId === season.id &&
          game.type === 'regular' &&
          Number.isFinite(game.team1Score) &&
          Number.isFinite(game.team2Score)
      )
      .map((game) => game.week);
    if (weeks.length > 0) return { year: season.year, seasonId: season.id, week: Math.max(...weeks) };
  }
  return null;
}

/** The source as it stood before `week` of `seasonId` was played. */
export function withoutWeek(source, seasonId, week) {
  const notThatWeek = (row, weekOf) => !(row.seasonId === seasonId && weekOf(row) === week);
  return {
    ...source,
    games: (source.games ?? []).filter((row) => notThatWeek(row, (r) => r.week)),
    lineups: (source.lineups ?? []).filter((row) => notThatWeek(row, (r) => r.week)),
    bids: (source.bids ?? []).filter((row) => notThatWeek(row, (r) => r.scoringPeriod)),
    trades: (source.trades ?? []).filter((row) => notThatWeek(row, (r) => r.week))
  };
}

/**
 * The two books the carousel compares, from one source. The `select` of the
 * home page's record-book query, so the second build runs once per fetch.
 *
 * @returns {{ book: object, before: object|null, latest: object|null }}
 */
export function buildHomeRecordBooks(source) {
  const book = buildRecordBook(source);
  const latest = latestScoredWeek(source);
  const before = latest ? buildRecordBook(withoutWeek(source, latest.seasonId, latest.week)) : null;
  return { book, before, latest };
}

/**
 * Top-five entries now that were not top five before the latest week, best
 * place first.
 */
export function newRecords(bookNow, bookBefore, catalog = RECORDS) {
  if (!bookNow || !bookBefore) return [];
  const eligible = catalog.filter(canBeNew);
  const before = new Set(topFiveEntries(bookBefore, eligible).map((entry) => entry.key));
  return topFiveEntries(bookNow, eligible)
    .filter((entry) => !before.has(entry.key))
    .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
}

/** A small, stable string hash (FNV-1a). Same date, same answer, everywhere. */
export function hashString(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** `YYYY-MM-DD` in the viewer's local calendar. */
export function dateKeyOf(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const pick = (list, dateKey) =>
  list.length === 0 ? null : list[hashString(dateKey) % list.length];

/** One #1 (outright or tied), the same for everyone all day. */
export function recordOfTheDay(book, catalog = RECORDS, dateKey = dateKeyOf()) {
  const leaders = topFiveEntries(book, catalog)
    .filter((entry) => entry.rank === 1)
    .sort((a, b) => a.key.localeCompare(b.key));
  return pick(leaders, dateKey);
}

const involves = (row, franchiseId) =>
  row.franchiseId === franchiseId || row.partnerFranchiseId === franchiseId;

/**
 * The viewer's franchise's best top-five place, rotating by date among equal
 * places; null when it holds none.
 */
export function yourRecord(book, catalog = RECORDS, franchiseId, dateKey = dateKeyOf()) {
  if (!franchiseId) return null;
  const mine = topFiveEntries(book, catalog).filter((entry) => involves(entry.row, franchiseId));
  if (mine.length === 0) return null;
  const best = Math.min(...mine.map((entry) => entry.rank));
  return pick(
    mine.filter((entry) => entry.rank === best).sort((a, b) => a.key.localeCompare(b.key)),
    dateKey
  );
}

/**
 * The carousel's cards, in order: what is new, then the record of the day,
 * then the viewer's own. A franchise with nothing in any top five gets no
 * "yours" card (the record of the day already stands in its place), and a
 * card never repeats an entry shown before it.
 *
 * @returns {Array<{ kind: 'new'|'day'|'yours', record: object, row: object, rank: number, key: string }>}
 */
export function homeRecordCards({ book, before, franchiseId = null, dateKey = dateKeyOf(), catalog = RECORDS, maxNew = 6 }) {
  if (!book) return [];
  const cards = newRecords(book, before, catalog)
    .slice(0, maxNew)
    .map((entry) => ({ kind: 'new', ...entry }));
  const seen = new Set(cards.map((card) => card.key));

  const day = recordOfTheDay(book, catalog, dateKey);
  if (day && !seen.has(day.key)) {
    cards.push({ kind: 'day', ...day });
    seen.add(day.key);
  }

  const yours = yourRecord(book, catalog, franchiseId, dateKey);
  if (yours && !seen.has(yours.key)) cards.push({ kind: 'yours', ...yours });

  return cards;
}
