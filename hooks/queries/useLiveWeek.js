/**
 * The week in progress (client side).
 *
 * Reads the shared snapshot through `services/db/liveScores.js`. ESPN is pulled
 * once for everybody, every 15 minutes while a game is on, so this poll mostly
 * re-reads the same row, and it stops as soon as no game is on. It never runs
 * for history: a week whose games have all been scored has nothing to overlay,
 * which is what `canBeLive` says.
 *
 * Polls on `windowOpen` as well as `live`, because the first viewer of a Sunday
 * is answered from Thursday's row while the refresh runs behind that answer.
 * Polling on `live` alone would stop there and never see the result.
 *
 * The join to this league's ids is a projection over the season's teams and
 * games, which the shell already holds, so it costs no request.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { canBeLive, joinLiveWeek } from '../../utils/liveOverlay.js';
import { qk } from './keys.js';
import { useSeasonGames, useSeasonTeams } from './useLeague.js';

const db = () => getDb();

/** Re-read the shared snapshot this often while a game is on. */
const POLL_MS = 2 * 60_000;

/**
 * @param {string} seasonId
 * @param {number} week
 * @param {{ actualWeek?: number|null, enabled?: boolean }} [options]
 * @returns {{ data: object|null }} the joined week (see `joinLiveWeek`), or null
 */
export function useLiveWeek(seasonId, week, { actualWeek = null, enabled = true } = {}) {
  const { data: games } = useSeasonGames(seasonId);
  const { data: teams } = useSeasonTeams(seasonId);

  const open = enabled && Boolean(seasonId) && canBeLive({ week, actualWeek, games });

  const { data: snapshot } = useQuery({
    queryKey: qk.live.week(seasonId, week),
    enabled: open,
    // The snapshot's own `refreshedAt` governs freshness; this only stops a
    // remount from re-reading it within the minute.
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const { data } = query.state;
      return data?.live || data?.windowOpen ? POLL_MS : false;
    },
    queryFn: () => db().liveScores.getLiveWeek(seasonId, week)
  });

  const data = useMemo(
    () => (open ? joinLiveWeek(snapshot, { teams, games, week }) : null),
    [open, snapshot, teams, games, week]
  );

  return { data };
}
