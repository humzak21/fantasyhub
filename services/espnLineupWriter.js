/**
 * The one place this app changes anything on ESPN: a live roster read, and a
 * lineup swap on the way back. Every other ESPN call here is a GET.
 *
 * ESPN's write API is undocumented. The request below follows what other
 * projects report: a `ROSTER` transaction posted to `lm-api-writes`, with
 * `espn_s2` alone as the cookie, which is honoured for another team's lineup
 * when the cookie belongs to a league manager. Refusals come back as a 409
 * naming a `TRAN_*` code (`TRAN_LINEUP_LOCKED` is the common one). So a reply
 * is treated as a hint and never as proof: `scripts/autosub-watch.js` reads
 * the lineup back and only that decides whether the swap happened.
 *
 * The cookies must never reach an error message or a log line.
 */

import { ESPN_BENCH_SLOT } from './autosubPlanner.js';

const READ_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons';
const WRITE_URL = 'https://lm-api-writes.fantasy.espn.com/apis/v3/games/ffl/seasons';
const TIMEOUT_MS = 15_000;

/**
 * Every team's lineup right now, `Map(espnTeamId → Map(espnPlayerId → entry))`.
 * Throws rather than returning an empty map: a missing roster would read as
 * "this starter is no longer in the lineup", and the autosub would never fire.
 */
export async function fetchLiveRosters({ leagueId, seasonYear, week, espnS2 = null, swid = null, fetchImpl = fetch }) {
  const url = `${READ_URL}/${seasonYear}/segments/0/leagues/${leagueId}?view=mRoster&scoringPeriodId=${week}`;
  const headers = { Accept: 'application/json' };
  if (espnS2 && swid) headers.Cookie = `espn_s2=${espnS2}; SWID=${swid}`;

  const response = await fetchImpl(url, { method: 'GET', headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`ESPN roster read failed for week ${week}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload?.teams)) {
    throw new Error(`ESPN returned no teams for week ${week}; the payload shape has changed`);
  }

  return new Map(payload.teams.map((team) => [
    team.id,
    new Map((team.roster?.entries ?? []).map((entry) => {
      const player = entry.playerPoolEntry?.player;
      return [entry.playerId, {
        lineupSlotId: entry.lineupSlotId,
        injuryStatus: player?.injuryStatus ?? null,
        eligibleSlots: player?.eligibleSlots ?? []
      }];
    }))
  ]));
}

/** The transaction that moves `bench` into `slotId` and `starter` to the bench. */
export function buildLineupSwap({ teamId, week, starterEspnId, benchEspnId, slotId }) {
  return {
    isLeagueManager: false,
    teamId,
    type: 'ROSTER',
    scoringPeriodId: week,
    executionType: 'EXECUTE',
    items: [
      { playerId: starterEspnId, type: 'LINEUP', fromLineupSlotId: slotId, toLineupSlotId: ESPN_BENCH_SLOT },
      { playerId: benchEspnId, type: 'LINEUP', fromLineupSlotId: ESPN_BENCH_SLOT, toLineupSlotId: slotId }
    ]
  };
}

/** ESPN's refusal code from an error body, or the HTTP status. */
async function refusalCode(response) {
  try {
    const body = await response.json();
    return body?.details?.[0]?.type ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/**
 * Post a swap. Never throws, and a failure here is not the end of the story: a
 * timeout can still have landed, so the caller reads the lineup back either way.
 *
 * @returns {Promise<{ ok: boolean, detail: string|null }>}
 */
export async function postLineupSwap({ leagueId, seasonYear, espnS2, swap, fetchImpl = fetch }) {
  if (!espnS2) return { ok: false, detail: 'no ESPN_S2 cookie' };

  try {
    const response = await fetchImpl(`${WRITE_URL}/${seasonYear}/segments/0/leagues/${leagueId}/transactions/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `espn_s2=${espnS2}`,
        'x-fantasy-source': 'kona',
        'x-fantasy-platform': 'kona-PROD'
      },
      body: JSON.stringify(swap),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    return response.ok ? { ok: true, detail: null } : { ok: false, detail: await refusalCode(response) };
  } catch (error) {
    return { ok: false, detail: error.name === 'TimeoutError' ? 'timed out' : 'no response' };
  }
}
