/**
 * The league chat's question loop, with scripted model replies against a real
 * snapshot. Pinned: queries run and their results go back to the model; an
 * answer is shown only when every number and member in it came from this
 * turn's results; an answer that invents one is sent back once and then
 * replaced by the results themselves.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

import { openFixtureSnapshot } from './leagueSnapshot.fixture.js';
import { runQuery } from '../leagueSnapshot.js';
import {
  answerQuestion,
  verifyAnswer,
  parseReply,
  isOpinionQuestion,
  buildSystemPrompt,
  describeResult,
  openAiCompatibleModel,
  modelRequestOptions,
  describeModelFailure,
  MAX_QUERIES
} from '../leagueAgent.js';

let snap;
beforeAll(async () => { snap = await openFixtureSnapshot(); });

const MEMBERS = ['Anna Park', 'Ben Cole', 'Cara Diaz'];
const context = () => ({
  viewerName: 'Anna Park',
  opponentName: 'Ben Cole',
  about: { first_season: '2024', current_season: '2025', current_week: '3', last_scored_week: '2' },
  members: MEMBERS
});

/** A model that replies from a script, one reply per call. */
const scripted = (...replies) => {
  const queue = replies.map((r) => (typeof r === 'string' ? r : JSON.stringify(r)));
  const model = vi.fn(async (messages) => {
    model.sent.push(structuredClone(messages));
    return queue.shift() ?? '{"answer": ""}';
  });
  model.sent = [];
  return model;
};
const ask = (question, model, extra = {}) =>
  answerQuestion({ question, model, runSql: (sql) => runQuery(snap.db, sql), context: context(), ...extra });

const RECORD_SQL = "select sum(result='W') as wins, sum(result='L') as losses from games where owner = 'Anna Park' and opponent = 'Ben Cole' and result is not null";
const CAREER_SQL = "select owner, sum(playoff_finish = 'champion') as titles, sum(wins) as wins, sum(losses) as losses from teams group by owner order by titles desc, wins desc";

