/**
 * The NFL calendar, from ESPN. Read-only, and deliberately not part of
 * `espnScheduleFetcher.js`.
 *
 * That fetcher is league-scoped: it asks for *our* league's matchups, needs the
 * `espn_s2`/`SWID` cookies because the league is private, and every one of its
 * URLs carries a league id. This one asks a question about the NFL, which is
 * the same answer for everybody, and so takes no credentials and no league.
 * Keeping them apart is what stops a cookie-less environment from being unable
 * to read a public endpoint, and stops a public endpoint from being handed
 * cookies it has no business seeing.
 *
 * Verified auth-free on 2026-09-01 for every season 2020-2026: plain GET, no
 * cookies, no headers beyond Accept.
 *
 * If this endpoint ever disappears -- it is undocumented, like the rest of the
 * fantasy v3 API -- the documented fallback is nflverse
 * (https://nflreadr.nflverse.com), whose schedule CSVs refresh every five
 * minutes. It uses its own team and player id space, so adopting it means
 * writing a crosswalk; that is the cost, and it is the reason ESPN is first
 * choice rather than merely the incumbent.
 *
 * Nothing here parses or writes. `services/espnNflScheduleMapper.js` turns the
 * payload into rows and `services/db/nflSchedule.js` stores them, the same
 * split as the game and player-stats pipelines.
 */

const BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';

/**
 * Every pro team's season, as ESPN reports it.
 *
 * The `proTeamSchedules_wl` view returns `settings.proTeams[]`, each entry
 * carrying `{ id, abbrev, location, name, byeWeek, proGamesByScoringPeriod }`
 * where the last is `{ [week]: [game] }`. Note the array: ESPN models a week as
 * a list of games even though a team plays at most one, so callers must not
 * assume a single element.
 *
 * The 33rd entry is `id: 0` ("FA"), the free-agent pseudo-team, which has no
 * games. Filtering it is the mapper's job, not this function's — a fetcher that
 * edits its own payload makes the raw response untestable.
 *
 * @param {number} seasonYear e.g. 2026
 * @param {{ fetchImpl?: Function }} [options] injection seam for tests
 * @returns {Promise<Array>} the raw `settings.proTeams` array
 */
export async function fetchProTeamSchedules(seasonYear, { fetchImpl = fetch } = {}) {
  if (!seasonYear) throw new Error('A season year is required');

  const url = `${BASE_URL}/${seasonYear}?view=proTeamSchedules_wl`;

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(
      `ESPN pro schedule request failed for ${seasonYear}: ` +
      `${response.status} - ${response.statusText}`
    );
  }

  const payload = await response.json();
  const proTeams = payload?.settings?.proTeams;

  // An empty array is a real answer for a season ESPN has not published yet.
  // A missing key is not — it means the shape changed, and returning [] would
  // report "the NFL has no games this year" as though it were a fact.
  if (!Array.isArray(proTeams)) {
    throw new Error(
      `ESPN returned no settings.proTeams for ${seasonYear}; the payload shape has changed`
    );
  }

  return proTeams;
}

export default fetchProTeamSchedules;
