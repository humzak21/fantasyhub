// The league chat (JITS-42): an approved member asks anything about the
// league, and a model answers by querying a snapshot of the league's history.
//
// This file is the I/O around services/leagueAgent.js, where the decisions
// live and are unit-tested in Node: the prompt, the query loop, and the check
// that refuses any number or member the queries did not return. Here: who is
// asking, the daily cap, loading the snapshot, calling the model, logging.
//
// The snapshot is a SQLite file in the private `league-chat` bucket, rebuilt by
// scripts/build-league-chat-db.js after every daily refresh and weekly sync. It
// is loaded into memory with sql.js — the same version that wrote it, whose
// wasm sits beside it — and cached for a few minutes. Model-written SQL runs
// there and nowhere else: it cannot reach the league's database.
//
// Deploy (one-time, from a machine linked to the project):
//   supabase secrets set SB_SECRET_KEY=<an sb_secret_… key>
//   supabase secrets set LLM_BASE_URL=… LLM_API_KEY=… LLM_MODEL=…
//   supabase functions deploy league-chat
// Without the LLM_* secrets the chat says it is not switched on: there is no
// way to answer an open question without a model. After setting them, a GET
// to the function is the check (see `health` below).
// `verify_jwt = false` in config.toml: the gateway's legacy JWT check does not
// apply to the new API keys, so the caller's session is checked here instead,
// with auth.getUser.

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import initSqlJs from 'npm:sql.js@1.14.2';

import { answerQuestion, openAiCompatibleModel } from '../../../services/leagueAgent.js';
import { runQuery } from '../../../services/leagueSnapshot.js';
import { ownerKey } from '../../../utils/ownerAliases.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const serviceKey = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DAILY_LIMIT = Number(Deno.env.get('CHAT_DAILY_LIMIT') ?? 30);
const MAX_QUESTION = 300;
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;
const BUCKET = 'league-chat';

const llm = Deno.env.get('LLM_BASE_URL') && Deno.env.get('LLM_API_KEY') && Deno.env.get('LLM_MODEL')
  ? {
    name: Deno.env.get('LLM_MODEL')!,
    call: openAiCompatibleModel({
      baseUrl: Deno.env.get('LLM_BASE_URL')!,
      apiKey: Deno.env.get('LLM_API_KEY')!,
      model: Deno.env.get('LLM_MODEL')!
    })
  }
  : null;

// One open snapshot per warm instance, reloaded after SNAPSHOT_TTL_MS.
let SQL: any = null;
let cached: { db: any; loadedAt: number } | null = null;

async function openSnapshot(supabase: any) {
  if (cached && Date.now() - cached.loadedAt < SNAPSHOT_TTL_MS) return cached.db;
  const bucket = supabase.storage.from(BUCKET);
  if (!SQL) {
    const { data: wasm, error } = await bucket.download('sql-wasm.wasm');
    if (error) throw new Error(`snapshot reader missing: ${error.message}`);
    SQL = await initSqlJs({ wasmBinary: new Uint8Array(await wasm.arrayBuffer()) });
  }
  const { data: file, error } = await bucket.download('league.sqlite');
  if (error) throw new Error(`snapshot missing: ${error.message}`);
  const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  cached?.db.close();
  cached = { db, loadedAt: Date.now() };
  return db;
}

const one = (db: any, sql: string, params: unknown[] = []) => {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    return stmt.step() ? stmt.get() : null;
  } finally {
    stmt.free();
  }
};

// The health check (GET): which settings the function can see — present or
// not, never their values — whether the snapshot is in the bucket, and one
// tiny model call, so a mistyped secret shows up before a member asks anything.
// The model call is remembered per warm instance for HEALTH_TTL_MS, so the
// endpoint cannot be used to spend the model's daily allowance.
const HEALTH_TTL_MS = 10 * 60 * 1000;
let lastPing: { at: number; result: Record<string, unknown> } | null = null;

async function pingModel() {
  if (!llm) return { ok: false, error: 'LLM_BASE_URL, LLM_API_KEY and LLM_MODEL are not all set' };
  if (lastPing && Date.now() - lastPing.at < HEALTH_TTL_MS) return { ...lastPing.result, cached: true };
  const started = Date.now();
  let result: Record<string, unknown>;
  try {
    const ping = openAiCompatibleModel({
      baseUrl: Deno.env.get('LLM_BASE_URL')!,
      apiKey: Deno.env.get('LLM_API_KEY')!,
      model: llm.name,
      maxTokens: 10
    });
    const reply = await ping([{ role: 'user', content: 'Reply with the single word: ok' }]);
    result = { ok: reply.trim().length > 0, reply: reply.trim().slice(0, 40), latencyMs: Date.now() - started };
  } catch (e) {
    result = { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300), latencyMs: Date.now() - started };
  }
  lastPing = { at: Date.now(), result };
  return result;
}

