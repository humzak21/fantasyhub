/**
 * A player's page, and the league ranks it is read against.
 *
 * Three reads, all through `services/db/playerProfiles.js`. The shaping is the
 * pure `utils/playerProfile/`, run in `select`, so it happens once per fetch
 * and two components on one player share it. Nothing invalidates these keys:
 * the cron writes every table behind them (see `qk.players`).
 */

import { useQuery } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { buildPlayerProfile, rankCareers } from '../../utils/playerProfile/index.js';
import { qk } from './keys.js';

const db = () => getDb();

/** The weekly sync writes these; ten minutes, like `useSeasonPlayerStats`. */
const STALE_TIME = 10 * 60_000;

/** The qualifying floor for an OG Jits rank: games appeared. */
const MIN_GAMES = 5;

const selectRanking = (rows) => rankCareers(rows, { minGames: MIN_GAMES });

/** `buildPlayerProfile` over the source; `data` is null for an unknown player. */
export function usePlayerProfile(playerId, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.players.profile(playerId),
    queryFn: () => db().playerProfiles.getPlayerProfileSource(playerId),
    select: buildPlayerProfile,
    enabled: Boolean(playerId) && enabled,
    staleTime: STALE_TIME
  });
}

/** Every career, ranked within position. One league-wide read, shared by every page. */
export function usePlayerCareers({ enabled = true } = {}) {
  return useQuery({
    queryKey: qk.players.careers(),
    queryFn: () => db().playerProfiles.getPlayerCareers(),
    select: selectRanking,
    enabled,
    staleTime: STALE_TIME
  });
}

/** `{ id, espnPlayerId, name, … }` for an ESPN id, or null. */
export function usePlayerByEspnId(espnPlayerId, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.players.byEspnId(espnPlayerId),
    queryFn: () => db().playerProfiles.getPlayerByEspnId(espnPlayerId),
    enabled: espnPlayerId != null && enabled,
    staleTime: STALE_TIME
  });
}
