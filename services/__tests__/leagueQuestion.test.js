/**
 * The league chat, end to end, with recorded model replies instead of a model.
 *
 * What is pinned: a question finds the right cards without a model; a reply is
 * shown only when every number, record and person in it came from those
 * cards; a reply that invents one is retried once and then replaced by the
 * cards themselves. The question set doubles as the JITS-42 phase 1 test set.
 */

import { describe, it, expect, vi } from 'vitest';

import { buildFixture } from './leagueChat.fixture.js';
import {
  readQuestion,
  selectCards,
  buildMessages,
  verifyAnswer,
  answerQuestion,
  stripCitations,
  openAiCompatibleModel
} from '../leagueQuestion.js';

const built = buildFixture();
const ANNA = 'anna park';
const BEN = 'ben cole';
const CARA = 'cara diaz';

const ask = (question, replies, extra = {}) => {
  const queue = Array.isArray(replies) ? [...replies] : [replies];
  const model = vi.fn(async () => queue.shift() ?? '');
  return answerQuestion({
    question,
    cards: built.cards,
    lexicon: built.lexicon,
    viewerKey: ANNA,
    viewerName: 'Anna Park',
    opponentKey: BEN,
    currentYear: built.currentYear,
    asOf: '2025 week 2',
    model,
    ...extra
  }).then((result) => ({ result, model }));
};

describe('readQuestion', () => {
  const read = (q) => readQuestion(q, { lexicon: built.lexicon, viewerKey: ANNA, opponentKey: BEN, currentYear: 2025 });

  it('finds people by full, first or last name, and "me" as the asker', () => {
    expect(read("What's my record against Ben?").owners.sort()).toEqual([ANNA, BEN]);
    expect(read('Has Diaz ever made the playoffs?').owners).toEqual([CARA]);
    expect(read('Cara Diaz vs Ben Cole').owners.sort()).toEqual([BEN, CARA]);
  });

  it('reads "my opponent", years, "last year", weeks and the phase', () => {
    expect(read('my record vs my opponent').owners.sort()).toEqual([ANNA, BEN]);
    const q = read('What happened in week 15 of 2024 in the playoffs?');
    expect(q).toMatchObject({ seasons: [2024], weeks: [15], phase: 'playoff' });
    expect(read('How did Ben do last year?').seasons).toEqual([2024]);
  });

  it('does not take "I" from inside another word', () => {
    expect(read('Which team won 2024?').owners).toEqual([]);
  });
});

describe('selectCards', () => {
  it('puts the head-to-head summary first for a two-person question', () => {
    const q = readQuestion("What's my record against Ben?", { lexicon: built.lexicon, viewerKey: ANNA });
    const [first] = selectCards(built.cards, q, { question: "What's my record against Ben?", lexicon: built.lexicon, viewerKey: ANNA });
    expect(first.text).toMatch(/Anna Park leads Ben Cole 3-1/);
  });

  it('keeps only the asked season and week for a game question', () => {
    const question = 'What did Cara score in week 2 of 2024?';
    const q = readQuestion(question, { lexicon: built.lexicon });
    const cards = selectCards(built.cards, q, { question, lexicon: built.lexicon });
    expect(cards[0].text).toMatch(/^2024 week 2, regular season: Anna Park 98\.10, Cara Diaz 130\.04/);
    expect(cards.every((c) => c.topic !== 'game' || (c.seasons.includes(2024) && c.weeks.includes(2)))).toBe(true);
  });

  it('brings in the champions list for a title question', () => {
    const question = 'Has Ben ever won a title?';
    const q = readQuestion(question, { lexicon: built.lexicon });
    const cards = selectCards(built.cards, q, { question, lexicon: built.lexicon });
    expect(cards.slice(0, 3).map((c) => c.topic)).toEqual(expect.arrayContaining(['champions', 'postseason']));
  });
});

describe('verifyAnswer', () => {
  const cards = built.cards.filter((c) => c.owners.includes(BEN) && c.owners.includes(ANNA));
  const check = (answer) => verifyAnswer(answer, { cards, question: 'me vs Ben', lexicon: built.lexicon });

  it('passes numbers, scores and records copied from the cards', () => {
    expect(check('You lead Ben 3-1, and your best score against Ben was 150.66 in 2024 week 15. [F1][F3]').ok).toBe(true);
  });

  it('refuses a record, a score or a year the cards do not have', () => {
    expect(check('You lead Ben 4-0.').problems).toEqual(['the record 4-0 is not in the facts']);
    expect(check('Your best was 151.66.').problems).toEqual(['the number 151.66 is not in the facts']);
    expect(check('You first met in 2019.').problems).toEqual(['the number 2019 is not in the facts']);
  });

  it('accepts a record told from either side', () => {
    expect(check('Ben is 1-3 against you.').ok).toBe(true);
  });

  it('allows a sum or difference only of numbers the answer itself states', () => {
    expect(check("You're 3-1 against Ben, 2 more wins than losses.").ok).toBe(true);
    expect(check('You have 7 more wins than Ben.').ok).toBe(false);
  });

  it('reads number words too', () => {
    expect(check('You have won three of four meetings.').ok).toBe(true);
    expect(check('You have won nine meetings.').ok).toBe(false);
  });

  it('refuses a person the cards are not about', () => {
    expect(check('You lead Ben 3-1, and Cara has never beaten either of you.').problems).toContain('Cara Diaz is not in the facts');
  });
});