async function health() {
  const settings = Object.fromEntries(
    ['SB_SECRET_KEY', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'].map((name) => [name, Boolean(Deno.env.get(name))])
  );
  let snapshot: Record<string, unknown> = { ok: false, error: 'SB_SECRET_KEY is not set' };
  if (serviceKey) {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: 10 });
    const names = (data ?? []).map((f: any) => f.name);
    snapshot = error
      ? { ok: false, error: error.message }
      : { ok: names.includes('league.sqlite') && names.includes('sql-wasm.wasm'), files: names };
  }
  const model = await pingModel();
  return json({ ok: Boolean(serviceKey) && Boolean(model.ok) && Boolean(snapshot.ok), settings, model: llm?.name ?? null, modelCheck: model, snapshot });
}

const cleanHistory = (raw: unknown) =>
  (Array.isArray(raw) ? raw : [])
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .slice(-6)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 1200) }));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return health();
  if (!serviceKey) {
    console.error('league-chat: SB_SECRET_KEY is not set');
    return json({ error: 'Not configured' }, 500);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Who is asking: a signed-in, approved member (admins count), as for Takes.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData } = token ? await supabase.auth.getUser(token) : { data: null };
  const user = userData?.user;
  if (!user) return json({ error: 'Sign in to ask the league.' }, 401);

  const [{ data: admin }, { data: approval }] = await Promise.all([
    supabase.from('league_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
    supabase.from('member_approvals').select('status').eq('user_id', user.id).maybeSingle()
  ]);
  if (!admin && approval?.status !== 'approved') {
    return json({ error: 'Your account has not been approved yet.' }, 403);
  }

  let question = '';
  let history: Array<{ role: string; content: string }> = [];
  try {
    const body = await req.json();
    question = String(body?.question ?? '').trim().slice(0, MAX_QUESTION);
    history = cleanHistory(body?.history);
  } catch {
    return json({ error: 'Expected a JSON body with a question.' }, 400);
  }
  if (!question) return json({ error: 'Ask a question.' }, 400);

  const log = (row: Record<string, unknown>) =>
    supabase.from('chat_log').insert({ user_id: user.id, question, model: llm?.name ?? null, ...row });

  if (!llm) {
    await log({ kind: 'off', answer: '' });
    return json({ kind: 'off', text: "The league chat isn't switched on yet.", queries: [], asOf: null });
  }

  // The daily cap, counted from the log.
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('chat_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since.toISOString());
  if ((count ?? 0) >= DAILY_LIMIT) {
    return json({ error: `That's ${DAILY_LIMIT} questions today. Ask again tomorrow.` }, 429);
  }

  const started = Date.now();
  try {
    const db = await openSnapshot(supabase);
    const about: Record<string, string | null> = {};
    for (const row of db.exec('select key, value from about')[0]?.values ?? []) about[row[0]] = row[1];
    const members: string[] = (db.exec('select owner from members order by owner')[0]?.values ?? []).map((r: any[]) => r[0]);

    // The asker is their display name, matched to an owner the way the rest of
    // the league does it (ownerKey); their opponent is this week's game.
    const displayName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? '';
    const viewerName = members.find((m) => ownerKey(m) === ownerKey(displayName)) ?? null;
    const opponentName = viewerName && about.current_season && about.current_week
      ? (one(db, 'select opponent from games where season = ? and week = ? and owner = ?', [Number(about.current_season), Number(about.current_week), viewerName])?.[0] ?? null)
      : null;

    const result = await answerQuestion({
      question,
      history,
      model: llm.call,
      runSql: (sql: string) => runQuery(db, sql),
      context: { viewerName, opponentName, about, members }
    });

    await log({
      kind: result.kind,
      answer: result.text,
      queries: result.queries.map((q: any) => ({ sql: q.sql, rowCount: q.rowCount, error: q.error })),
      attempts: result.attempts,
      model_calls: result.modelCalls,
      problems: result.problems,
      latency_ms: Date.now() - started
    });

    const asOf = about.current_season
      ? about.last_scored_week ? `${about.current_season} week ${about.last_scored_week}` : `${about.current_season}, before week 1`
      : null;
    return json({ kind: result.kind, text: result.text, queries: result.queries, asOf });
  } catch (e) {
    console.error('league-chat failed:', e);
    await log({
      kind: 'error',
      problems: [String((e as Error)?.message ?? e).slice(0, 300)],
      latency_ms: Date.now() - started
    });
    return json({ error: 'Something went wrong answering that. Try again in a minute.' }, 500);
  }
});
