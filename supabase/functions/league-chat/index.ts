// The league chat (JITS-42): an approved member asks about the league, and the
// answer is worded from fact cards the site's own code wrote.
//
// This file is the I/O around services/leagueQuestion.js, where every decision
// lives and is unit-tested in Node: which cards a question is about, the one
// prompt, and the check that refuses any number, record or name the cards did
// not supply. Here: who is asking, the daily cap, reading the cards, calling
// the model, logging.
//
// Without a model configured it still answers — with the matching cards
// themselves — so it costs nothing until a provider is chosen.
//
// Deploy (one-time, from a machine linked to the project):
//   supabase secrets set SB_SECRET_KEY=<an sb_secret_… key>
//   # optional — any OpenAI-compatible endpoint; unset means cards only
//   supabase secrets set LLM_BASE_URL=… LLM_API_KEY=… LLM_MODEL=…
//   supabase functions deploy league-chat
// `verify_jwt = false` in config.toml: the gateway's legacy JWT check does not
// apply to the new API keys, so the caller's session is checked here instead,
// with auth.getUser.

import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

import { answerQuestion, openAiCompatibleModel, readQuestion } from '../../../services/leagueQuestion.js';
import { ownerKey } from '../../../utils/ownerAliases.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const serviceKey = Deno.env.get('SB_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DAILY_LIMIT = Number(Deno.env.get('CHAT_DAILY_LIMIT') ?? 30);
const MAX_QUESTION = 300;
const TITLE_WORDS = /\b(champion|champions|championship|championships|title|titles|rings?)\b/i;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
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
  try {
    question = String((await req.json())?.question ?? '').trim().slice(0, MAX_QUESTION);
  } catch {
    return json({ error: 'Expected a JSON body with a question.' }, 400);
  }
  if (!question) return json({ error: 'Ask a question.' }, 400);

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
    const { data: meta, error: metaError } = await supabase
      .from('league_facts_meta')
      .select('generation, lexicon, this_week, current_year, played_week')
      .maybeSingle();
    if (metaError) throw metaError;
    if (!meta) return json({ kind: 'none', text: 'The league facts have not been built yet.', sources: [], asOf: null });

    const lexicon = meta.lexicon ?? [];
    const displayName = user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? '';
    const viewerKey = lexicon.some((p: any) => p.key === ownerKey(displayName)) ? ownerKey(displayName) : null;
    const pairing = (meta.this_week ?? []).find((p: any) => p.a === viewerKey || p.b === viewerKey);
    const opponentKey = pairing ? (pairing.a === viewerKey ? pairing.b : pairing.a) : null;
    const viewerName = viewerKey ? (lexicon.find((p: any) => p.key === viewerKey)?.name ?? null) : null;

    // Narrow in the database by who and when; services/leagueQuestion.js ranks.
    const q = readQuestion(question, { lexicon, viewerKey, opponentKey, currentYear: meta.current_year });
    const base = () => supabase
      .from('league_facts')
      .select('id, topic, owners, seasons, weeks, phase, text, link')
      .eq('generation', meta.generation)
      .limit(600);
    const queries = q.owners.length
      ? [base().overlaps('owners', q.owners)]
      : q.seasons.length
        ? [base().overlaps('seasons', q.seasons)]
        : [base().in('topic', ['champions', 'career', 'postseason'])];
    // The champions list names only champions, so it is asked for by topic too.
    if (q.owners.length && TITLE_WORDS.test(question)) queries.push(base().eq('topic', 'champions'));
    const fetched = await Promise.all(queries);
    const failed = fetched.find((r) => r.error);
    if (failed) throw failed.error;
    const byId = new Map();
    for (const r of fetched) for (const card of r.data ?? []) byId.set(card.id, card);
    const cards = [...byId.values()];

    const asOf = meta.current_year ? `${meta.current_year} week ${meta.played_week}` : null;
    const result = await answerQuestion({
      question,
      cards: cards ?? [],
      lexicon,
      viewerKey,
      viewerName,
      opponentKey,
      currentYear: meta.current_year,
      asOf,
      model: llm?.call ?? null
    });

    await supabase.from('chat_log').insert({
      user_id: user.id,
      question,
      kind: result.kind,
      answer: result.text,
      card_ids: result.sources.map((c: any) => c.id).filter(Boolean),
      attempts: result.attempts,
      problems: result.problems,
      model: llm?.name ?? null,
      latency_ms: Date.now() - started
    });

    return json({
      kind: result.kind,
      text: result.text,
      sources: result.sources.map((c: any) => ({ text: c.text, link: c.link ?? null })),
      asOf
    });
  } catch (e) {
    console.error('league-chat failed:', e);
    await supabase.from('chat_log').insert({
      user_id: user.id,
      question,
      kind: 'error',
      problems: [String((e as Error)?.message ?? e).slice(0, 300)],
      model: llm?.name ?? null,
      latency_ms: Date.now() - started
    });
    return json({ error: 'Something went wrong answering that. Try again in a minute.' }, 500);
  }
});
