/**
 * The league chat's question loop (JITS-42): the model looks the answer up
 * with SQL against the league snapshot, then words it — and code checks the
 * wording against what the queries returned before a member sees it.
 *
 * Nothing about any particular question is written here. The model reads the
 * snapshot's schema (`describeSchema`), writes the queries it needs, sees their
 * results, and answers. What this file adds is the part a model cannot be
 * trusted with: every number and every member it names must have come back
 * from a query this turn. An answer that fails is sent back once with the
 * problems named; a second failure shows the member the query results instead
 * of the sentence. A wrong "7-3" reads exactly like a right "8-2", so a
 * sentence that cannot be checked is not shown.
 *
 * Pure: the model and the query runner are passed in, so the loop is tested
 * with recorded replies against a real snapshot built from fixture rows.
 */

import { describeSchema } from './leagueSnapshot.js';

export const MAX_QUERIES = 4;
export const RESULT_ROWS_FOR_MODEL = 40;
export const RESULT_ROWS_FOR_MEMBER = 50;
export const HISTORY_TURNS = 6;

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, once: 1, twice: 2, thrice: 3
};

/**
 * The system prompt: the schema, who is asking, and the rules.
 *
 * @param {{ viewerName?: string|null, opponentName?: string|null, about?: Record<string,string|null>, members?: string[] }} context
 */
export function buildSystemPrompt({ viewerName = null, opponentName = null, about = {}, members = [] } = {}) {
  const lines = [
    'You answer questions about "og jits", a fantasy football league, for its members, by querying a SQLite database of the league\'s history.',
    '',
    'Reply with ONE JSON object and nothing else:',
    '  {"sql": "SELECT ..."}   to run a query (SQLite, read-only); you will be shown the result',
    '  {"answer": "..."}       to give the final answer',
    `You may run up to ${MAX_QUERIES} queries before answering.`,
    '',
    'Rules:',
    '- Always query before answering. You know nothing about this league except what the queries return.',
    '- Every number and every person in your answer must appear in a query result. Do all arithmetic (totals, averages, percentages, differences, counts) in SQL, not in your head.',
    '- The games table lists every game twice, once per side. Filter on owner (or opponent) so each game counts once.',
    '- Records and points in teams are regular season only. "Playoffs" means phase = \'playoff\'; consolation games are not playoff games.',
    '- Use owner names exactly as they appear in the members table. Match names case-insensitively with LIKE when the question uses a first name.',
    '- If the data cannot answer the question, say so plainly in the answer. Never guess.',
    '- Answer in one to three short sentences, refer to people by first name, and do not mention SQL, tables or queries.',
    viewerName
      ? `- The person asking is ${viewerName}: "I", "me" and "my" mean ${viewerName}; call them "you".`
      : '- The person asking has no team in the league.',
    opponentName ? `- ${viewerName}'s opponent this week is ${opponentName}.` : '',
    '',
    `First season: ${about.first_season ?? 'unknown'}. Current season: ${about.current_season ?? 'unknown'}. Week in progress: ${about.current_week ?? 'unknown'}. Latest week with final scores: ${about.last_scored_week ?? 'none'}.`,
    members.length ? `Members: ${members.join(', ')}.` : '',
    '',
    'Schema:',
    describeSchema()
  ];
  return lines.filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
}

/** The model's reply, read as `{ sql }` or `{ answer }`; plain text counts as an answer. */
export function parseReply(text) {
  const raw = String(text ?? '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const obj = JSON.parse(fenced.slice(start, end + 1));
      if (typeof obj?.sql === 'string' && obj.sql.trim()) return { sql: obj.sql.trim() };
      if (typeof obj?.answer === 'string') return { answer: obj.answer.trim() };
    } catch {
      // fall through to plain text
    }
  }
  if (/^\s*(select|with)\b/i.test(fenced)) return { sql: fenced.trim() };
  return raw ? { answer: raw } : { answer: '' };
}

