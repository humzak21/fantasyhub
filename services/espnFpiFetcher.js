/**
 * ESPN's Football Power Index, raw. Read-only, no credentials.
 *
 * Like `espnNflScheduleFetcher.js`, this asks a question about the NFL rather
 * than about our league, so it takes no cookies and no league id. It is a
 * different ESPN surface, though — `site.web.api.espn.com`, not the fantasy v3
 * API — and just as undocumented. Verified auth-free on 2026-09-01: plain GET,
 * no headers beyond Accept.
 *
 * ESPN serves the *current* FPI only; there is no historical endpoint. The
 * weekly snapshots in `nfl_team_ratings` are what make a past week's power
 * ranking reproducible. If this endpoint ever disappears, the documented
 * fallback is nflverse's `nfldata` standings CSVs (results-based `sos`/`sov`,
 * keyed by abbreviation like this payload) — a crosswalk this codebase has
 * already half-written in `services/espnFpiMapper.js`.
 *
 * Nothing here parses or writes. `services/espnFpiMapper.js` turns the payload
 * into rows and `services/db/nflTeamRatings.js` stores them, the same split as
 * the schedule and player-stats pipelines.
 */

const POWER_INDEX_URL =
  'https://site.web.api.espn.com/apis/fitt/v3/sports/football/nfl/powerindex?region=us&lang=en';

/**
 * The full power-index payload, unedited.
 *
 * The whole payload rather than just `teams`, because the per-team `values`
 * arrays only mean anything zipped against the top-level `categories[].names`
 * — the mapper needs both halves, and a fetcher that edits its own payload
 * makes the raw response untestable.
 *
 * @param {{ fetchImpl?: Function }} [options] injection seam for tests
 * @returns {Promise<object>} the raw payload: `{ teams, categories, currentSeason, lastUpdated, … }`
 */
export async function fetchNflPowerIndex({ fetchImpl = fetch } = {}) {
  const response = await fetchImpl(POWER_INDEX_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(
      `ESPN power index request failed: ${response.status} - ${response.statusText}`
    );
  }

  const payload = await response.json();

  // An empty or missing teams array is never a real answer here — the NFL
  // always has 32 teams — so it means the shape changed, and returning it
  // would let the mapper report "no ratings" as though it were a fact.
  if (!Array.isArray(payload?.teams) || payload.teams.length === 0) {
    throw new Error('ESPN returned no teams in the power index; the payload shape has changed');
  }

  return payload;
}

export default fetchNflPowerIndex;
