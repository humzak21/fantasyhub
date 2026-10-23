/**
 * Fact cards: everything the league chat may say, written down by the code
 * that draws the website.
 *
 * The chat (supabase/functions/league-chat) never lets a model recall or work
 * out a number. Each answer is worded from a handful of these cards, and
 * `verifyAnswer` (services/leagueQuestion.js) refuses any number, record or
 * name the cards did not supply. So a card is the unit of truth: one short
 * sentence, built from the same games, head-to-head summary and career rows the
 * History tab shows, tagged with who and when it is about so the right ones
 * can be found without asking a model.
 *
 * Pure. `scripts/build-league-facts.js` feeds it the league's rows and stores
 * the result in `league_facts`; this file decides what the cards say.
 *
 * Phase 1 of JITS-42 covers games, head-to-head and careers. Each further
 * area (records, trades, pick'ems, takes, …) is another builder here.
 */

import { indexLeague, franchiseKeyOf } from './matchupFacts.js';
import { summarizeMatchup } from '../src/components/history/headtohead/matchupSummary.js';
import { ownerKey } from '../utils/ownerAliases.js';

/** Scores and margins to the hundredth, as the record book prints them. */
export const score = (value) => Number(value).toFixed(2);

const record = (w, l, t = 0) => (t ? `${w}-${l}-${t}` : `${w}-${l}`);

const ROUND_NAMES = {
  playoff_first_round: 'playoff first round',
  playoff_semifinals: 'playoff semifinal',
  playoff_championship: 'championship game',
  playoff: 'playoff placement game'
};

/** "regular season", "championship game", "consolation game", … */
export function gameLabel(game) {
  if (game.phase === 'regular') return 'regular season';
  if (game.phase === 'consolation') return 'consolation game';
  return ROUND_NAMES[game.type] ?? 'playoffs';
}

const FINISH_WORDS = {
  champion: 'won the championship',
  '2nd': 'finished 2nd (lost the championship game)',
  '3rd': 'finished 3rd',
  '4th': 'finished 4th',
  '5th': 'finished 5th',
  '6th': 'finished 6th'
};

const tally = (games) => {
  const out = { w: 0, l: 0, t: 0, pf: 0, pa: 0 };
  for (const g of games) {
    if (g.result === 'W') out.w += 1;
    else if (g.result === 'L') out.l += 1;
    else out.t += 1;
    out.pf += g.pf;
    out.pa += g.pa;
  }
  return out;
};

const listYears = (years) => years.join(', ');

/**
 * @param {object} input the rows `indexLeague` takes, plus this week's games
 * @param {Array<{ team1Id: string, team2Id: string }>} [input.pairings] this week's games
 * @param {number|null} [input.currentWeek]
 * @returns {{ cards: object[], lexicon: object[], thisWeek: object[], currentYear: number|null, playedWeek: number }}
 */
