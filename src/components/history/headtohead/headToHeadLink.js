/**
 * The link to two franchises' head-to-head detail in History:
 * `/history?tab=headtohead&franchise1=<id>&franchise2=<id>`.
 *
 * Franchise ids, not names: an id is an opaque uuid, so the URL says nothing
 * about who is in the league to anyone it is shared with, and a name would
 * have to be masked or not before it could be written at all.
 * `LeagueHistoryManager` reads both and opens `MatchupDetail` with franchise 1
 * on the left. One definition, so the writer and the reader cannot disagree.
 */

import { HISTORY_TAB_PARAM } from '../records/recordLink.js';

export const FRANCHISE1_PARAM = 'franchise1';
export const FRANCHISE2_PARAM = 'franchise2';

/**
 * @param {string} franchise1Id - shown on the left
 * @param {string} franchise2Id
 */
export function headToHeadPath(franchise1Id, franchise2Id) {
  const params = new URLSearchParams({
    [HISTORY_TAB_PARAM]: 'headtohead',
    [FRANCHISE1_PARAM]: franchise1Id,
    [FRANCHISE2_PARAM]: franchise2Id
  });
  return `/history?${params.toString()}`;
}
