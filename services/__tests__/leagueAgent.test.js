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
  buildSystemPrompt,
  describeResult,
  openAiCompatibleModel,
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
});

describe('parseReply', () => {
  it('reads JSON, fenced JSON, bare SQL and plain text', () => {
    expect(parseReply('{"sql": "select 1"}')).toEqual({ sql: 'select 1' });
    expect(parseReply('Sure!\n```json\n{"answer": "Hi."}\n```')).toEqual({ answer: 'Hi.' });
    expect(parseReply('SELECT * FROM games')).toEqual({ sql: 'SELECT * FROM games' });
    expect(parseReply('Just words.')).toEqual({ answer: 'Just words.' });
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
});
