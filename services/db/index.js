/**
 * The data access layer.
 *
 * Two ways in:
 *
 *   import { games } from 'services/db';        // ctx-explicit
 *   games.getGamesForWeek(ctx, seasonId, 3);
 *
 *   import { getDb } from 'services/db';        // ctx-bound, for app code
 *   const db = getDb();
 *   db.games.getGamesForWeek(seasonId, 3);
 *
 * The first form is what the modules use to call each other and what tests use
 * with a stub client. The second is the ergonomic surface for the app, and is
 * what `SupabaseDataManager` now delegates to.
 */

import { getContext } from './context.js';

import * as awards from './awards.js';
import * as divisions from './divisions.js';
import * as espnMapping from './espnMapping.js';
import * as games from './games.js';
import * as history from './history.js';
import * as players from './players.js';
import * as playerWeekStats from './playerWeekStats.js';
import * as pickems from './pickems.js';
import * as playoffs from './playoffs.js';
import * as rankings from './rankings.js';
import * as rosters from './rosters.js';
import * as schedule from './schedule.js';
import * as seasons from './seasons.js';
import * as teams from './teams.js';
import * as transactions from './transactions.js';
import * as users from './users.js';

export {
  awards, divisions, espnMapping, games, history, players, playerWeekStats, pickems, playoffs,
  rankings, rosters, schedule, seasons, teams, transactions, users
};

export { createContext, getContext } from './context.js';
export { getAnonClient, getAdminClient, resolveClient, isAdminClient } from './client.js';
export { DbError, DbErrorKind, toDbError, throwDbError, unwrap } from './errors.js';
export { toDbShape, fromDbShape } from './caseMap.js';
export { createLogger } from './logger.js';

/** Modules whose functions take a context; `espnMapping` is pure and does not. */
const CTX_MODULES = {
  awards, divisions, games, history, players, playerWeekStats, pickems, playoffs, rankings,
  rosters, schedule, seasons, teams, transactions, users
};

/** Pre-apply `ctx` to every exported function of a module. */
function bind(module, ctx) {
  const bound = {};
  for (const [name, value] of Object.entries(module)) {
    bound[name] = typeof value === 'function' ? (...args) => value(ctx, ...args) : value;
  }
  return bound;
}

const cache = new WeakMap();

/**
 * The domain modules with `ctx` already applied. Defaults to the process-wide
 * context; pass one explicitly to work against a different client.
 */
export function getDb(ctx = getContext()) {
  const cached = cache.get(ctx);
  if (cached) return cached;

  const db = { ctx, espnMapping };
  for (const [name, module] of Object.entries(CTX_MODULES)) db[name] = bind(module, ctx);

  cache.set(ctx, db);
  return db;
}
