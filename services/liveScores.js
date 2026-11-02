/**
 * The live week's decisions, kept pure so they can be tested without a database,
 * an edge runtime or a network. The `live-scores` edge function is a thin
 * wrapper around these.
 *
 * Nothing here writes `games`, and that is the point of the whole feed.
 * `games.is_completed` is generated from the two scores and the triggers roll
 * standings from it, so a partial score written there would complete the game,
 * move the standings and feed the parlay grader. A live number lives in
 * `live_week_snapshot` and nowhere else; the Tuesday sync stays the only author
 * of a result.
 *
 * The rosters are mapped by the sync's own `mapMatchupRosterEntries`, so "an
 * actual is null until the player has a stat line" is one rule: a 0 before
 * kickoff stays a projection, a 0 at halftime is a real 0 so far.
 */

import { isMatchupDecided, mapMatchupRosterEntries } from './espnPlayerStatsMapper.js';
import { getNFLTeamAbbreviation } from './db/espnMapping.js';
import { GAME_STATE, indexEventsByTeam, normalizeAbbrev } from './espnLiveScoreMapper.js';
import { isGameWindowOpen, shouldRefresh } from './gameWindows.js';

/** One shared ESPN pull at most this often, however many people are watching. */
export const LIVE_REFRESH_TTL_MS = 15 * 60 * 1000;

/**
 * How long a claim holds. A refresh that died leaves its claim behind, and a
 * failed one leaves it on purpose, so a broken cookie costs ESPN one attempt
 * per this long rather than one per viewer's poll.
 */
export const LIVE_RETRY_AFTER_MS = 5 * 60 * 1000;

/**
 * How long a snapshot that last said "a game is on" keeps counting as live
 * after its window closes. Overtime can outrun the window, and the final
 * refresh is what turns the row off; but a failing ESPN call never writes
 * `live = false`, so without a limit a dead cookie would look live forever.
 */
export const LIVE_TAIL_MS = 6 * 60 * 60 * 1000;

/** What a read returns before anything has been stored. */
export const EMPTY_LIVE_WEEK = Object.freeze({
  matchups: [],
  lineups: {},
  nflGames: {},
  live: false,
  windowOpen: false,
  refreshedAt: null
});

const mapSide = (side, decided) =>
  side?.teamId == null
    ? null
    : {
        espnTeamId: side.teamId,
        // A settled week's live total is gone from some payloads; its score is not.
        points: side.liveScore ?? (decided ? side.score : null),
        projected: side.liveProjection ?? null
      };

/**
 * Each matchup's two sides, ready to store.
 *
 * @param {Array} matchups normalized matchups from `ESPNScheduleFetcher`
 */
export function mapLiveMatchups(matchups = []) {
  return matchups.map((matchup) => {
    const decided = isMatchupDecided(matchup);
    return {
      espnMatchupId: matchup.matchupId,
      home: mapSide(matchup.homeTeam, decided),
      away: mapSide(matchup.awayTeam, decided),
      espnWinner: matchup.espnWinner ?? null
    };
  });
}

/** A player's NFL game, by the fantasy `proTeamId` every row here carries. */
export const nflGameOf = (proTeamId, nflGames = {}) =>
  nflGames[normalizeAbbrev(getNFLTeamAbbreviation(proTeamId))] ?? null;

/**
 * Every rostered player, grouped by ESPN team.
 *
 * Self-sufficient on purpose: a Sunday-noon pickup has no `players` row until
 * the next sync and still has to render. `statBreakdown` stays out because it
 * is most of the payload and nothing live reads it.
 *
 * The mapper's rule waits for a stat line or a settled matchup, and a settled
 * matchup is Tuesday. A player whose NFL game has finished with no stat line
 * was inactive, so his 0 is a result now: ESPN's live total already counts it.
 *
 * @returns {Object<string, Array>} ESPN team id → entries
 */
export function mapLiveLineups(matchups = [], week, nflGames = {}) {
  const byTeam = {};

  for (const row of mapMatchupRosterEntries(matchups, week)) {
    const finished = nflGameOf(row.proTeamId, nflGames)?.state === GAME_STATE.FINAL;

    (byTeam[row.espnTeamId] ??= []).push({
      espnPlayerId: row.espnPlayerId,
      playerName: row.playerName,
      position: row.position,
      proTeamId: row.proTeamId,
      lineupSlotId: row.lineupSlotId,
      started: row.started,
      actualPoints: row.actualPoints ?? (finished ? 0 : null),
      projectedPoints: row.projectedPoints,
      injuryStatus: row.injuryStatus
    });
  }

  return byTeam;
}

