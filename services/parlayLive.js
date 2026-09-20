/**
 * The parlay live tracker's decisions, kept pure so they can be tested without
 * a database, an edge runtime, or a network. The `parlay-live` edge function is
 * a thin wrapper around these.
 *
 * Three jobs, each a lever on "keep ESPN calls low and only when games are on":
 *
 *   1. `isLikelyGameWindow` — a *local* time check (no ESPN call) that says
 *      whether it is even worth looking. Outside these windows the function
 *      returns the last snapshot and calls nothing.
 *   2. `shouldRefresh` — the 30-minute clock. ESPN is pulled at most once per
 *      window per 30 minutes, shared across every viewer, so a busy Sunday is a
 *      couple of dozen refreshes, not one per person per minute.
 *   3. `planEventFetches` / `mergeLiveStatus` — fetch a game's box score only
 *      while it can still change. A game already recorded as final is not
 *      re-fetched; its stored TD count is carried forward. That is what keeps
 *      the per-refresh call count falling as the afternoon's games end.
 *
 * None of this touches fantasy stats or `scored_td`. It is TD-parlay status
 * only, and unofficial until the Tuesday grade.
 */

import {
  GAME_STATE,
  normalizeAbbrev,
  indexEventsByTeam,
  buildLiveStatus,
  anyGameLive
} from './espnLiveScoreMapper.js';

/** Pull ESPN at most this often while games are on. */
export const REFRESH_TTL_MS = 30 * 60 * 1000;

/**
 * When NFL games are worth polling for, in Eastern wall-clock time. `day` is
 * 0=Sunday … 6=Saturday; `startMin`/`endMin` are minutes past midnight ET.
 *
 * These are the league's usual windows — Thursday and Monday night, and the
 * Sunday slate. They are intentionally a touch generous on the tail (games run
 * long) and easy to extend: a Thanksgiving/Christmas afternoon slate, a
 * Sunday-morning international game (≈09:30 ET), or a late-season Saturday would
 * each be one more row here. Missing a slot is never *wrong* — it just means no
 * live overlay for it; the Tuesday grade still lands.
 */
export const GAME_WINDOWS = [
  { day: 4, startMin: 20 * 60, endMin: 24 * 60 }, // Thursday 20:00–23:59 ET
  { day: 0, startMin: 13 * 60, endMin: 24 * 60 }, // Sunday   13:00–23:59 ET
  { day: 1, startMin: 20 * 60, endMin: 24 * 60 }  // Monday   20:00–23:59 ET
];

/**
 * A `Date`'s Eastern weekday and minutes-past-midnight, via the runtime's own
 * time-zone database — so it is correct across the EDT→EST change without any
 * offset arithmetic here.
 */
export function etParts(now, timeZone = 'America/New_York') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[get('weekday')];
  // `hour12: false` renders midnight as '24' in some engines; fold it back to 0.
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));

  return { weekday, minutes: hour * 60 + minute };
}

/** Is `{ weekday, minutes }` inside any window? Pure, so it is the tested core. */
export function inWindow({ weekday, minutes }, windows = GAME_WINDOWS) {
  return windows.some(
    (w) => w.day === weekday && minutes >= w.startMin && minutes < w.endMin
  );
}

/** Is now inside a game window? A cheap local check, never an ESPN call. */
export function isLikelyGameWindow(now, windows = GAME_WINDOWS, timeZone) {
  return inWindow(etParts(now, timeZone), windows);
}

/**
 * Should ESPN be pulled right now?
 *
 * Only inside a window, and only if the last pull is at least the TTL old (or
 * there has never been one). Outside a window this is always false — the caller
 * serves the last snapshot untouched.
 */
export function shouldRefresh({ now, refreshedAt, inWindow: isIn, ttlMs = REFRESH_TTL_MS }) {
  if (!isIn) return false;
  if (!refreshedAt) return true;

  const last = new Date(refreshedAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= ttlMs;
}

/**
 * Which games to fetch a box score for this refresh.
 *
 * A game that has not kicked off has no box score, and a game already recorded
 * as final last time cannot gain a touchdown — so neither is fetched. Only live
 * games, and games newly final since the last refresh, are pulled. This is the
 * optimization that keeps the call count shrinking through a Sunday.
 *
 * @param {object} args
 * @param {Array<{ teamAbbreviation: string }>} args.picks
 * @param {object} args.scoreboard raw scoreboard payload
 * @param {Object<string,string>} [args.prevEventStates] eventId → last-seen state
 * @returns {string[]} distinct event ids to fetch
 */
export function planEventFetches({ picks = [], scoreboard, prevEventStates = {} }) {
  const byTeam = indexEventsByTeam(scoreboard);
  const ids = new Set();

  for (const pick of picks) {
    const event = byTeam.get(normalizeAbbrev(pick.teamAbbreviation));
    if (!event) continue;
    if (event.state === GAME_STATE.NOT_STARTED) continue;
    // Already final last time → its TDs are fixed; carry them forward instead.
    if (event.state === GAME_STATE.FINAL && prevEventStates[event.eventId] === GAME_STATE.FINAL) {
      continue;
    }
    ids.add(event.eventId);
  }

  return [...ids];
}

/**
 * The new snapshot: fresh status for the games we fetched, carried-forward
 * status for the finalized games we deliberately skipped, and the per-event
 * states the next refresh reads to decide what to skip.
 *
 * @param {object} args
 * @param {Array<{ id: string, espnPlayerId: string|number|null, teamAbbreviation: string }>} args.picks
 * @param {object} args.scoreboard raw scoreboard payload
 * @param {Object<string,object>} args.summariesByEvent event id → raw summary (only those fetched)
 * @param {{ status?: object }|null} [args.prev] the previous snapshot row
 * @returns {{ status: object, eventStates: Object<string,string>, live: boolean }}
 */
export function mergeLiveStatus({ picks = [], scoreboard, summariesByEvent = {}, prev = null }) {
  const byTeam = indexEventsByTeam(scoreboard);
  const prevStatus = prev?.status ?? {};

  // Fresh computation for every pick whose game we fetched (or that has no game).
  const status = buildLiveStatus({ picks, scoreboard, summariesByEvent });
  const eventStates = {};

  for (const pick of picks) {
    const event = byTeam.get(normalizeAbbrev(pick.teamAbbreviation));
    if (!event) continue;
    eventStates[event.eventId] = event.state;

    // A final game we chose not to re-fetch has no summary this round, so
    // `buildLiveStatus` scored it as unknown. Its real result was captured when
    // it was live — carry that forward rather than losing the touchdown.
    const skippedFinal =
      event.state === GAME_STATE.FINAL && !summariesByEvent[event.eventId] && prevStatus[pick.id];
    if (skippedFinal) {
      status[pick.id] = { ...prevStatus[pick.id], state: GAME_STATE.FINAL, detail: event.detail };
    }
  }

  return {
    status,
    eventStates,
    live: anyGameLive(scoreboard, picks.map((p) => p.teamAbbreviation))
  };
}