describe('answerQuestion: the phase 1 question set', () => {
  // [question, recorded reply, text the shown answer must contain, a card that must be among the sources]
  const cases = [
    ["What's my record against Ben?", 'You lead Ben 3-1 all-time, including 1-0 in the playoffs. [F1]', '3-1', /leads Ben Cole 3-1/],
    ['Who won the 2024 championship?', 'Anna won the 2024 title, beating Ben 150.66 to 120.06. [F1][F2]', '150.66', /champions|championship game/],
    ['What did Cara score in week 2 of 2024?', 'Cara scored 130.04 against Anna. [F1]', '130.04', /Cara Diaz 130\.04/],
    ['Has Ben ever won a title?', 'No. Ben lost the 2024 championship game and has never won one. [F1]', 'never won', /never won a championship/],
    ['How many times has Cara made the playoffs?', 'Cara has made the playoffs 0 times in 1 completed season. [F1]', '0 times', /made the playoffs 0 times/],
    ["What's my record vs my opponent?", 'You lead Ben 3-1. [F1]', '3-1', /leads Ben Cole 3-1/],
    ['What was my biggest win over Ben?', 'Your biggest win over Ben was by 40.30 in 2024 week 4. [F1]', '40.30', /biggest win over Ben Cole: by 40\.30/],
    ['Who do I play this week?', 'You play Ben this week (2025 week 3). [F1]', 'Ben', /This week/],
    ['How did Ben do in 2024?', 'Ben went 1-2 in the regular season and finished 2nd, losing the championship game. [F1]', '1-2', /Ben Cole in 2024/],
    ['Is my series with Cara close?', "It's tied 1-1 over 2 games. [F1]", '1-1', /tied 1-1/],
    ['When did Ben and Cara last play?', 'Ben beat Cara 111.11 to 90.00 in 2024 week 3. [F1]', '111.11', /Ben Cole 111\.11, Cara Diaz 90\.00/],
    ['How many more games have I won than lost against Ben?', "You're 3-1 against Ben, so 2 more wins than losses. [F1]", '2 more', /3-1/]
  ];

  it.each(cases)('%s', async (question, reply, mustSay, mustCite) => {
    const { result, model } = await ask(question, reply);
    expect(result.kind).toBe('answer');
    expect(result.attempts).toBe(1);
    expect(model).toHaveBeenCalledTimes(1);
    expect(result.text).toContain(mustSay);
    expect(result.text).not.toMatch(/\[F\d+\]/);
    expect(result.sources.some((c) => mustCite.test(c.text))).toBe(true);
  });

  it('retries once when a draft invents a record, naming the problem', async () => {
    const { result, model } = await ask("What's my record against Ben?", ["You're 4-0 against Ben.", 'You lead Ben 3-1. [F1]']);
    expect(result).toMatchObject({ kind: 'answer', attempts: 2, text: 'You lead Ben 3-1.' });
    expect(model.mock.calls[1][0].at(-1).content).toContain('the record 4-0 is not in the facts');
  });

  it('shows the cards instead when both drafts invent something', async () => {
    const { result } = await ask("What's my record against Ben?", ["You're 4-0.", 'You are 5-0.']);
    expect(result.kind).toBe('facts');
    expect(result.text).toBe("Here's what I found:");
    expect(result.sources[0].text).toMatch(/leads Ben Cole 3-1/);
    expect(result.problems).toEqual(['the record 5-0 is not in the facts']);
  });

  it('retries when a draft invents a score, and keeps the corrected one', async () => {
    const { result } = await ask('When did Ben and Cara last play?', [
      'Ben beat Cara 112.11 to 90.00 in 2024 week 3.',
      'Ben beat Cara 111.11 to 90.00 in 2024 week 3. [F1]'
    ], { viewerKey: null, viewerName: null });
    expect(result).toMatchObject({ kind: 'answer', attempts: 2, text: 'Ben beat Cara 111.11 to 90.00 in 2024 week 3.' });
  });

  it('says it has nothing when no card is about the question, without calling the model', async () => {
    const { result, model } = await ask('Who is the best quarterback ever?', 'Tom Brady.', { viewerKey: null });
    expect(result.kind).toBe('none');
    expect(model).not.toHaveBeenCalled();
  });

  it('answers with the cards themselves when no model is configured', async () => {
    const { result } = await ask("What's my record against Ben?", [], { model: null });
    expect(result.kind).toBe('facts');
    expect(result.sources[0].text).toMatch(/leads Ben Cole 3-1/);
  });
});

describe('buildMessages and the provider', () => {
  it('numbers the facts and tells the model who "you" is', () => {
    const [system, user] = buildMessages('my record?', built.cards.slice(0, 2), { viewerName: 'Anna Park', asOf: '2025 week 2' });
    expect(system.content).toContain('The person asking is Anna Park');
    expect(user.content).toContain('[F1] 2024 week 1');
    expect(user.content).toContain('Data as of 2025 week 2.');
  });

  it('strips citation markers', () => {
    expect(stripCitations('You lead 3-1. [F1][F4]')).toBe('You lead 3-1.');
  });

  it('calls any OpenAI-compatible endpoint with temperature 0', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'hi' } }] }) }));
    const model = openAiCompatibleModel({ baseUrl: 'https://example.test/v1/', apiKey: 'k', model: 'm', fetchImpl });
    await expect(model([{ role: 'user', content: 'q' }])).resolves.toBe('hi');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'm', temperature: 0 });
    expect(init.headers.Authorization).toBe('Bearer k');
  });
});
