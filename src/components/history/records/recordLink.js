/**
 * The link to one record in the record book: `/history?tab=records&record=<id>`.
 *
 * `LeagueHistoryManager` reads `tab` to open Records and hands `record` to the
 * book, which scrolls that card into view and opens it — the way
 * `/teams?team=` and `/takes?take=` already work. One definition, so the home
 * page's record cards and the reader cannot disagree about the parameter.
 */

export const HISTORY_TAB_PARAM = 'tab';
export const RECORD_PARAM = 'record';

/** @param {string} recordId - a `RECORDS` id */
export function recordPath(recordId) {
  const params = new URLSearchParams({ [HISTORY_TAB_PARAM]: 'records', [RECORD_PARAM]: recordId });
  return `/history?${params.toString()}`;
}
