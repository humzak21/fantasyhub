/**
 * Live NFL scoring, from ESPN's public site API. Read-only, no credentials.
 *
 * Like `espnFpiFetcher.js` and `espnNflScheduleFetcher.js`, this asks a question
 * about the NFL rather than about our league, so it takes no cookies and no
 * league id. It is a *third* ESPN surface — `site.api.espn.com`, the same one
 * that backs ESPN's own scoreboard page — and just as undocumented.
 *
 * Like the other two public fetchers, this runs server-side — in the
 * `parlay-live` edge function, not the browser. That is the whole point of the
 * live tracker's design: ESPN is called once, by the function, at most every 30
 * minutes and only during game windows, and every viewer reads the shared
 * result from `parlay_live_snapshot`. So there is no per-browser fan-out, no
 * CORS to depend on, and no way for the poll to scale with the audience.
 * Verified auth-free 2026-09-20: plain GET, no headers beyond Accept.
 *
 * Nothing here parses. `services/espnLiveScoreMapper.js` turns the payloads into
 * a per-pick status and is the pure, tested half — the same split as the
 * schedule, FPI and player-stats pipelines.
 */

const SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const SUMMARY_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

/**
 * The week's games, with each one's live status.
 *
 * A `week`/`year` pins the request to a specific slate; without them ESPN
 * returns the current week, which is what the live tracker wants during the
 * week in flight. `seasontype=2` is the regular season — the only part of the
 * calendar the parlay runs in.
 *
 * The `events` array is the shape guard: an empty array is a real answer for a
 * week with no games yet, but a *missing* key means the payload shape changed,
 * and returning `{ events: [] }` would report "no games" as though it were a
 * fact — the same rule the schedule and FPI fetchers apply to their own roots.
 *
 * @param {{ week?: number|null, year?: number|null, fetchImpl?: Function }} [options]
 * @returns {Promise<object>} the raw scoreboard payload
 */
export async function fetchNflScoreboard({ week = null, year = null, fetchImpl = fetch } = {}) {
  const params = new URLSearchParams();
  if (year) params.set('dates', String(year));
  if (week) {
    params.set('week', String(week));
    params.set('seasontype', '2');
  }
  const query = params.toString();
  const url = query ? `${SCOREBOARD_URL}?${query}` : SCOREBOARD_URL;

  const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });

  if (!response.ok) {
    throw new Error(`ESPN scoreboard request failed: ${response.status} - ${response.statusText}`);
  }

  const payload = await response.json();

  if (!Array.isArray(payload?.events)) {
    throw new Error('ESPN returned no events array in the scoreboard; the payload shape has changed');
  }

  return payload;
}

/**
 * One game's detail, including the live box score the TD counting reads.
 *
 * The whole payload is returned rather than just `boxscore`, so the mapper can
 * cross-check a scoring play against a box-score line if it ever needs to — a
 * fetcher that trims its own response makes the raw payload untestable.
 *
 * @param {string|number} eventId the scoreboard event id
 * @param {{ fetchImpl?: Function }} [options]
 * @returns {Promise<object>} the raw summary payload
 */
export async function fetchGameSummary(eventId, { fetchImpl = fetch } = {}) {
  if (!eventId) throw new Error('An event id is required');

  const url = `${SUMMARY_URL}?event=${encodeURIComponent(eventId)}`;
  const response = await fetchImpl(url, { method: 'GET', headers: { Accept: 'application/json' } });

  if (!response.ok) {
    throw new Error(
      `ESPN summary request failed for event ${eventId}: ${response.status} - ${response.statusText}`
    );
  }

  return response.json();
}
