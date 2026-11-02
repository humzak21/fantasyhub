// The live week's scores — one ESPN pull, shared by every viewer.
//
// Every browser calls this instead of ESPN. It answers at once from the stored
// snapshot and, when the 15-minute TTL has lapsed while a game is on, refreshes
// behind that answer, so nobody waits on ESPN's round trip and ESPN never hears
// about the size of the audience. On a Wednesday it calls nothing at all.
//
// It never writes `games`. The Tuesday sync stays the only author of a result,
// and the snapshot is an unofficial overlay the client gives way on as soon as a
// real score exists.
//
// The decisions live in ../../../services/liveScores.js and are unit-tested in
// Node, and the rosters go through the sync's own mapper, so this file is the
// thin runtime wrapper: read the request, ask those functions, do the I/O.
//
// Deploy (one-time, from a machine linked to the project):
//   supabase secrets set ESPN_S2=<cookie> ESPN_SWID=<cookie>
//   supabase functions deploy live-scores --no-verify-jwt
// The cookies are the ones the Actions workflows hold. SB_SECRET_KEY is already
// set for the other two functions; see parlay-live for why it is not the
// injected SUPABASE_SERVICE_ROLE_KEY.
//
// After deploying, a GET is the check (see `health` below).

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

import { normaliseSwid } from '../../../config/espn-config.js';
import { fetchNflScoreboard } from '../../../services/espnLiveScoreFetcher.js';
import { createScheduleFetcher } from '../../../services/espnScheduleFetcher.js';
import {
  LIVE_REFRESH_TTL_MS,
  LIVE_RETRY_AFTER_MS,
  buildLiveSnapshot,
  planLiveRead,
  toLiveResponse
} from '../../../services/liveScores.js';
import { deriveCurrentWeek, toSeasonConfig } from '../../../utils/seasonConfig.js';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  });

const serviceKey = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const espnS2 = Deno.env.get('ESPN_S2') || null;
const swid = normaliseSwid(Deno.env.get('ESPN_SWID') || '');

const database = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, serviceKey!, {
    // A server-side client has no user session to keep or refresh.
    auth: { persistSession: false, autoRefreshToken: false }
  });

const espnLeague = (config: any) => ({
  leagueId: config.espnLeagueId,
  year: config.espnSeasonYear ?? config.year
});

/** One failure, in words that are safe to store in a public-read column. */
const describeFailure = (e: unknown) => String((e as Error)?.message ?? e).slice(0, 200);

async function refresh(supabase: any, config: any, week: number, previous: any, windowOpen: boolean) {
  const { data: claimed, error: claimError } = await supabase.rpc('claim_live_week_refresh', {
    p_season_id: config.id,
    p_week: week,
    p_fresh_for_seconds: LIVE_REFRESH_TTL_MS / 1000,
    p_retry_after_seconds: LIVE_RETRY_AFTER_MS / 1000
  });

  if (claimError) throw claimError;
  if (!claimed) return;

  const { leagueId, year } = espnLeague(config);

  try {
    const fetcher = await createScheduleFetcher(leagueId, year, espnS2, swid);
    const [league, scoreboard] = await Promise.allSettled([
      fetcher.getSingleWeek(week),
      fetchNflScoreboard({ week, year })
    ]);

    // `getSingleWeek` logs a failed fetch and answers null.
    const weekData = league.status === 'fulfilled' ? league.value : null;
    if (!weekData) throw new Error(`ESPN returned no league data for week ${week}`);

    if (scoreboard.status === 'rejected') {
      console.error('live-scores: scoreboard failed, keeping the last NFL games:', scoreboard.reason);
    }

    const snapshot = buildLiveSnapshot({
      weekData,
      week,
      scoreboard: scoreboard.status === 'fulfilled' ? scoreboard.value : null,
      previous,
      windowOpen
    });

    const { error } = await supabase
      .from('live_week_snapshot')
      .update({
        ...snapshot,
        refreshed_at: new Date().toISOString(),
        refreshing_at: null,
        last_error: null
      })
      .eq('season_id', config.id)
      .eq('week', week);

    if (error) throw error;
  } catch (e) {
    // The claim stays, which is the back-off; the next attempt waits for it.
    console.error('live-scores: refresh failed:', e);
    await supabase
      .from('live_week_snapshot')
      .update({ last_error: describeFailure(e) })
      .eq('season_id', config.id)
      .eq('week', week);
  }
}

