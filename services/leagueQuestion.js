/**
 * Answering a question about the league from fact cards (services/leagueFacts.js).
 *
 * The model words the answer and nothing else. Code decides which cards it
 * sees, and code checks the draft before anyone reads it: every number, record
 * and person in the answer must be in those cards (or the question). A draft
 * that invents one is retried once with the problem named; a second miss shows
 * the cards themselves instead of a sentence nobody can trust.
 *
 * Pure: the model is a function passed in (`model(messages) → string`), so the
 * whole pipeline is tested with recorded replies and no network. The edge
 * function (supabase/functions/league-chat) does the I/O around it.
 */

const STOPWORDS = new Set(
  ('the a an and or of to in on at for with by from is are was were be been it its this that these those ' +
    'what who whom whose which when where why how did does do has have had my me i you your our we us they ' +
    'them their his her he she than then there about against vs versus ever all most more best worst many much ' +
    'any can could would should will just like get got been being').split(' ')
);

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, once: 1, twice: 2
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, word) => new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}('s)?([^a-z0-9]|$)`).test(text);

/**
 * What a question is about, found without a model.
 *
 * @param {string} question
 * @param {object} context
 * @param {Array<{ key: string, name: string, names: string[] }>} context.lexicon
 * @param {string|null} [context.viewerKey] the asker's ownerKey, for "me" / "my"
 * @param {string|null} [context.opponentKey] the asker's opponent this week
 * @param {number|null} [context.currentYear]
 */
export function readQuestion(question, { lexicon = [], viewerKey = null, opponentKey = null, currentYear = null } = {}) {
  const text = ` ${String(question ?? '').toLowerCase().replace(/[’‘]/g, "'")} `;
  const owners = new Set();

  for (const person of lexicon) {
    if (person.names.some((name) => hasWord(text, name))) owners.add(person.key);
  }
  if (viewerKey && /(^|[^a-z])(i|me|my|mine|myself|i'm|im|i've)([^a-z]|$)/.test(text)) owners.add(viewerKey);
  if (opponentKey && /opponent|who (am |do )?i play|who i'm playing|this week/.test(text)) owners.add(opponentKey);

  const seasons = new Set((text.match(/\b20\d\d\b/g) ?? []).map(Number));
  if (currentYear && /\bthis (year|season)\b/.test(text)) seasons.add(currentYear);
  if (currentYear && /\blast (year|season)\b/.test(text)) seasons.add(currentYear - 1);

  const weeks = new Set([...text.matchAll(/\b(?:week|wk)\s*(\d{1,2})\b/g)].map((m) => Number(m[1])));

  const phase = /\bconsolation\b/.test(text)
    ? 'consolation'
    : /\b(playoffs?|postseason|bracket|championship|title|final|finals|semis?|semifinals?)\b/.test(text)
      ? 'playoff'
      : /\bregular season\b/.test(text)
        ? 'regular'
        : null;

  const words = [...new Set(
    text.replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
  )];

  return { owners: [...owners], seasons: [...seasons], weeks: [...weeks], phase, words };
}

const TITLE_WORDS = /\b(champion|champions|championship|championships|title|titles|won it all|rings?)\b/;

/**
 * What kind of card a question is after, read from its wording. Each entry is
 * [pattern, topics it points at]. A question can match several.
 */
const INTENTS = [
  [/\b(record|series|leads?|all-?time|head.to.head|h2h|vs\.?|versus|against|beaten?)\b/, ['h2h_series']],
  [/\b(biggest|largest|blowout|margin|crushed|destroyed)\b/, ['h2h_biggest_win']],
  [/\b(highest|most points|best score|top score|career high)\b/, ['h2h_high_score']],
  [/\b(points|average|averages|ppg|scored against)\b/, ['h2h_points']],
  [/\b(streak|in a row|straight)\b/, ['h2h_streak', 'h2h_last_win']],
  [/\b(closest|narrowest|tightest|nail.?biter)\b/, ['h2h_closest']],
  [/\blast (time|meeting|game|played|play|met)\b|\bmost recent\b/, ['h2h_last_meeting', 'h2h_last_win']],
  [TITLE_WORDS, ['champions', 'postseason']],
  [/\b(made|make|missed|miss|reach|reached)\b.*\bplayoffs?\b|\bplayoff (appearances|trips)\b/, ['postseason']],
  [/\b(career|all.time record|overall)\b/, ['career']],
  [/\b(do|did|go|went|finish|finished|season|record)\b.*\b20\d\d\b|\b20\d\d\b.*\b(season|finish|finished|record)\b/, ['season']],
  [/\bthis week\b|\bplaying\b|\bwho (do|am) i play/, ['this_week']]
];

const TOPIC_PRIOR = { h2h_series: 4, postseason: 3, career: 3, champions: 2, this_week: 2, season: 1 };

/**
 * The cards worth showing the model for this question, best first.
 *
 * Every card must be about someone, some season or some week the question
 * names; a question that names none of those must share a word with the card.
 * Within that, the card type the wording asks for ranks first.
 *
 * @param {object[]} cards candidates, each `{ id, topic, owners, seasons, weeks, phase, text }`
 * @param {ReturnType<typeof readQuestion>} q
 * @param {{ limit?: number, question?: string, lexicon?: object[], viewerKey?: string|null }} [options]
 */
export function selectCards(cards, q, { limit = 30, question = '', lexicon = [], viewerKey = null } = {}) {
  const lower = String(question).toLowerCase();
  const wanted = new Set(INTENTS.filter(([re]) => re.test(lower)).flatMap(([, topics]) => topics));
  if (q.weeks.length) wanted.add('game');
  if (q.owners.length > 1 && wanted.size === 0) wanted.add('h2h_series');
  const asksTitles = TITLE_WORDS.test(lower);
  const named = q.owners.length > 0 || q.seasons.length > 0 || q.weeks.length > 0;

  // Whose point of view: "my …" is the asker; "Ben's …" is Ben.
  const subjects = new Set();
  if (viewerKey && /(^|[^a-z])my([^a-z]|$)/.test(lower)) subjects.add(viewerKey);
  for (const person of lexicon) {
    if (person.names.some((n) => lower.includes(`${n}'s`))) subjects.add(person.key);
  }
  const subjectNames = lexicon.filter((p) => subjects.has(p.key)).map((p) => p.name);

  // Name words would match every card about that person; they are not topic words.
  const nameWords = new Set(lexicon.flatMap((p) => p.names.flatMap((n) => n.split(' '))));
  const words = q.words.filter((w) => !nameWords.has(w));

  const scored = [];
  for (const card of cards) {
    const text = card.text.toLowerCase();
    const wordHits = Math.min(5, words.filter((w) => text.includes(w)).length);
    const ownerHits = q.owners.filter((o) => card.owners.includes(o)).length;

    if (q.owners.length && ownerHits === 0 && !(card.topic === 'champions' && asksTitles)) continue;
    if (!named && wordHits === 0 && !wanted.has(card.topic)) continue;

    let s = ownerHits * 10;
    if (q.owners.length > 1 && ownerHits === q.owners.length) s += 15;
    if (q.owners.length === 1 && card.topic === 'game' && !q.weeks.length) s -= 4;

    if (q.seasons.length) {
      if (card.seasons.some((y) => q.seasons.includes(y))) s += 6;
      else if (card.topic === 'game' || card.topic === 'season') continue;
    }
    if (q.weeks.length) {
      if (card.weeks.some((w) => q.weeks.includes(w))) s += 6;
      else if (card.topic === 'game') continue;
    }
    if (q.phase && card.phase) s += card.phase === q.phase ? 4 : -3;
    if (wanted.has(card.topic)) s += 12;
    else s += TOPIC_PRIOR[card.topic] ?? 0;
    if (asksTitles && card.topic === 'champions') s += 4;
    if (subjectNames.some((name) => card.text.startsWith(name))) s += 3;
    s += wordHits;

    if (s > 0) scored.push({ card, s, recent: (card.seasons.at(-1) ?? 0) * 100 + (card.weeks.at(-1) ?? 0) });
  }

  scored.sort((a, b) => (b.s - a.s) || (b.recent - a.recent));
  return scored.slice(0, limit).map((entry) => entry.card);
}

/**
 * The one message pair the model gets.
 *
 * @param {string} question
 * @param {object[]} cards from `selectCards`
 * @param {{ viewerName?: string|null, asOf?: string|null }} [options]
 */
export function buildMessages(question, cards, { viewerName = null, asOf = null } = {}) {
  const system = [
    'You answer questions about "og jits", a fantasy football league, for its members.',
    'Use ONLY the numbered facts provided. They are complete and correct; you know nothing else about this league.',
    'Every number, score, record and year you write must appear in the facts. Copy them exactly, with digits.',
    'Do not calculate percentages or averages, or combine numbers, unless you show both numbers you used.',
    'If the facts do not answer the question, say so in one sentence. Never guess.',
    'Refer to people by first name. ' + (viewerName ? `The person asking is ${viewerName}: call them "you".` : ''),
    'Answer in 1 to 3 short sentences, then list the facts you used like [F2][F5].'
  ].join(' ');
  const facts = cards.map((card, i) => `[F${i + 1}] ${card.text}`).join('\n');
  const user = `${asOf ? `Data as of ${asOf}.\n` : ''}Facts:\n${facts}\n\nQuestion: ${question}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

const RECORD_RE = /\b\d{1,3}-\d{1,3}(?:-\d{1,3})?\b/g;
const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

const toNumber = (token) => Number(String(token).replace(/,/g, ''));

function numbersIn(text) {
  const out = (String(text).match(NUMBER_RE) ?? []).map(toNumber);
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (hasWord(String(text).toLowerCase(), word)) out.push(value);
  }
  return out;
}

const recordsIn = (text) => String(text).match(RECORD_RE) ?? [];
const flip = (r) => r.split('-').length === 2 ? r.split('-').reverse().join('-') : `${r.split('-')[1]}-${r.split('-')[0]}-${r.split('-')[2]}`;

/** Drops "[F3]" citation markers. */
export const stripCitations = (text) => String(text).replace(/\s*\[F\d+\]/g, '').trim();

/** The card numbers an answer cites, "[F2][F5]" → [2, 5]. */
export const citedIndexes = (text) =>
  [...new Set([...String(text).matchAll(/\[F(\d+)\]/g)].map((m) => Number(m[1])))];

/**
 * Whether a draft says only what the cards say.
 *
 * A number passes when it is in a card or the question (to the hundredth), or
 * when it is the sum or difference of two numbers that the answer itself
 * states and the cards back ("8-2, six games ahead"). Records ("8-2") must
 * appear as records, in either order. A person named must be one the cards
 * are about.
 *
 * @param {string} answer
 * @param {{ cards: object[], question?: string, lexicon?: object[] }} context
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function verifyAnswer(answer, { cards = [], question = '', lexicon = [] }) {
  const problems = [];
  const body = stripCitations(answer);
  const source = `${cards.map((c) => c.text).join('\n')}\n${question}`;

  const knownRecords = new Set(recordsIn(source));
  for (const r of recordsIn(body)) {
    if (!knownRecords.has(r) && !knownRecords.has(flip(r))) problems.push(`the record ${r} is not in the facts`);
  }

  const known = numbersIn(source);
  const isKnown = (n) => known.some((k) => Math.abs(k - n) < 0.005);
  const stated = numbersIn(body.replace(RECORD_RE, (r) => r.replace(/-/g, ' '))).filter(isKnown);
  const derivable = (n) =>
    stated.some((a) => stated.some((b) => Math.abs(a + b - n) < 0.005 || Math.abs(Math.abs(a - b) - n) < 0.005));

  const unchecked = body.replace(RECORD_RE, ' ');
  for (const n of numbersIn(unchecked)) {
    if (!isKnown(n) && !derivable(n)) problems.push(`the number ${n} is not in the facts`);
  }

  const lowerBody = ` ${body.toLowerCase()} `;
  const lowerQuestion = ` ${String(question).toLowerCase()} `;
  const coveredKeys = new Set(cards.flatMap((c) => c.owners ?? []));
  for (const person of lexicon) {
    const named = person.names.some((name) => hasWord(lowerBody, name));
    if (!named || coveredKeys.has(person.key)) continue;
    if (person.names.some((name) => hasWord(lowerQuestion, name))) continue;
    problems.push(`${person.name} is not in the facts`);
  }

  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}

/** What the member sees when no draft passes: the cards themselves. */
export function factsAnswer(cards, { count = 5 } = {}) {
  const shown = cards.slice(0, count);
  return {
    kind: 'facts',
    text: shown.length ? "Here's what I found:" : "I don't have anything on that yet.",
    sources: shown
  };
}

/**
 * The whole answer, model or no model.
 *
 * @param {object} input
 * @param {string} input.question
 * @param {object[]} input.cards candidate cards (already narrowed by the query)
 * @param {object[]} input.lexicon
 * @param {string|null} [input.viewerKey]
 * @param {string|null} [input.viewerName]
 * @param {string|null} [input.opponentKey]
 * @param {number|null} [input.currentYear]
 * @param {string|null} [input.asOf]
 * @param {((messages: object[]) => Promise<string>)|null} [input.model]
 * @returns {Promise<{ kind: 'answer'|'facts'|'none', text: string, sources: object[], attempts: number, problems: string[] }>}
 */
export async function answerQuestion({
  question,
  cards,
  lexicon,
  viewerKey = null,
  viewerName = null,
  opponentKey = null,
  currentYear = null,
  asOf = null,
  model = null
}) {
  const q = readQuestion(question, { lexicon, viewerKey, opponentKey, currentYear });
  const selected = selectCards(cards, q, { question, lexicon, viewerKey });

  if (selected.length === 0) {
    return {
      kind: 'none',
      text: "I don't have anything on that yet. Try naming a member, a season or a week.",
      sources: [],
      attempts: 0,
      problems: []
    };
  }
  if (!model) return { ...factsAnswer(selected), attempts: 0, problems: [] };

  const messages = buildMessages(question, selected, { viewerName, asOf });
  let problems = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const draft = await model(attempt === 1
      ? messages
      : [...messages, {
        role: 'user',
        content: `Your last answer included things that are not in the facts (${problems.join('; ')}). Answer again using only the facts, copying numbers exactly.`
      }]);
    const check = verifyAnswer(draft, { cards: selected, question, lexicon });
    if (check.ok) {
      const cited = citedIndexes(draft).map((i) => selected[i - 1]).filter(Boolean);
      return {
        kind: 'answer',
        text: stripCitations(draft),
        sources: cited.length ? cited : selected.slice(0, 3),
        attempts: attempt,
        problems: []
      };
    }
    problems = check.problems;
  }
  return { ...factsAnswer(selected), attempts: 2, problems };
}

/**
 * A model behind any OpenAI-compatible chat endpoint: Cloudflare Workers AI
 * (`https://api.cloudflare.com/client/v4/accounts/<id>/ai/v1`), Groq
 * (`https://api.groq.com/openai/v1`), Hugging Face or Together. Switching
 * provider is a base URL, a key and a model name.
 */
export function openAiCompatibleModel({ baseUrl, apiKey, model, fetchImpl = fetch, maxTokens = 220 }) {
  return async (messages) => {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0, max_tokens: maxTokens })
    });
    if (!res.ok) throw new Error(`model request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return String(data?.choices?.[0]?.message?.content ?? '');
  };
}
