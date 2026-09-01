/**
 * One week's stat line for a named handful of players, from ESPN.
 *
 * The narrow companion to `espnScheduleFetcher.js`, and it exists for exactly
 * one gap. `player_week_stats` is written from the matchup payload, which
 * carries only players who were *on a roster when the sync ran*. Somebody
 * dropped on Sunday night has no row for the week he just played — and the TD
 * parlay's whole point is that people pick fringe goal-line backs, who are
 * precisely the players who get dropped. Without this, those picks could never
 * be graded, and "no row" would have to stall forever.
 *
 * So this asks ESPN about specific `espn_player_id`s directly, through the
 * league-scoped `kona_player_info` view. League-scoped, therefore cookied: the
 * scoring it reports is this league's, which is the only scoring the parlay's
 * question is asked in. That is the opposite of `espnNflScheduleFetcher.js`,
 * which is public precisely because the NFL calendar is not ours.
 *
 * Nothing here parses. The returned entries carry the same `player.stats`
 * array the matchup payload does, so `findStatBreakdown` in
 * `services/espnPlayerStatsMapper.js` reads them unchanged — the predicates
 * that pick out "this week's actual, not a season total" are shared rather
 * than restated, because a second copy of them is a second thing to get wrong.
 */

const BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';

/**
 * ESPN caps what it will return for one filtered request. Well above the
 * fourteen picks a week this is called with; a batch larger than this is a
 * caller doing something other than grading a parlay.
 */
export const MAX_PLAYER_IDS = 50;

/**
 * Fetch a week's player entries for a specific set of ESPN player ids.
 *
 * The ids go in the `X-Fantasy-Filter` header rather than the query string —
 * that is ESPN's own convention for this view, and a request without the
 * filter returns the entire player universe.
 *
 * @param {object}   params
 * @param {string}   params.leagueId
 * @param {number}   params.seasonYear
 * @param {number}   params.week            scoring period to ask about
 * @param {number[]} params.espnPlayerIds
 * @param {string}   [params.espnS2]
 * @param {string}   [params.swid]
 * @param {Function} [params.fetchImpl]     injection seam for tests
 * @returns {Promise<Array>} the raw `players` entries, each with `.player.stats`
 */
export async function fetchPlayerWeekInfo({
  leagueId,
  seasonYear,
  week,
  espnPlayerIds = [],
  espnS2 = null,
  swid = null,
  fetchImpl = fetch
} = {}) {
  if (!leagueId) throw new Error('A league id is required');
  if (!seasonYear) throw new Error('A season year is required');
  if (!week) throw new Error('A week is required');

  const ids = [...new Set(espnPlayerIds.filter((id) => id != null).map(Number))];

  // No ids is a real answer, not an error: every pick already had a stats row.
  // Sending it would ask ESPN for the whole player universe.
  if (ids.length === 0) return [];

  if (ids.length > MAX_PLAYER_IDS) {
    throw new Error(
      `Refusing to request ${ids.length} players at once (max ${MAX_PLAYER_IDS}); batch the call`
    );
  }

  const url =
    `${BASE_URL}/${seasonYear}/segments/0/leagues/${leagueId}` +
    `?view=kona_player_info&scoringPeriodId=${week}`;

  const headers = {
    Accept: 'application/json',
    // The filter is a JSON *header*. `filterStatsForExternalIds` and friends
    // are not needed: `scoringPeriodId` above already narrows the stat array,
    // and the mapper's predicates narrow it again.
    'X-Fantasy-Filter': JSON.stringify({
      players: {
        filterIds: { value: ids },
        limit: ids.length
      }
    })
  };

  if (espnS2 && swid) {
    headers.Cookie = `espn_s2=${espnS2}; SWID=${swid}`;
  }

  const response = await fetchImpl(url, { method: 'GET', headers });

  if (!response.ok) {
    throw new Error(
      `ESPN player info request failed for ${seasonYear} week ${week}: ` +
      `${response.status} - ${response.statusText}`
    );
  }

  const payload = await response.json();
  const players = payload?.players;

  // An empty array is a real answer — ESPN may not know these ids. A missing
  // key is not: it means the shape changed, and returning [] would report
  // "nobody scored" as though it were a fact about the week. The grader treats
  // an absent stat line as "skip", never as "no touchdown", but only a throw
  // makes a shape change visible at all.
  if (!Array.isArray(players)) {
    throw new Error(
      `ESPN returned no players array for ${seasonYear} week ${week}; the payload shape has changed`
    );
  }

  return players;
}

export default fetchPlayerWeekInfo;