/**
 * Each NFL team's game, by abbreviation. The clock is what the "points left"
 * arithmetic reads; an NFL team absent here is on a bye, or the slate failed.
 */
export function mapNflGames(scoreboard) {
  const games = {};
  for (const [abbrev, event] of indexEventsByTeam(scoreboard)) {
    games[abbrev] = {
      state: event.state,
      detail: event.detail,
      clock: event.clock,
      period: event.period
    };
  }
  return games;
}

export const anyNflGameLive = (nflGames = {}) =>
  Object.values(nflGames).some((game) => game.state === GAME_STATE.IN_PROGRESS);

/**
 * The columns one refresh writes.
 *
 * `weekData` is required: a refresh with no league payload is a failure, not an
 * empty week, and the caller keeps what it has. The scoreboard is not, because
 * scores without a game clock are still worth having: the last known NFL games
 * stand in and the window says whether a game is on.
 *
 * @param {{ weekData: object, week: number, scoreboard?: object|null, previous?: object|null, windowOpen?: boolean }} args
 */
export function buildLiveSnapshot({ weekData, week, scoreboard = null, previous = null, windowOpen = false }) {
  const nflGames = scoreboard ? mapNflGames(scoreboard) : previous?.nfl_games ?? {};

  return {
    matchups: mapLiveMatchups(weekData.matchups),
    lineups: mapLiveLineups(weekData.matchups, week, nflGames),
    nfl_games: nflGames,
    live: scoreboard ? anyNflGameLive(nflGames) : windowOpen
  };
}

/** The stored row, if it still claims a game is on. See `LIVE_TAIL_MS`. */
function stillLive(snapshot, now) {
  if (!snapshot?.live || !snapshot.refreshed_at) return false;
  return now.getTime() - new Date(snapshot.refreshed_at).getTime() < LIVE_TAIL_MS;
}

/**
 * The only weeks that may reach ESPN: this one, and last week until Tuesday's
 * sync has written its result (the week rolls over at 00:00 ET and the sync
 * runs at 05:00). The function is public, so without this anybody could walk
 * it through the season.
 */
export const isRefreshableWeek = (week, actualWeek) => week === actualWeek || week === actualWeek - 1;

/**
 * What a read should do. Answers from the stored snapshot at once either way;
 * `refresh` only says whether to pull ESPN behind that answer.
 *
 * A snapshot that still says a game is on refreshes past the window's end, so
 * the last game's final numbers are not left a quarter short.
 *
 * @param {{ now: Date, week: number, actualWeek: number, snapshot?: object|null, kickoffs?: Array }} args
 * @returns {{ windowOpen: boolean, live: boolean, refresh: boolean }}
 */
export function planLiveRead({ now, week, actualWeek, snapshot = null, kickoffs = [] }) {
  const windowOpen = isGameWindowOpen(now, kickoffs);
  const live = stillLive(snapshot, now);

  return {
    windowOpen,
    live,
    refresh:
      isRefreshableWeek(week, actualWeek) &&
      shouldRefresh({
        now,
        refreshedAt: snapshot?.refreshed_at ?? null,
        inWindow: windowOpen || live,
        ttlMs: LIVE_REFRESH_TTL_MS
      })
  };
}

/**
 * The stored row as a viewer receives it.
 *
 * `windowOpen` is there for the client's poll. The first viewer of a Sunday is
 * answered from Thursday's row with `live: false` while the refresh runs behind
 * that answer; a client polling on `live` alone would never see the result.
 */
export function toLiveResponse(snapshot, { live = false, windowOpen = false } = {}) {
  if (!snapshot?.refreshed_at) return { ...EMPTY_LIVE_WEEK, live, windowOpen };

  return {
    matchups: snapshot.matchups ?? [],
    lineups: snapshot.lineups ?? {},
    nflGames: snapshot.nfl_games ?? {},
    live,
    windowOpen,
    refreshedAt: snapshot.refreshed_at
  };
}
