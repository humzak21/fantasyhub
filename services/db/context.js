/**
 * The shared context every domain function takes as its first argument.
 *
 * It carries the client plus the two pieces of state that were instance fields
 * on the old god class: the season cache and the id of the active season.
 * Keeping them on one object — rather than one module-level cache per domain —
 * is what lets `seasons.getSeason()` and `teams.updateTeam()` agree about which
 * season objects are stale, exactly as they did when they were siblings on
 * `this`.
 *
 * A context is cheap; create one per client. Tests can create a throwaway one
 * with a stub client and no globals to reset.
 */

import { resolveClient } from './client.js';

/** @param {import('@supabase/supabase-js').SupabaseClient} client */
export function createContext(client) {
  return {
    client,
    /** seasonId → hydrated season object */
    seasonsCache: new Map(),
    /** id of the season with `is_active`, once something has looked it up */
    activeSeasonId: null
  };
}

let defaultContext = null;

/**
 * The process-wide context, built over `resolveClient()` — the service-role
 * client in Node scripts, the anon client in the browser.
 */
export function getContext() {
  if (!defaultContext) defaultContext = createContext(resolveClient());
  return defaultContext;
}

/** Test seam. */
export function resetContext() {
  defaultContext = null;
}