export function buildLeagueFacts({ seasons = [], teams = [], results = [], currentSeasonId, pairings = [], currentWeek = null }) {
  const index = indexLeague({ seasons, teams, results, currentSeasonId });
  const currentYear = index.seasonById.get(currentSeasonId)?.year ?? null;

  // Who a franchise was in a given year, and who it is now.
  const ownerIn = new Map(); // `${key}|${year}` → owner
  const latestOwner = new Map();
  for (const [key, list] of index.seasonsByFranchise) {
    for (const row of list) ownerIn.set(`${key}|${row.year}`, row.owner?.trim() || 'Somebody');
    latestOwner.set(key, list[list.length - 1].owner?.trim() || 'Somebody');
  }
  const ownerAt = (key, year) => ownerIn.get(`${key}|${year}`) ?? latestOwner.get(key) ?? 'Somebody';
  const keysOf = (...franchises) =>
    [...new Set(franchises.flatMap((f) => {
      const names = [...index.seasonsByFranchise.get(f) ?? []].map((row) => ownerKey(row.owner));
      return names.filter(Boolean);
    }))];

  const cards = [];
  const add = (card) => cards.push({ weeks: [], seasons: [], owners: [], phase: null, link: '/history', ...card });

  // -- Every game, once ----------------------------------------------------
  for (const [key, games] of index.gamesByFranchise) {
    for (const g of games) {
      if (key > g.opponent) continue; // the other side writes it
      const a = ownerAt(key, g.year);
      const b = ownerAt(g.opponent, g.year);
      const margin = Math.abs(g.pf - g.pa);
      const outcome = g.result === 'T'
        ? 'It was a tie.'
        : `${g.result === 'W' ? a : b} won by ${score(margin)}.`;
      add({
        topic: 'game',
        owners: keysOf(key, g.opponent),
        seasons: [g.year],
        weeks: [g.week],
        phase: g.phase,
        text: `${g.year} week ${g.week}, ${gameLabel(g)}: ${a} ${score(g.pf)}, ${b} ${score(g.pa)}. ${outcome}`
      });
    }
  }

  // -- Head-to-head, every pair that has met --------------------------------
  for (const [key, games] of index.gamesByFranchise) {
    const byOpponent = new Map();
    for (const g of games) {
      if (key > g.opponent) continue;
      if (!byOpponent.has(g.opponent)) byOpponent.set(g.opponent, []);
      byOpponent.get(g.opponent).push(g);
    }
    for (const [them, meetings] of byOpponent) {
      const summary = summarizeMatchup(meetings.map((g) => ({
        team1Score: g.pf,
        team2Score: g.pa,
        isPlayoff: g.phase === 'playoff',
        isConsolation: g.phase === 'consolation',
        year: g.year,
        week: g.week,
        type: g.type,
        phase: g.phase
      })));
      if (!summary) continue;
      const a = latestOwner.get(key);
      const b = latestOwner.get(them);
      const [sa, sb] = summary.sides;
      const owners = keysOf(key, them);
      const years = [...new Set(meetings.map((g) => g.year))];
      const base = { owners, seasons: years };

      // Told from the leader's side throughout, so the total and the split agree.
      const tied = sa.wins === sb.wins && sa.ties === sb.ties;
      const [lead, leadName, trail] = sb.wins > sa.wins ? [sb, b, a] : [sa, a, b];
      const phasePart = ['regular', 'playoff', 'consolation']
        .filter((p) => summary.phases[p] > 0)
        .map((p) => {
          const r = lead.byPhase[p];
          const label = p === 'regular' ? 'in the regular season' : p === 'playoff' ? 'in the playoffs' : 'in consolation games';
          return `${record(r.wins, r.losses, r.ties)} ${label}`;
        })
        .join(', ');
      add({
        ...base,
        topic: 'h2h_series',
        text: tied
          ? `${a} vs ${b}, all-time: the series is tied ${record(sa.wins, sa.losses, sa.ties)} over ${summary.totalGames} ${summary.totalGames === 1 ? 'game' : 'games'} (${a}: ${phasePart}).`
          : `${a} vs ${b}, all-time: ${leadName} leads ${trail} ${record(lead.wins, lead.losses, lead.ties)} over ${summary.totalGames} ${summary.totalGames === 1 ? 'game' : 'games'} (${phasePart}).`
      });
      add({
        ...base,
        topic: 'h2h_points',
        text: `${a} vs ${b}: ${a} has scored ${score(sa.points)} points against ${b} (${score(sa.averagePoints)} a game); ${b} has scored ${score(sb.points)} against ${a} (${score(sb.averagePoints)} a game).`
      });
      for (const [side, name, other] of [[sa, a, b], [sb, b, a]]) {
        if (side.biggestWin) {
          const g = side.biggestWin.game;
          add({
            ...base,
            topic: 'h2h_biggest_win',
            seasons: [g.year],
            weeks: [g.week],
            text: `${name}'s biggest win over ${other}: by ${score(side.biggestWin.value)} in ${g.year} week ${g.week} (${gameLabel(g)}).`
          });
        }
        if (side.highScore) {
          const g = side.highScore.game;
          add({
            ...base,
            topic: 'h2h_high_score',
            seasons: [g.year],
            weeks: [g.week],
            text: `${name}'s highest score against ${other}: ${score(side.highScore.value)} in ${g.year} week ${g.week}.`
          });
        }
        if (side.longestStreak && side.longestStreak.length > 1) {
          const s = side.longestStreak;
          add({
            ...base,
            topic: 'h2h_streak',
            text: `${name}'s longest winning streak against ${other}: ${s.length} straight, from ${s.start.year} week ${s.start.week} to ${s.end.year} week ${s.end.week}.`
          });
        }
      }
      if (summary.closest) {
        const g = summary.closest.game;
        add({
          ...base,
          topic: 'h2h_closest',
          seasons: [g.year],
          weeks: [g.week],
          text: `Closest game between ${a} and ${b}: decided by ${score(summary.closest.value)} in ${g.year} week ${g.week}.`
        });
      }
      if (summary.currentStreak) {
        const holder = summary.currentStreak.side === 0 ? a : b;
        add({
          ...base,
          topic: 'h2h_last_win',
          text: summary.currentStreak.length === 1
            ? `${holder} won the last meeting between ${a} and ${b}.`
            : `${holder} has won the last ${summary.currentStreak.length} meetings between ${a} and ${b}.`
        });
      }
      const last = meetings[meetings.length - 1];
      add({
        ...base,
        topic: 'h2h_last_meeting',
        seasons: [last.year],
        weeks: [last.week],
        text: `Last time ${a} and ${b} met: ${last.year} week ${last.week} (${gameLabel(last)}), ${a} ${score(last.pf)}, ${b} ${score(last.pa)}.`
      });
    }
  }

  // -- Each franchise's seasons and career -------------------------------------
  const champions = [];
  for (const [key, seasonRows] of index.seasonsByFranchise) {
    const games = index.gamesByFranchise.get(key) ?? [];
    const owners = keysOf(key);
    const name = latestOwner.get(key);

    for (const row of seasonRows) {
      const own = ownerAt(key, row.year);
      const regular = tally(games.filter((g) => g.year === row.year && g.phase === 'regular'));
      if (regular.w + regular.l + regular.t === 0) continue;
      const inProgress = !row.isCompleted;
      const finish = inProgress
        ? `so far (through week ${index.playedWeek})`
        : row.playoffFinish && FINISH_WORDS[row.playoffFinish]
          ? `and ${FINISH_WORDS[row.playoffFinish]}`
          : row.madePlayoffs === false || row.playoffFinish === 'none'
            ? `and missed the playoffs${Number.isFinite(row.finalRank) ? ` (final rank ${row.finalRank})` : ''}`
            : '';
      add({
        topic: 'season',
        owners,
        seasons: [row.year],
        text: `${own} in ${row.year}: ${record(regular.w, regular.l, regular.t)} in the regular season${finish ? ` ${finish}` : ''}, scoring ${score(regular.pf)} points and allowing ${score(regular.pa)}.`
      });
      if (row.playoffFinish === 'champion') champions.push({ year: row.year, owner: own, key });
    }

    const regular = tally(games.filter((g) => g.phase === 'regular'));
    const playoff = tally(games.filter((g) => g.phase === 'playoff'));
    const completed = seasonRows.filter((r) => r.isCompleted);
    const titles = completed.filter((r) => r.playoffFinish === 'champion').map((r) => r.year);
    const runnerUps = completed.filter((r) => r.playoffFinish === '2nd').map((r) => r.year);
    const playoffYears = completed.filter((r) => r.madePlayoffs).map((r) => r.year);
    const years = seasonRows.map((r) => r.year);
    add({
      topic: 'career',
      owners,
      seasons: years,
      text: `${name}'s career (${years[0]}–${years[years.length - 1]}, ${years.length} ${years.length === 1 ? 'season' : 'seasons'}): ${record(regular.w, regular.l, regular.t)} in the regular season with ${score(regular.pf)} points for; ${record(playoff.w, playoff.l, playoff.t)} in playoff games.`
    });
    // Bests and worsts over every game, for "my biggest win ever".
    const played = games.filter((g) => Number.isFinite(g.pf) && Number.isFinite(g.pa));
    if (played.length) {
      const pick = (better) => played.reduce((best, g) => (better(g, best) ? g : best));
      const wins = played.filter((g) => g.result === 'W');
      const losses = played.filter((g) => g.result === 'L');
      const when = (g) => `${g.year} week ${g.week} (${gameLabel(g)})`;
      const vs = (g) => ownerAt(g.opponent, g.year);
      const parts = [];
      if (wins.length) {
        const g = wins.reduce((best, x) => (x.pf - x.pa > best.pf - best.pa ? x : best));
        parts.push(`biggest win by ${score(g.pf - g.pa)} over ${vs(g)}, ${score(g.pf)} to ${score(g.pa)}, in ${when(g)}`);
      }
      if (losses.length) {
        const g = losses.reduce((worst, x) => (x.pa - x.pf > worst.pa - worst.pf ? x : worst));
        parts.push(`worst loss by ${score(g.pa - g.pf)} to ${vs(g)}, ${score(g.pf)} to ${score(g.pa)}, in ${when(g)}`);
      }
      const high = pick((g, best) => g.pf > best.pf);
      const low = pick((g, best) => g.pf < best.pf);
      parts.push(`highest score ${score(high.pf)} against ${vs(high)} in ${when(high)}`);
      parts.push(`lowest score ${score(low.pf)} against ${vs(low)} in ${when(low)}`);
      add({
        topic: 'career_best',
        owners,
        seasons: years,
        text: `${name}'s best and worst games ever: ${parts.join('; ')}.`
      });
    }
    add({
      topic: 'postseason',
      owners,
      seasons: years,
      text: `${name}'s postseason history: made the playoffs ${playoffYears.length} ${playoffYears.length === 1 ? 'time' : 'times'} in ${completed.length} completed ${completed.length === 1 ? 'season' : 'seasons'}${playoffYears.length ? ` (${listYears(playoffYears)})` : ''}; ${titles.length ? `won ${titles.length} ${titles.length === 1 ? 'championship' : 'championships'} (${listYears(titles)})` : 'has never won a championship'}; ${runnerUps.length ? `lost the championship game in ${listYears(runnerUps)}` : 'has never lost a championship game'}.`
    });
  }

  champions.sort((x, y) => x.year - y.year);
  if (champions.length) {
    add({
      topic: 'champions',
      owners: [...new Set(champions.flatMap((c) => keysOf(c.key)))],
      seasons: champions.map((c) => c.year),
      text: `League champions: ${champions.map((c) => `${c.year} ${c.owner}`).join('; ')}.`
    });
  }

  // -- This week, for "my opponent" -------------------------------------------
  const thisWeek = [];
  for (const pair of pairings) {
    const a = index.franchiseOfTeam.get(pair.team1Id);
    const b = index.franchiseOfTeam.get(pair.team2Id);
    if (!a || !b) continue;
    thisWeek.push({ a: ownerKey(latestOwner.get(a)), b: ownerKey(latestOwner.get(b)) });
    if (currentYear && currentWeek) {
      add({
        topic: 'this_week',
        owners: keysOf(a, b),
        seasons: [currentYear],
        weeks: [currentWeek],
        text: `This week (${currentYear} week ${currentWeek}): ${latestOwner.get(a)} plays ${latestOwner.get(b)}.`
      });
    }
  }

  return {
    cards,
    lexicon: buildLexicon(index, latestOwner),
    thisWeek,
    currentYear,
    playedWeek: index.playedWeek
  };
}