/** How a query result is shown to the model. */
export function describeResult(index, result) {
  if (!result.ok) return `Query ${index} failed: ${result.error}\nFix the query, or answer if you cannot.`;
  if (!result.rowCount) return `Query ${index} returned no rows.`;
  const shown = result.rows.slice(0, RESULT_ROWS_FOR_MODEL);
  const body = shown.map((row) => JSON.stringify(row)).join('\n');
  const more = result.rowCount > shown.length ? `\n(${result.rowCount} rows in total; showing the first ${shown.length}. Aggregate in SQL rather than counting these.)` : '';
  return `Query ${index} returned ${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}.\nColumns: ${JSON.stringify(result.columns)}\n${body}${more}`;
}

// -- the check ---------------------------------------------------------------

// A minus sign counts only when it is not the hyphen in "5-3".
const numbersIn = (text) => {
  const found = [];
  for (const m of String(text).matchAll(/(?<![\d.])-?\d[\d,]*(?:\.\d+)?|(?<=\d-)\d+(?:\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (Number.isFinite(n)) found.push({ value: Math.abs(n), text: m[0].replace(/^-/, ''), index: m.index });
  }
  for (const m of String(text).toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    if (m[0] in NUMBER_WORDS) found.push({ value: NUMBER_WORDS[m[0]], text: m[0] });
  }
  return found;
};

const roundings = (n) => [n, Math.round(n), Math.round(n * 10) / 10, Math.round(n * 100) / 100, Math.trunc(n)];

/** Every number a correct answer may state: result cells (and numbers inside them), row counts and the question. */
export function allowedNumbers({ results = [], question = '' }) {
  const allowed = new Set();
  const add = (n) => { for (const r of roundings(Math.abs(n))) allowed.add(r); };
  for (const result of results) {
    if (!result.ok) continue;
    add(result.rowCount);
    for (const row of result.rows) {
      for (const cell of row) {
        if (typeof cell === 'number') add(cell);
        else if (typeof cell === 'string') numbersIn(cell).forEach((n) => add(n.value));
      }
    }
  }
  numbersIn(question).forEach((n) => add(n.value));
  return allowed;
}

/**
 * The names a member can be called by: full, first and last, the latter two
 * only when no other member shares them.
 */
export function memberNames(members = []) {
  const split = members.map((full) => ({ full, parts: full.toLowerCase().split(/\s+/) }));
  const count = (i, word) => split.filter((m) => m.parts.at(i) === word).length;
  return split.map(({ full, parts }) => ({
    full,
    names: [
      full.toLowerCase(),
      ...(count(0, parts[0]) === 1 ? [parts[0]] : []),
      ...(parts.length > 1 && count(-1, parts.at(-1)) === 1 ? [parts.at(-1)] : [])
    ]
  }));
}

const mentions = (text, name) => new RegExp(`(^|[^a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}('s)?([^a-z]|$)`, 'i').test(text);

/**
 * Check a drafted answer against this turn's query results.
 *
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function verifyAnswer(answer, { results = [], question = '', members = [], viewerName = null, opponentName = null, context = [] }) {
  const problems = [];
  const text = String(answer ?? '');
  const allowed = allowedNumbers({ results, question });
  const stated = numbersIn(text);
  // The season and week the prompt names may be said as such ("week 7",
  // "in 2026"), never as a bare figure where a result belongs.
  const contextual = new Set(context.filter((n) => n != null && n !== '').map(Number));
  const saidAsWeekOrYear = (n) => contextual.has(n.value)
    && (n.value >= 2000 || /\bweek\s*$/i.test(text.slice(Math.max(0, n.index - 6), n.index)));

  // A sum or difference of two numbers the answer itself states is arithmetic
  // the member can see; anything else must have come from a query.
  const values = stated.map((n) => n.value);
  const derivable = (v) => values.some((a, i) => values.some((b, j) => i !== j && a !== 0 && b !== 0 && a !== v && b !== v
    && (Math.abs(a + b - v) < 0.006 || Math.abs(a - b - v) < 0.006)));
  for (const n of stated) {
    if (allowed.has(n.value) || allowed.has(Math.round(n.value * 100) / 100)) continue;
    if (saidAsWeekOrYear(n) || derivable(n.value)) continue;
    problems.push(`${n.text} is not in any query result`);
  }

  // Every member named must be in a result, or be the asker, their opponent,
  // or someone the question itself names.
  const haystack = [viewerName ?? '', opponentName ?? '', ...results.filter((r) => r.ok).flatMap((r) => r.rows.flat().map(String))].join('\n').toLowerCase();
  for (const person of memberNames(members)) {
    if (!person.names.some((n) => mentions(text, n))) continue;
    if (haystack.includes(person.full.toLowerCase()) || person.names.some((n) => mentions(question, n))) continue;
    problems.push(`${person.full} is not in any query result`);
  }

  if (!results.some((r) => r.ok) && (stated.length || problems.length)) problems.unshift('no query was run');
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

// -- the loop ---------------------------------------------------------------

const forMember = (sql, result) => ({
  sql,
  ok: result.ok,
  error: result.ok ? null : result.error,
  columns: result.ok ? result.columns : [],
  rows: result.ok ? result.rows.slice(0, RESULT_ROWS_FOR_MEMBER) : [],
  rowCount: result.ok ? result.rowCount : 0
});

/**
 * Answer one question.
 *
 * @param {object} input
 * @param {string} input.question
 * @param {Array<{ role: 'user'|'assistant', content: string }>} [input.history] earlier turns, oldest first
 * @param {(messages: object[]) => Promise<string>} input.model
 * @param {(sql: string) => object} input.runSql `runQuery` bound to the open snapshot
 * @param {{ viewerName?: string|null, opponentName?: string|null, about?: object, members?: string[] }} [input.context]
 * @returns {Promise<{ kind: 'answer'|'data'|'none', text: string, queries: object[], attempts: number, modelCalls: number, problems: string[] }>}
 */
export async function answerQuestion({ question, history = [], model, runSql, context = {} }) {
  const system = buildSystemPrompt(context);
  const turns = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1200) }));
  const messages = [{ role: 'system', content: system }, ...turns, { role: 'user', content: question }];

  const queries = [];
  const results = [];
  let attempts = 0;
  let modelCalls = 0;
  let problems = [];
  const numbersInContext = [context.about?.first_season, context.about?.current_season, context.about?.current_week, context.about?.last_scored_week];

  // At most MAX_QUERIES queries and two drafted answers.
  while (modelCalls < MAX_QUERIES + 2) {
    modelCalls += 1;
    const reply = parseReply(await model(messages));
    messages.push({ role: 'assistant', content: JSON.stringify(reply) });

    if (reply.sql && queries.length < MAX_QUERIES) {
      const result = runSql(reply.sql);
      results.push(result);
      queries.push(forMember(reply.sql, result));
      const last = queries.length === MAX_QUERIES ? '\nThat was the last query. Answer now with {"answer": "..."}.' : '';
      messages.push({ role: 'user', content: describeResult(queries.length, result) + last });
      continue;
    }

    const answer = reply.answer ?? '';
    attempts += 1;
    const check = verifyAnswer(answer, { results, question, members: context.members, viewerName: context.viewerName, opponentName: context.opponentName, context: numbersInContext });
    problems = check.problems;
    if (check.ok && answer) return { kind: 'answer', text: answer, queries, attempts, modelCalls, problems: [] };
    if (attempts >= 2) break;
    messages.push({
      role: 'user',
      content: `That answer cannot be shown: ${problems.join('; ') || 'it was empty'}. Every number and person must come from a query result. Run a query if you need one, or answer again using only the results.`
    });
  }

  const shown = queries.filter((q) => q.ok && q.rowCount > 0);
  if (shown.length) {
    return { kind: 'data', text: "I couldn't put that into words I could check, so here's what the league's data says:", queries: shown, attempts, modelCalls, problems };
  }
  return { kind: 'none', text: "I couldn't find that in the league's data. Try asking it another way.", queries, attempts, modelCalls, problems };
}

/**
 * A model behind any OpenAI-compatible chat endpoint (Cloudflare Workers AI,
 * Groq, a local server). Temperature 0: the same question should get the same
 * queries.
 */
export function openAiCompatibleModel({ baseUrl, apiKey, model, fetchImpl = fetch, maxTokens = 600 }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  return async (messages) => {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`model request failed (${response.status}): ${body.slice(0, 200)}`);
    }
    const data = await response.json();
    return String(data?.choices?.[0]?.message?.content ?? '');
  };
}