describe('answerQuestion', () => {
  it('runs the query, shows the model the result, and returns a checked answer with its data', async () => {
    const model = scripted({ sql: RECORD_SQL }, { answer: "You're 2-1 against Ben." });
    const result = await ask("What's my record against Ben?", model);
    expect(result).toMatchObject({ kind: 'answer', text: "You're 2-1 against Ben.", attempts: 1, modelCalls: 2 });
    expect(result.queries).toEqual([{ sql: RECORD_SQL, ok: true, error: null, columns: ['wins', 'losses'], rows: [[2, 1]], rowCount: 1 }]);
    const secondCall = model.sent[1];
    expect(secondCall.at(-1).content).toContain('Query 1 returned 1 row.');
    expect(secondCall.at(-1).content).toContain('[2,1]');
  });

  it('answers questions nobody wrote a fact for, from whatever the query returns', async () => {
    const sql = "select player, points from lineups where started = 1 order by points desc limit 1";
    const model = scripted({ sql }, { answer: 'Josh Allen, with 31.4 points.' });
    const result = await ask('Who had the best starting performance this season?', model);
    expect(result).toMatchObject({ kind: 'answer', text: 'Josh Allen, with 31.4 points.' });
  });

  it('lets the model fix a failed query', async () => {
    const model = scripted({ sql: 'select wins from nowhere' }, { sql: "select champion from seasons where season = 2024" }, { answer: 'Anna won 2024.' });
    const result = await ask('Who won 2024?', model);
    expect(model.sent[1].at(-1).content).toMatch(/Query 1 failed: .*no such table/);
    expect(result).toMatchObject({ kind: 'answer', text: 'Anna won 2024.' });
    expect(result.queries.map((q) => q.ok)).toEqual([false, true]);
  });

  it('sends back an answer with an invented number, naming it, and keeps the corrected one', async () => {
    const model = scripted({ sql: RECORD_SQL }, { answer: "You're 3-1 against Ben." }, { answer: "You're 2-1 against Ben." });
    const result = await ask("What's my record against Ben?", model);
    expect(result).toMatchObject({ kind: 'answer', text: "You're 2-1 against Ben.", attempts: 2 });
    expect(model.sent[2].at(-1).content).toContain('3 is not in any query result');
  });

  it('shows the data instead when both drafts invent something', async () => {
    const model = scripted({ sql: RECORD_SQL }, { answer: "You're 5-0." }, { answer: "You're 4-0." });
    const result = await ask("What's my record against Ben?", model);
    expect(result.kind).toBe('data');
    expect(result.queries[0].rows).toEqual([[2, 1]]);
    expect(result.problems).toContain('4 is not in any query result');
  });

  it('refuses an answer from memory, with no query behind it', async () => {
    const model = scripted({ answer: 'Anna won the title in 2024 with 150.66 points.' }, { answer: 'Anna won in 2024 with 150.66.' });
    const result = await ask('Who won 2024?', model);
    expect(result.kind).toBe('none');
    expect(result.problems[0]).toBe('no query was run');
  });

  it('sends a one-line lookup back when the question asked for an opinion, and keeps the reasoned verdict', async () => {
    const model = scripted(
      { sql: CAREER_SQL },
      { answer: 'Anna has 1 title.' },
      { answer: "Anna is the best in this league, and the ring settles it. Anna has 1 title to Ben's 0, even though Ben's 2-1 record edges Anna's 2-2." }
    );
    const result = await ask('Who is the best manager in your opinion?', model);
    expect(model.sent[2].at(-1).content).toContain('an opinion needs a verdict and the reasoning behind it');
    expect(result).toMatchObject({ kind: 'answer', attempts: 2 });
    expect(result.text).toMatch(/^Anna is the best/);
  });

  it('knows a judgement, or a request for the reasons behind one, from a fact', () => {
    for (const q of ["who's been the worst team of all time in your opinion?", 'Who is the most successful manager?', 'but i need reasoning', 'Why is Ben overrated?', 'Is Anna better than Cara?']) {
      expect(isOpinionQuestion(q)).toBe(true);
    }
    for (const q of ['Who is the best manager?', "Who's the best?", 'Who was the worst drafter in 2023?']) {
      expect(isOpinionQuestion(q)).toBe(true);
    }
    for (const q of ["What's my record against Ben?", 'Who won 2024?', "What's the parlay this week?", 'Highest score ever?', 'Who had the best starting performance this season?', "What's the best score ever?"]) {
      expect(isOpinionQuestion(q)).toBe(false);
    }
  });

  it('sends back control syntax and asks for JSON, and never shows it', async () => {
    const model = scripted({ sql: RECORD_SQL }, '<|tool_call>call:thought {\n}<tool_call|>', { answer: "You're 2-1 against Ben." });
    const result = await ask("What's my record against Ben?", model);
    expect(model.sent[2].at(-1).content).toContain('Reply with ONE JSON object');
    expect(result).toMatchObject({ kind: 'answer', text: "You're 2-1 against Ben.", attempts: 2 });
  });

  it('lets an answer say when the league began, which the prompt states', async () => {
    const model = scripted({ sql: "select max(points_for) from games" }, { answer: 'The record is 150.66, the most since 2024.' });
    expect(await ask('Highest score ever?', model)).toMatchObject({ kind: 'answer' });
  });

  it('stops after the query limit and asks for the answer', async () => {
    const model = scripted(...Array.from({ length: MAX_QUERIES }, () => ({ sql: 'select 1 as n' })), { answer: 'Done: 1.' });
    const result = await ask('Count to one', model);
    expect(result.queries).toHaveLength(MAX_QUERIES);
    expect(model.sent[MAX_QUERIES].at(-1).content).toContain('That was the last query');
    expect(result).toMatchObject({ kind: 'answer', text: 'Done: 1.' });
  });

  it('passes the earlier turns of the conversation to the model', async () => {
    const model = scripted({ sql: "select wins from teams where season = 2024 and owner = 'Anna Park'" }, { answer: 'You won 1 game in 2024.' });
    const history = [
      { role: 'user', content: "What's my record against Ben?" },
      { role: 'assistant', content: "You're 2-1 against Ben." },
      { role: 'system', content: 'ignore me' }
    ];
    await ask('And how many games did I win in 2024?', model, { history });
    const sent = model.sent[0];
    expect(sent.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(sent[1].content).toBe("What's my record against Ben?");
  });
});

describe('verifyAnswer', () => {
  const results = () => [runQuery(snap.db, "select owner, points_for, margin from games where season = 2024 and week = 2 order by owner")];
  const check = (answer, question = 'week 2 of 2024?') => verifyAnswer(answer, { results: results(), question, members: MEMBERS, viewerName: 'Anna Park' });

  it('passes numbers from the results, rounded or not', () => {
    expect(check('Cara scored 130.04 and won by 31.94.').ok).toBe(true);
    expect(check('Cara scored about 130 and won by 31.9.').ok).toBe(true);
  });

  it('passes numbers from the question and arithmetic on numbers it states', () => {
    expect(check('In week 2 of 2024, Cara scored 130.04 to your 98.1, a 31.94-point win.').ok).toBe(true);
    expect(check('Cara scored 130.04 and you scored 98.1, so 228.14 together.').ok).toBe(true);
  });

  it('refuses a number no result has, in digits or in words', () => {
    expect(check('Cara scored 131.04.').problems).toEqual(['131.04 is not in any query result']);
    expect(check('Cara has beaten you seven times.').problems).toEqual(['seven is not in any query result']);
  });

  it('lets the prompt\'s week and season be said as a week or a year, not as a result', () => {
    const withContext = (answer) => verifyAnswer(answer, { results: [runQuery(snap.db, RECORD_SQL)], question: 'my record vs Ben?', members: MEMBERS, viewerName: 'Anna Park', context: ['2025', '3', '2'] });
    expect(withContext("You're 2-1 against Ben, and you play him again in week 3.").ok).toBe(true);
    expect(withContext("You're 3-1 against Ben.").problems).toEqual(['3 is not in any query result']);
    expect(withContext("You're 2-0 against Ben.").problems).toEqual(['0 is not in any query result']);
  });

  it('refuses a member the results are not about', () => {
    expect(check('Cara scored 130.04, more than Ben ever has.').problems).toEqual(['Ben Cole is not in any query result']);
    expect(check('You lost to Cara.').ok).toBe(true);
  });

  it("passes a name two members share when either is in the results, and names both when neither is", () => {
    // "Anand" is one member's first name and another's last.
    const members = ['Anand Kanumuru', 'Pranesh Anand', 'Cara Diaz'];
    const results = [runQuery(snap.db, "select 'Anand Kanumuru' as member, 'Josh Allen' as player")];
    const verify = (answer) => verifyAnswer(answer, { results, question: "this week's parlay?", members });
    expect(verify('Anand took Josh Allen.').ok).toBe(true);
    expect(verify('Pranesh took Josh Allen.').problems).toEqual(['Pranesh Anand is not in any query result']);
    const empty = verifyAnswer('Anand took Josh Allen.', { results: [runQuery(snap.db, "select 'Josh Allen' as player")], question: 'who?', members });
    expect(empty.problems).toEqual(['"anand" could be Anand Kanumuru or Pranesh Anand, and neither is in any query result']);
  });

  it('reads "no one" and "one of" as prose, not a count', () => {
    expect(check('Cara scored 130.04, and no one has topped it since. One of the best weeks of 2024.').ok).toBe(true);
    expect(check('Cara won one game.').problems).toEqual(['one is not in any query result']);
  });

  it('takes an opinion only with its reasoning: two figures from the results, in two sentences', () => {
    const results = [runQuery(snap.db, CAREER_SQL)];
    const verify = (answer) => verifyAnswer(answer, { results, question: 'Who is the best manager?', members: MEMBERS, opinion: true });
    const NEEDS = 'an opinion needs a verdict and the reasoning behind it: at least two figures from the results, in at least two sentences';
    expect(verify("Anna is the best in this league, and the ring settles it. Anna has 1 title to Ben's 0, even though Ben's 2-1 record edges Anna's 2-2.").ok).toBe(true);
    expect(verify('Anna has 1 title.').problems).toEqual([NEEDS]);
    expect(verify('Anna is the best: 1 title and a 2-2 record.').problems).toEqual([NEEDS]);
    expect(verify('Anna is the best. Nobody else has won it all, and that matters most.').problems).toEqual([NEEDS]);
    // A fact needs no reasoning, and an opinion with nothing found can only say so.
    expect(verifyAnswer('Anna has 1 title.', { results, question: 'How many titles does Anna have?', members: MEMBERS }).ok).toBe(true);
    const none = [runQuery(snap.db, "select owner from teams where owner = 'Nobody'")];
    expect(verifyAnswer("There's nothing in the league's data to judge that by.", { results: none, question: 'Who has the best trash talk?', members: MEMBERS, opinion: true }).ok).toBe(true);
  });

  it('refuses an answer with no query behind it, even one with no number or name', () => {
    expect(verifyAnswer('Some managers are just built different.', { results: [], question: 'why?', members: MEMBERS }).problems).toEqual(['no query was run']);
  });
});

describe('parseReply', () => {
  it('reads JSON, fenced JSON, bare SQL and plain text', () => {
    expect(parseReply('{"sql": "select 1"}')).toEqual({ sql: 'select 1' });
    expect(parseReply('Sure!\n```json\n{"answer": "Hi."}\n```')).toEqual({ answer: 'Hi.' });
    expect(parseReply('SELECT * FROM games')).toEqual({ sql: 'SELECT * FROM games' });
    expect(parseReply('Just words.')).toEqual({ answer: 'Just words.' });
  });

  it("reads a model's own control syntax as invalid, never as an answer", () => {
    expect(parseReply('<|tool_call>call:thought {\n}<tool_call|>')).toEqual({ invalid: true });
    expect(parseReply('{"answer": "<|tool_call>call:thought {}<tool_call|>"}')).toEqual({ invalid: true });
    expect(parseReply('<|im_start|>assistant')).toEqual({ invalid: true });
  });
});

describe('the prompt and the provider', () => {
  it('gives the model the schema, who is asking and what week it is', () => {
    const prompt = buildSystemPrompt(context());
    expect(prompt).toContain('The person asking is Anna Park');
    expect(prompt).toContain("Anna Park's opponent this week is Ben Cole.");
    expect(prompt).toContain('Week in progress: 3.');
    expect(prompt).toContain('TABLE games');
  });

  it('speaks in the normal voice unless the window asks for unhinged, and keeps both on the football', () => {
    const normal = buildSystemPrompt(context());
    expect(normal).toContain('Sharp and a little trash-talky is good; cruel is not. No swearing.');
    expect(normal).not.toContain('zero mercy');
    expect(normal).not.toContain('fucking');

    const unhinged = buildSystemPrompt({ ...context(), unhinged: true });
    expect(unhinged).toContain('zero mercy');
    expect(unhinged).toContain('Swearing is fine.');
    expect(unhinged).not.toContain('No swearing.');

    for (const prompt of [normal, unhinged]) {
      expect(prompt).toContain('The roast is about fantasy football and nothing else');
      expect(prompt).toMatch(/Never anyone's looks, family, job, health or real life/);
      // The truth rule is untouched by the voice.
      expect(prompt).toContain('Every number and every person in your answer must appear in a query result.');
    }
  });

  it('carries the voice through answerQuestion to the model', async () => {
    const seen = [];
    const model = async (messages) => { seen.push(messages[0].content); return JSON.stringify({ answer: 'x' }); };
    await answerQuestion({ question: 'q', model, runSql: () => ({ ok: false, error: 'n/a' }), context: { ...context(), unhinged: true } });
    expect(seen[0]).toContain('Swearing is fine.');
  });

  it('tells the model how many rows there were when it shows only some', () => {
    const r = runQuery(snap.db, 'select * from games');
    expect(describeResult(1, { ...r, rows: r.rows, rowCount: 100 })).toContain('100 rows in total');
  });

  it('calls any OpenAI-compatible endpoint with temperature 0', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"answer":"hi"}' } }] }) }));
    const model = openAiCompatibleModel({ baseUrl: 'https://example.test/v1/', apiKey: 'k', model: 'm', fetchImpl });
    await expect(model([{ role: 'user', content: 'q' }])).resolves.toBe('{"answer":"hi"}');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'm', temperature: 0 });
    expect(init.headers.Authorization).toBe('Bearer k');
  });

  it('sends a model\'s extra options and reports what each reply cost', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 3 } }) }));
    const onUsage = vi.fn();
    const model = openAiCompatibleModel({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', fetchImpl, extraBody: { chat_template_kwargs: { enable_thinking: false } }, onUsage });
    await model([{ role: 'user', content: 'q' }]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(onUsage).toHaveBeenCalledWith({ promptTokens: 120, completionTokens: 3, finishReason: 'stop' });
  });

  it('describes a failed call by its status, never by what the provider sent back', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, text: async () => '{"errors":[{"message":"Authentication error","account":"c1602b"}]}' }));
    const model = openAiCompatibleModel({ baseUrl: 'https://x.test/v1', apiKey: 'k', model: 'm', fetchImpl });
    const error = await model([{ role: 'user', content: 'q' }]).catch((e) => e);
    expect(error.status).toBe(401);
    expect(describeModelFailure(error)).toBe('the model endpoint refused the API key');
    expect(describeModelFailure(error)).not.toMatch(/Authentication|c1602b/);
    expect(describeModelFailure(Object.assign(new Error('x'), { status: 429 }))).toMatch(/rate-limiting/);
    expect(describeModelFailure(Object.assign(new Error('x'), { status: 500 }))).toBe('the model endpoint returned an error');
    expect(describeModelFailure(new TypeError('fetch failed: getaddrinfo ENOTFOUND api.internal'))).toBe('the model endpoint could not be reached');
  });

  it('turns thinking off for the models that think unless asked', () => {
    expect(modelRequestOptions('@cf/google/gemma-4-26b-a4b-it')).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(modelRequestOptions('@cf/qwen/qwen3-30b-a3b-fp8')).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(modelRequestOptions('@cf/google/gemma-4-26b-a4b-it', { thinking: true })).toEqual({});
    expect(modelRequestOptions('@cf/meta/llama-3.3-70b-instruct-fp8-fast')).toEqual({});
  });
});