/**
 * The names a question can use for each person: full name, first name and
 * last name, every spelling they have had. First and last names are only
 * offered when no other owner shares them.
 */
function buildLexicon(index, latestOwner) {
  const people = new Map(); // ownerKey → { key, name, spellings:Set }
  for (const [key, list] of index.seasonsByFranchise) {
    for (const row of list) {
      const k = ownerKey(row.owner);
      if (!k) continue;
      if (!people.has(k)) people.set(k, { key: k, name: latestOwner.get(key) ?? row.owner, spellings: new Set() });
      people.get(k).spellings.add(row.owner.trim());
    }
  }
  const partCounts = new Map();
  for (const person of people.values()) {
    const parts = new Set();
    for (const spelling of person.spellings) {
      const words = spelling.split(/\s+/);
      parts.add(words[0].toLowerCase());
      if (words.length > 1) parts.add(words[words.length - 1].toLowerCase());
    }
    for (const part of parts) partCounts.set(part, (partCounts.get(part) ?? 0) + 1);
  }
  return [...people.values()].map((person) => {
    const names = new Set();
    for (const spelling of person.spellings) {
      names.add(spelling.toLowerCase());
      const words = spelling.split(/\s+/);
      for (const part of [words[0], words.length > 1 ? words[words.length - 1] : null]) {
        if (part && partCounts.get(part.toLowerCase()) === 1) names.add(part.toLowerCase());
      }
    }
    return { key: person.key, name: person.name, names: [...names] };
  });
}

export { franchiseKeyOf };
