/**
 * The NFL calendar: who a player's team plays this week, and who is on a bye.
 *
 * One fetch per NFL season, and every view is a projection of it. That is the
 * whole design: a season is ~576 rows — small enough to hold once and cheap
 * enough to hand a `select` — and deriving the week view and the opponent map
 * from the same cache entry is what makes it impossible for two chips on one
 * page to disagree about the same week. Separate keys per week would fetch the
 * same rows repeatedly and let them drift as they expired at different times.
 *
 * Keyed by *season year*, not season id. The NFL's calendar is not ours: it is
 * the same for every league and exists for years we have no season row for. See
 * `services/db/nflSchedule.js` and the `nflSchedule` note in `keys.js`.
 *
 * There are no mutations. `nfl_schedule` is written by `scripts/sync-week.js`
 * and `scripts/sync-nfl-schedule.js`, which run as GitHub Actions crons, out of
 * this process entirely — the same shape as `usePlayerStats.js`.
 */

import { useQuery } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { getNFLTeamAbbreviation } from '../../services/db/espnMapping.js';
import { qk } from './keys.js';

const db = () => getDb();

/**
 * A cron rewrites this at most once a week, and the calendar itself moves only
 * when the NFL flexes a game. An hour is generous and still refetches inside a
 * single sitting on the rare week something changes.
 */
const STALE_TIME = 60 * 60_000;

/**
 * One team's week, in the shape a chip needs.
 *
 * `bye` is read off the stored row rather than inferred from a missing one.
 * `nfl_schedule` carries an explicit row per bye precisely so this distinction
 * survives: a team with no row is a team we know nothing about — an unimported
 * season, a player with no NFL team — and that has to stay separable from a
 * team we know is off.
 */
function toEntry(row) {
  const bye = row.opponentProTeamId == null;

  return {
    bye,
    proTeamId: row.proTeamId,
    opponentProTeamId: row.opponentProTeamId,
    opponentAbbrev: bye ? null : getNFLTeamAbbreviation(row.opponentProTeamId),
    isHome: row.isHome,
    gameTime: row.gameTime,
    startTimeTbd: row.startTimeTbd,
    statsOfficial: row.statsOfficial
  };
}

/**
 * `{ [proTeamId]: entry }` for one week.
 *
 * Exported and pure so it can be tested without a query client, and so a
 * caller holding rows from somewhere else can build the same map.
 *
 * @param {object[]} rows a season's rows, as `getNflScheduleForSeason` returns
 * @param {number}   week
 */
export function buildOpponentMap(rows = [], week) {
  const byProTeamId = {};
  if (!week) return byProTeamId;

  for (const row of rows) {
    if (row.week !== week) continue;
    byProTeamId[row.proTeamId] = toEntry(row);
  }

  return byProTeamId;
}

/** One NFL season's calendar, flat. The single fetch everything else projects. */
export function useNflSeasonSchedule(seasonYear, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.nflSchedule.season(seasonYear),
    queryFn: () => db().nflSchedule.getNflScheduleForSeason(seasonYear),
    enabled: Boolean(seasonYear) && enabled,
    staleTime: STALE_TIME
  });
}

/**
 * One week's rows, flat.
 *
 * A `select` over the season entry rather than a query of its own, so it shares
 * the season's single fetch and cannot hold a different answer than the
 * opponent map built beside it.
 */
export function useNflWeekSchedule(seasonYear, week, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.nflSchedule.season(seasonYear),
    queryFn: () => db().nflSchedule.getNflScheduleForSeason(seasonYear),
    enabled: Boolean(seasonYear) && Boolean(week) && enabled,
    select: (rows) => (rows ?? []).filter((row) => row.week === week),
    staleTime: STALE_TIME
  });
}

/**
 * One week's opponents, keyed by ESPN `proTeamId`.
 *
 * The read every chip makes: it holds `player.proTeamId` and wants the entry
 * for it. Pair it with `formatOpponent` from `utils/nflOpponent.js`, which
 * renders "vs BUF" / "@ KC" / "BYE" and returns null for a team the map does
 * not have — the case a chip must render as nothing rather than as a guess.
 *
 * `data` defaults to `{}` only through the caller's own destructuring default;
 * while loading it is `undefined`, and a lookup into it would throw. Callers
 * here use `const { data: opponents = {} } = …`.
 */
export function useNflOpponentMap(seasonYear, week, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.nflSchedule.season(seasonYear),
    queryFn: () => db().nflSchedule.getNflScheduleForSeason(seasonYear),
    enabled: Boolean(seasonYear) && Boolean(week) && enabled,
    // Runs on cache reads rather than on every render of every consumer, and
    // the raw rows stay in the cache exactly once.
    select: (rows) => buildOpponentMap(rows, week),
    staleTime: STALE_TIME
  });
}