// The health check (GET): which settings the function can see, present or not,
// never their values, and whether ESPN serves this function's egress at all.
// That is the question a deploy has to answer first: GitHub's runners are
// allowed through, and Supabase's egress was once refused by a different ESPN
// host. Remembered per warm instance, so the endpoint cannot be used to spend
// ESPN calls. Anyone can call it, so an outcome is a status code and no more.
const HEALTH_TTL_MS = 10 * 60 * 1000;
let lastProbe: { at: number; result: Record<string, unknown> } | null = null;

const statusOf = (e: unknown) => /\b(\d{3})\b/.exec(String((e as Error)?.message ?? e))?.[1] ?? 'no answer';

async function probeEspn() {
  if (lastProbe && Date.now() - lastProbe.at < HEALTH_TTL_MS) return { ...lastProbe.result, cached: true };

  const { data: row, error } = await database().from('v_active_season').select('*').single();
  if (error) {
    console.error('live-scores health: no active season:', error);
    return { ok: false, error: 'no active season could be read' };
  }

  const config = toSeasonConfig(row);
  const { leagueId, year } = espnLeague(config);
  const { fetcher } = await createScheduleFetcher(leagueId, year, espnS2, swid);

  const started = Date.now();
  let result: Record<string, unknown>;
  try {
    const payload = await fetcher.fetchScheduleByWeek(deriveCurrentWeek(config));
    result = { ok: Array.isArray(payload?.schedule), league: 'served', latencyMs: Date.now() - started };
  } catch (e) {
    console.error('live-scores health: league read failed:', e);
    result = { ok: false, league: `refused (${statusOf(e)})`, latencyMs: Date.now() - started };
  }

  lastProbe = { at: Date.now(), result };
  return result;
}

async function health() {
  const settings = Object.fromEntries(
    ['SB_SECRET_KEY', 'ESPN_S2', 'ESPN_SWID'].map((name) => [name, Boolean(Deno.env.get(name))])
  );
  const espn = serviceKey ? await probeEspn() : { ok: false, error: 'SB_SECRET_KEY is not set' };
  return json({ ok: Boolean(espn.ok), settings, espn });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return health();

  let body: { seasonId?: string; week?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  const { seasonId, week } = body ?? {};
  if (!seasonId || !Number.isInteger(week) || week! <= 0) {
    return json({ error: 'seasonId and week are required' }, 400);
  }

  if (!serviceKey) {
    console.error('live-scores: neither SB_SECRET_KEY nor SUPABASE_SERVICE_ROLE_KEY is set');
    return json({ error: 'Not configured' }, 500);
  }

  try {
    const supabase = database();
    const now = new Date();

    const [seasonRead, snapshotRead] = await Promise.all([
      supabase.from('seasons').select('*').eq('id', seasonId).maybeSingle(),
      supabase
        .from('live_week_snapshot')
        .select('matchups, lineups, nfl_games, live, refreshed_at')
        .eq('season_id', seasonId)
        .eq('week', week)
        .maybeSingle()
    ]);

    if (seasonRead.error) throw seasonRead.error;
    if (snapshotRead.error) throw snapshotRead.error;

    const season = seasonRead.data;
    const snapshot = snapshotRead.data;
    if (!season) return json({ error: 'No such season' }, 404);

    const config = toSeasonConfig(season);

    // A finished or inactive season has nothing to refresh, and a season with
    // no start date has no week to derive.
    if (!season.is_active || season.is_completed || !config.startDate || !espnLeague(config).leagueId) {
      return json(toLiveResponse(snapshot));
    }

    const { data: kickoffRows, error: kickoffError } = await supabase
      .from('nfl_schedule')
      .select('game_time')
      .eq('season_year', espnLeague(config).year)
      .eq('week', week)
      .not('game_time', 'is', null);

    if (kickoffError) throw kickoffError;

    const plan = planLiveRead({
      now,
      week: week!,
      actualWeek: deriveCurrentWeek(config),
      snapshot,
      kickoffs: (kickoffRows ?? []).map((row: { game_time: string }) => row.game_time)
    });

    if (plan.refresh) {
      EdgeRuntime.waitUntil(
        refresh(supabase, config, week!, snapshot, plan.windowOpen).catch((e) =>
          console.error('live-scores: could not claim a refresh:', e)
        )
      );
    }

    return json(toLiveResponse(snapshot, plan));
  } catch (e) {
    // The full error goes to the function's logs. The client's getLiveWeek treats
    // any non-2xx as "nothing live" and degrades quietly.
    console.error('live-scores failed:', e);
    return json({ error: 'The live feed could not be read' }, 500);
  }
});
