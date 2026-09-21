/**
 * Live TD tracking: the pure half of the parlay's live tracker.
 *
 * Given ESPN's public scoreboard and the summaries of the games in it, it
 * answers one question per pick — "has this player scored a rushing or
 * receiving touchdown yet, and is their game live?" — and nothing about our
 * league. `services/espnLiveScoreFetcher.js` does the fetching; this does the
 * deciding, so it can be tested against a fixture with no network.
 *
 * Two rules here are the same rules the weekly grader lives by, restated for a
 * different payload shape:
 *
 *   - **Thrown is not scored.** Only the box score's `rushing` and `receiving`
 *     TD columns count; `passing` is excluded, exactly as `getScoredTouchdownCount`
 *     excludes it. A quarterback who has thrown four has scored none.
 *   - **Unknown is not zero.** A game with no box score yet (kickoff pending, or
 *     a payload that dropped it) reports `tds: null`, not `tds: 0`. The UI shows
 *     "not started" for that, never "no TD".
 *
 * This is a *live, unofficial* signal by construction. It never writes anything,
 * and it never touches `scored_td` — the Tuesday sync's grader remains the only
 * writer of the official grade, and the official grade always wins in the UI.
 */

/** A pick's game state, from the scoreboard's `status.type.state`. */
export const GAME_STATE = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  FINAL: 'final',
  /** The player's team is not in this slate — a bye, or the wrong week loaded. */
  NO_GAME: 'no_game'
};

/**
 * Canonical NFL team abbreviations, for the handful that differ between ESPN's
 * fantasy space (`players.team_abbreviation`) and its site-API scoreboard.
 * Applied to both sides so a match never fails on a spelling — the same idea as
 * the `WSH→WAS` alias in `espnFpiMapper.js`, in the other direction.
 */
const ABBREV_ALIAS = { WAS: 'WSH', JAC: 'JAX', LA: 'LAR', OAK: 'LV', SD: 'LAC', STL: 'LAR' };

/** Normalize an abbreviation to the one both payloads agree on. */
export function normalizeAbbrev(abbrev) {
  if (!abbrev) return null;
  const upper = String(abbrev).trim().toUpperCase();
  return ABBREV_ALIAS[upper] ?? upper;
}

/** Map ESPN's `status.type.state` (`pre`/`in`/`post`) to our GAME_STATE. */
function stateFromStatus(status) {
  const state = status?.type?.state;
  if (state === 'in') return GAME_STATE.IN_PROGRESS;
  if (state === 'post') return GAME_STATE.FINAL;
  return GAME_STATE.NOT_STARTED;
}

/**
 * `{ normalizedAbbrev → { eventId, state, detail } }`.
 *
 * Both teams in a game point at the same event, so a pick on either side finds
 * it with one lookup. `detail` is the short status line the card shows —
 * "7:10 - 1st Quarter", "Final", "Sun 1:00 PM".
 */
export function indexEventsByTeam(scoreboard) {
  const byTeam = new Map();

  for (const event of scoreboard?.events ?? []) {
    const competition = event?.competitions?.[0];
    if (!competition) continue;

    const entry = {
      eventId: String(event.id),
      state: stateFromStatus(event.status),
      detail: event.status?.type?.shortDetail ?? event.status?.type?.detail ?? null
    };

    for (const competitor of competition.competitors ?? []) {
      const abbrev = normalizeAbbrev(competitor?.team?.abbreviation);
      if (abbrev) byTeam.set(abbrev, entry);
    }
  }

  return byTeam;
}

/**
 * Rushing + receiving touchdowns for one athlete, from a game summary.
 *
 * Returns a number when the box score exists (0 is a real answer — the player
 * is in the game and has not scored), and `null` when there is no box score to
 * read yet, so "no TD" and "no data" stay distinguishable. An athlete who has
 * not recorded a carry or catch simply is not listed and reads as 0, which is
 * correct: they have not scored a rushing or receiving TD.
 */
export function scoredTouchdownsFromSummary(summary, espnPlayerId) {
  const teams = summary?.boxscore?.players;
  if (!Array.isArray(teams) || teams.length === 0) return null;
  if (!espnPlayerId) return null;

  const wantedId = String(espnPlayerId);
  let total = 0;

  for (const team of teams) {
    for (const category of team?.statistics ?? []) {
      if (category?.name !== 'rushing' && category?.name !== 'receiving') continue;

      const tdIndex = (category.labels ?? []).indexOf('TD');
      if (tdIndex === -1) continue;

      for (const line of category.athletes ?? []) {
        if (String(line?.athlete?.id) !== wantedId) continue;
        const value = Number(line?.stats?.[tdIndex]);
        if (Number.isFinite(value)) total += value;
      }
    }
  }

  return total;
}

/**
 * Which events to fetch summaries for: the games the picked teams are in that
 * have actually started. A `not_started` game has no box score worth fetching,
 * and a team with no game this week has no event at all.
 *
 * @param {object} scoreboard the raw scoreboard payload
 * @param {string[]} teamAbbrevs the picked players' team abbreviations
 * @returns {string[]} distinct event ids, safe to Promise.all over
 */
export function relevantEventIds(scoreboard, teamAbbrevs = []) {
  const byTeam = indexEventsByTeam(scoreboard);
  const ids = new Set();

  for (const abbrev of teamAbbrevs) {
    const entry = byTeam.get(normalizeAbbrev(abbrev));
    if (entry && entry.state !== GAME_STATE.NOT_STARTED) ids.add(entry.eventId);
  }

  return [...ids];
}

/**
 * Is any picked team's game live right now? Drives the poll: the tracker
 * refetches on an interval while this is true and stops once every relevant
 * game is final or yet to start, so a Tuesday board is not polling ESPN.
 */
export function anyGameLive(scoreboard, teamAbbrevs = []) {
  const byTeam = indexEventsByTeam(scoreboard);
  return teamAbbrevs.some(
    (abbrev) => byTeam.get(normalizeAbbrev(abbrev))?.state === GAME_STATE.IN_PROGRESS
  );
}

/**
 * The live status for every tracked pick, keyed by pick id.
 *
 * @param {object} args
 * @param {Array<{ id: string, espnPlayerId: string|number|null, teamAbbreviation: string }>} args.picks
 * @param {object} args.scoreboard the raw scoreboard payload
 * @param {Object<string, object>} args.summariesByEvent event id → raw summary payload
 * @returns {Object<string, { state: string, scored: boolean, tds: number|null, detail: string|null }>}
 */
export function buildLiveStatus({ picks = [], scoreboard, summariesByEvent = {} }) {
  const byTeam = indexEventsByTeam(scoreboard);
  const out = {};

  for (const pick of picks) {
    const event = byTeam.get(normalizeAbbrev(pick.teamAbbreviation));

    if (!event) {
      out[pick.id] = { state: GAME_STATE.NO_GAME, scored: false, tds: null, detail: null };
      continue;
    }

    // A game not yet kicked off has no box score, so TDs are unknown, not zero.
    const tds =
      event.state === GAME_STATE.NOT_STARTED
        ? null
        : scoredTouchdownsFromSummary(summariesByEvent[event.eventId], pick.espnPlayerId);

    out[pick.id] = {
      state: event.state,
      scored: (tds ?? 0) >= 1,
      tds,
      detail: event.detail
    };
  }

  return out;
}
