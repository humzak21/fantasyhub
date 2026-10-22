// The TD parlay's live tracker — the one process that talks to ESPN.
//
// Every viewer's browser calls this instead of ESPN. It pulls ESPN's public
// scoreboard at most once every 30 minutes, only during game windows, shares
// the result through `parlay_live_snapshot`, and returns a tiny per-pick status.
// So ESPN is hit a couple of dozen times on a Sunday total — not once per
// viewer per minute — and never at all on a Wednesday.
//
// It is deliberately parlay-only and unofficial. It reads td_parlay_picks and
// public NFL data, never fantasy stats, and it never writes scored_td — the
// Tuesday sync's grader stays the sole author of the official grade.
//
// The decisions (game-window gate, the 30-minute clock, which games to fetch,
// how to merge) live in ../../../services/parlayLive.js and are unit-tested in
// Node. This file is the thin runtime wrapper: read the request, load the
// previous snapshot, ask those pure functions what to do, do the I/O, store the
// result. `supabase functions deploy parlay-live` bundles the imported service
// modules along with it.
//
// Deploy (one-time, from a machine linked to the project):
//   supabase secrets set SB_SECRET_KEY=<an sb_secret_… key>
//   supabase functions deploy parlay-live --no-verify-jwt
// The `[functions.parlay-live] verify_jwt = false` in config.toml keeps it
// callable by signed-out viewers, since the parlay board is public.
//
// The key is our own secret, not the runtime's. Supabase injects
// SUPABASE_SERVICE_ROLE_KEY into every function, but that is the *legacy*
// service_role JWT, and it stops working the moment legacy API keys are
// disabled — which they had to be on 2026-10-22, after Railway leaked them.
// SB_SECRET_KEY holds one of the project's new secret keys (Project Settings →
// API Keys). Custom secrets may not start with `SUPABASE_`, hence the name. The
// injected key remains a fallback only so that deploying this before the secret
// is set changes nothing.

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

import { fetchNflScoreboard, fetchGameSummary } from '../../../services/espnLiveScoreFetcher.js';
import {
  REFRESH_TTL_MS,
  isLikelyGameWindow,
  shouldRefresh,
  planEventFetches,
  mergeLiveStatus
} from '../../../services/parlayLive.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

const serviceKey = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let body: { pickEmWeekId?: string; nflWeek?: number | null; year?: number | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  const pickEmWeekId = body?.pickEmWeekId;
  if (!pickEmWeekId) return json({ error: 'pickEmWeekId is required' }, 400);

  if (!serviceKey) {
    console.error('parlay-live: neither SB_SECRET_KEY nor SUPABASE_SERVICE_ROLE_KEY is set');
    return json({ error: 'Not configured' }, 500);
  }

  try {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    // A server-side client has no user session to keep or refresh.
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // The last thing we stored for this week, if anything.
  // Checked, because outside a game window this is the only query: a bad key
  // ignored here would read as "nothing live" until Sunday instead of failing.
  const { data: prev, error: prevError } = await supabase
    .from('parlay_live_snapshot')
    .select('status, event_states, live, refreshed_at')
    .eq('pick_em_week_id', pickEmWeekId)
    .maybeSingle();

  if (prevError) return json({ error: prevError.message }, 500);

  const now = new Date();
  const windowOpen = isLikelyGameWindow(now);

  // Outside a window, or inside the 30-minute cooldown: serve the last snapshot
  // and call nothing. This is the case that keeps ESPN usage low.
  if (!shouldRefresh({ now, refreshedAt: prev?.refreshed_at ?? null, inWindow: windowOpen })) {
    return json({
      status: prev?.status ?? {},
      live: prev?.live ?? false,
      refreshedAt: prev?.refreshed_at ?? null,
      fromCache: true
    });
  }

  // The week's matched picks — free-text picks have no ESPN id and are skipped.
  const { data: pickRows, error: picksError } = await supabase
    .from('td_parlay_picks')
    .select('id, player_id, player:players ( espn_player_id, team_abbreviation )')
    .eq('pick_em_week_id', pickEmWeekId)
    .not('player_id', 'is', null);

  if (picksError) return json({ error: picksError.message }, 500);

  const picks = (pickRows ?? []).map((row: any) => ({
    id: row.id,
    espnPlayerId: row.player?.espn_player_id ?? null,
    teamAbbreviation: row.player?.team_abbreviation ?? null
  }));

  if (picks.length === 0) {
    await supabase.from('parlay_live_snapshot').upsert({
      pick_em_week_id: pickEmWeekId,
      status: {},
      event_states: {},
      live: false,
      refreshed_at: now.toISOString()
    });
    return json({ status: {}, live: false, refreshedAt: now.toISOString(), fromCache: false });
  }

  // One scoreboard call, then a box score only for the games still worth
  // fetching (live, or newly final). A single game's summary failing must not
  // blank the rest — it is dropped and retried on the next refresh.
  const scoreboard = await fetchNflScoreboard({ week: body?.nflWeek ?? null, year: body?.year ?? null });
  const eventIds = planEventFetches({ picks, scoreboard, prevEventStates: prev?.event_states ?? {} });
  const settled = await Promise.allSettled(eventIds.map((id) => fetchGameSummary(id)));

  const summariesByEvent: Record<string, unknown> = {};
  eventIds.forEach((id, index) => {
    if (settled[index].status === 'fulfilled') {
      summariesByEvent[id] = (settled[index] as PromiseFulfilledResult<unknown>).value;
    }
  });

  const { status, eventStates, live } = mergeLiveStatus({ picks, scoreboard, summariesByEvent, prev });

  await supabase.from('parlay_live_snapshot').upsert({
    pick_em_week_id: pickEmWeekId,
    status,
    event_states: eventStates,
    live,
    refreshed_at: now.toISOString()
  });

  return json({ status, live, refreshedAt: now.toISOString(), fromCache: false });
  } catch (e) {
    // Log the full error to the function's server-side logs; return only a
    // short message so nothing internal leaks to the client. The client's
    // getLiveStatus treats any non-2xx as "no live data" and degrades quietly.
    console.error('parlay-live failed:', e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

// Referenced only so `REFRESH_TTL_MS` is part of this module's contract with the
// planner even if a future edit stops importing it directly.
export const _ttlMs = REFRESH_TTL_MS;
