/**
 * Path to the Playoffs: the odds calculator, asked "what if".
 *
 * Same model, same field, same random stream as `playoffOddsCalculator.js`, so
 * with nothing decided this reads exactly what the rankings' Playoff% column
 * reads. Two things are added on top:
 *
 * - **Decided games.** A member can settle any game left on the schedule. The
 *   game is still simulated, so the points its teams score still feed the
 *   tiebreak, and the two scores are swapped when the wrong side came out
 *   ahead. Swapping rather than redrawing keeps every other draw in the run
 *   where it was, so setting one game moves the odds by that game alone.
 * - **More than in or out.** Each season also reports the six seeds, so one
 *   pass over the simulations answers the seed chances, the bye, the first-round
 *   opponent, the record that gets a team in and how much each remaining game
 *   swings its odds. Conditioning on a game costs nothing extra: every season
 *   already played it one way or the other.
 *
 * Certainty stays `mathematicalStatus`'s, over the records with the decided
 * games applied: 100 means clinched in this scenario and 0 means eliminated in
 * it. Pure and deterministic, 2026+ only (`utils/playoffSeeding.js`).
 */

import {
  BYE_COUNT,
  PLAYOFF_FIELD_SIZE
} from '../utils/playoffSeeding.js';
import {
  SCORE_SD,
  SIMULATIONS,
  buildRule,
  buildSeasonState,
  createSimulationNormal,
  expectedScores,
  mathematicalStatus,
  standingsOrder
} from './playoffOddsCalculator.js';

/**
 * Remaining games up to which a scenario's clinches are worked out exactly.
 * Lower than the rankings' limit because this runs on every tap: 2^12 outcomes
 * rather than 2^16, and the bound beyond it is never early, only late.
 */
const SCENARIO_EXACT_LIMIT = 12;

const isScored = (game) => game.team1Score != null && game.team2Score != null;

const regularGames = (games) =>
  (games ?? []).filter(
    (game) => (game.type ?? 'regular') === 'regular' && game.team1Id != null && game.team2Id != null
  );

/** The week the unplayed part of the season starts from. */
export function firstUnscoredWeek(games, regularSeasonWeeks) {
  const weeks = regularGames(games).filter((game) => !isScored(game)).map((game) => game.week);
  return weeks.length > 0 ? Math.min(...weeks) : regularSeasonWeeks + 1;
}

/**
 * The season as a what-if starts from.
 *
 * @param {object} input
 * @param {Array<Object>} input.teams
 * @param {Array<Object>} input.games - the season's games
 * @param {number} input.regularSeasonWeeks
 * @returns {{ state: Object, rule: Object, asOfWeek: number, games: Array, finalPlayed: number[] }}
 *   `games` are the games left: `{ id, week, a, b, team1Id, team2Id }`, where
 *   `a` and `b` index `state.ids`.
 */
export function buildPath({ teams, games, regularSeasonWeeks }) {
  const asOfWeek = firstUnscoredWeek(games, regularSeasonWeeks);
  const state = buildSeasonState({ teams, games, viewingWeek: asOfWeek, regularSeasonWeeks });
  const rule = buildRule(state.divisions, true);

  const finalPlayed = state.played.map((n, i) => n + state.unscheduled[i]);
  for (const [a, b] of state.remaining) {
    finalPlayed[a] += 1;
    finalPlayed[b] += 1;
  }

  return {
    state,
    rule,
    asOfWeek,
    finalPlayed,
    games: state.remainingGames.map((game, g) => ({
      id: game.id,
      week: Number(game.week),
      a: state.remaining[g][0],
      b: state.remaining[g][1],
      team1Id: game.team1Id,
      team2Id: game.team2Id
    }))
  };
}

/**
 * Seed by team index for one finished season, 0 for a team outside the field:
 * `computeSeeds` over arrays, because this runs once per simulated season.
 */
export function fieldSeeds(rule, ids, pct, pointsFor, pointsAgainst) {
  const order = standingsOrder(ids, pct, pointsFor, pointsAgainst);
  const seeds = new Array(ids.length).fill(0);

  if (!rule.byDivisionWinners) {
    order.slice(0, PLAYOFF_FIELD_SIZE).forEach((i, place) => {
      seeds[i] = place + 1;
    });
    return seeds;
  }

  const crowned = new Set();
  for (const i of order) {
    const division = rule.divisions[i];
    if (rule.assigned.has(division) && !crowned.has(division)) {
      crowned.add(division);
      seeds[i] = crowned.size;
    }
  }

  let seed = crowned.size;
  for (const i of order) {
    if (seed >= PLAYOFF_FIELD_SIZE) break;
    if (seeds[i] !== 0) continue;
    seed += 1;
    seeds[i] = seed;
  }

  return seeds;
}

/** The records with the decided games applied, for `mathematicalStatus`. */
function statusWith(path, results) {
  const { state, rule, games } = path;
  const wins = state.wins.slice();
  const played = state.played.slice();
  const remaining = [];

  games.forEach((game, g) => {
    const winner = results.get(game.id);
    if (winner == null) {
      remaining.push(state.remaining[g]);
      return;
    }
    wins[winner === game.team1Id ? game.a : game.b] += 1;
    played[game.a] += 1;
    played[game.b] += 1;
  });

  return mathematicalStatus(
    rule,
    { wins, played, remaining, unscheduled: state.unscheduled },
    SCENARIO_EXACT_LIMIT
  );
}

/**
 * Play the rest of the season `simulations` times.
 *
 * @param {Object} path - from `buildPath`
 * @param {object} [options]
 * @param {Map<string, string>} [options.results] - game id → winning team id
 * @param {*} [options.focusId] - the team the per-team answers are about
 * @param {number} [options.simulations]
 * @returns {{
 *   simulations: number,
 *   teams: Array<{ id, odds: number, made: number, bye: number, seedShares: number[],
 *     meanWins: number, meanPointsFor: number, meanPointsAgainst: number,
 *     clinched: boolean, eliminated: boolean }>,
 *   focus: null | { records: Array, games: Array, opponents: Array }
 * }}
 */
export function simulatePath(path, { results = new Map(), focusId = null, simulations = SIMULATIONS } = {}) {
  const { state, rule, games, finalPlayed } = path;
  const { ids, remaining } = state;
  const count = ids.length;
  const { leagueMean, means } = expectedScores(state);
  const normal = createSimulationNormal();

  // Which index wins each game, or -1 for a game left to the simulation.
  const forced = games.map((game) => {
    const winner = results.get(game.id);
    if (winner == null) return -1;
    return winner === game.team1Id ? game.a : game.b;
  });

  const focus = ids.indexOf(focusId);
  const hasFocus = focus !== -1;

  const made = new Array(count).fill(0);
  const byes = new Array(count).fill(0);
  const seedCounts = ids.map(() => new Array(PLAYOFF_FIELD_SIZE).fill(0));
  const winTotals = new Array(count).fill(0);
  const pointsForTotals = new Array(count).fill(0);
  const pointsAgainstTotals = new Array(count).fill(0);

  const records = new Map();
  const opponentCounts = new Array(count).fill(0);
  // Per game, per winner: seasons, and the seasons `focus` got in or got a bye.
  const gameCounts = games.map(() => ({ a: 0, aMade: 0, aBye: 0, b: 0, bMade: 0, bBye: 0 }));
  const aWon = new Array(games.length).fill(false);

  const wins = new Array(count);
  const pointsFor = new Array(count);
  const pointsAgainst = new Array(count);
  const pct = new Array(count);

  for (let s = 0; s < simulations; s += 1) {
    for (let i = 0; i < count; i += 1) {
      wins[i] = state.wins[i];
      pointsFor[i] = state.pointsFor[i];
      pointsAgainst[i] = state.pointsAgainst[i];
    }

    for (let g = 0; g < remaining.length; g += 1) {
      const [a, b] = remaining[g];
      let scoreA = means[a] + SCORE_SD * normal();
      let scoreB = means[b] + SCORE_SD * normal();

      // The decided side takes the higher score; the draws stay in the stream.
      const winner = forced[g];
      if ((winner === a && scoreA < scoreB) || (winner === b && scoreB < scoreA)) {
        [scoreA, scoreB] = [scoreB, scoreA];
      }

      pointsFor[a] += scoreA;
      pointsAgainst[a] += scoreB;
      pointsFor[b] += scoreB;
      pointsAgainst[b] += scoreA;
      aWon[g] = scoreA > scoreB;
      if (scoreA > scoreB) wins[a] += 1;
      else if (scoreB > scoreA) wins[b] += 1;
      else {
        wins[a] += 0.5;
        wins[b] += 0.5;
      }
    }

    // Weeks the schedule does not cover, as in `simulateMadeField`.
    for (let i = 0; i < count; i += 1) {
      for (let g = 0; g < state.unscheduled[i]; g += 1) {
        const score = means[i] + SCORE_SD * normal();
        const opponent = leagueMean + SCORE_SD * normal();
        pointsFor[i] += score;
        pointsAgainst[i] += opponent;
        if (score > opponent) wins[i] += 1;
        else if (score === opponent) wins[i] += 0.5;
      }
    }

    for (let i = 0; i < count; i += 1) {
      pct[i] = finalPlayed[i] > 0 ? wins[i] / finalPlayed[i] : 0;
      winTotals[i] += wins[i];
      pointsForTotals[i] += pointsFor[i];
      pointsAgainstTotals[i] += pointsAgainst[i];
    }

    const seeds = fieldSeeds(rule, ids, pct, pointsFor, pointsAgainst);
    for (let i = 0; i < count; i += 1) {
      const seed = seeds[i];
      if (seed === 0) continue;
      made[i] += 1;
      seedCounts[i][seed - 1] += 1;
      if (seed <= BYE_COUNT) byes[i] += 1;
    }

    if (!hasFocus) continue;

    const mySeed = seeds[focus];
    const gotIn = mySeed !== 0 ? 1 : 0;
    const bye = mySeed !== 0 && mySeed <= BYE_COUNT ? 1 : 0;

    const record = records.get(wins[focus]) ?? { seasons: 0, made: 0, bye: 0 };
    record.seasons += 1;
    record.made += gotIn;
    record.bye += bye;
    records.set(wins[focus], record);

    // Round 1 is 3v6 and 4v5, so the opponent's seed adds up to nine.
    if (mySeed > BYE_COUNT) {
      const opponent = seeds.indexOf(BYE_COUNT + PLAYOFF_FIELD_SIZE + 1 - mySeed);
      if (opponent !== -1) opponentCounts[opponent] += 1;
    }

    for (let g = 0; g < games.length; g += 1) {
      const tally = gameCounts[g];
      if (aWon[g]) {
        tally.a += 1;
        tally.aMade += gotIn;
        tally.aBye += bye;
      } else {
        tally.b += 1;
        tally.bMade += gotIn;
        tally.bBye += bye;
      }
    }
  }

  const { clinched, eliminated } = statusWith(path, results);
  const share = (n, of = simulations) => (of > 0 ? n / of : null);

  const teams = ids.map((id, i) => {
    const madeShare = share(made[i]);
    let odds = Math.min(99, Math.max(1, Math.round(madeShare * 100)));
    if (clinched[i]) odds = 100;
    else if (eliminated[i]) odds = 0;

    return {
      id,
      odds,
      made: madeShare,
      bye: share(byes[i]),
      seedShares: seedCounts[i].map((n) => share(n)),
      meanWins: winTotals[i] / simulations,
      meanPointsFor: pointsForTotals[i] / simulations,
      meanPointsAgainst: pointsAgainstTotals[i] / simulations,
      clinched: clinched[i],
      eliminated: eliminated[i]
    };
  });

  return {
    simulations,
    teams,
    focus: hasFocus
      ? {
          records: [...records.entries()]
            .map(([finalWins, record]) => ({
              wins: finalWins,
              losses: finalPlayed[focus] - finalWins,
              share: share(record.seasons),
              made: share(record.made, record.seasons),
              bye: share(record.bye, record.seasons)
            }))
            .sort((a, b) => b.wins - a.wins),
          opponents: opponentCounts
            .map((n, i) => ({ id: ids[i], seasons: n }))
            .filter((opponent) => opponent.seasons > 0)
            .sort((a, b) => b.seasons - a.seasons)
            .map(({ id, seasons }) => ({ id, share: share(seasons), ofRound1: share(seasons, sum(opponentCounts)) })),
          games: games.map((game, g) => gameImpact(game, gameCounts[g], forced[g] !== -1, focus))
        }
      : null
  };
}

const sum = (values) => values.reduce((total, n) => total + n, 0);

/** What one game does to the focus team: its odds under each result. */
function gameImpact(game, tally, decided, focus) {
  const ratio = (n, of) => (of > 0 ? n / of : null);
  const ifA = { made: ratio(tally.aMade, tally.a), bye: ratio(tally.aBye, tally.a) };
  const ifB = { made: ratio(tally.bMade, tally.b), bye: ratio(tally.bBye, tally.b) };
  const spread = (key) =>
    ifA[key] == null || ifB[key] == null ? 0 : Math.abs(ifA[key] - ifB[key]);

  return {
    id: game.id,
    decided,
    involvesFocus: game.a === focus || game.b === focus,
    team1Share: ratio(tally.a, tally.a + tally.b),
    ifTeam1: ifA,
    ifTeam2: ifB,
    // Whichever is at stake: a team in no danger still has a bye to play for.
    swing: Math.max(spread('made'), spread('bye'))
  };
}

/**
 * Standings rows for the bracket a scenario points at, one team per seed: the
 * average finish, because any single simulated season is one roll of the dice.
 * `playoffSeed` is awarded by the league's own rule over those averages, so
 * the bracket is always a legal one.
 */
export function scenarioStandings(path, simulation, teams) {
  const { rule, finalPlayed, state } = path;
  const rows = simulation.teams;
  const pct = rows.map((row, i) => (finalPlayed[i] > 0 ? row.meanWins / finalPlayed[i] : 0));
  const pointsFor = rows.map((row) => row.meanPointsFor);
  const pointsAgainst = rows.map((row) => row.meanPointsAgainst);
  const seeds = fieldSeeds(rule, state.ids, pct, pointsFor, pointsAgainst);

  return teams.map((team) => {
    const i = state.ids.indexOf(team.id);
    return {
      ...team,
      playoffSeed: seeds[i] || null,
      winPercentage: pct[i],
      pointsFor: pointsFor[i],
      pointsAgainst: pointsAgainst[i],
      projectedWins: rows[i].meanWins,
      projectedLosses: finalPlayed[i] - rows[i].meanWins
    };
  });
}

/**
 * A preset, as results to merge: `win` and `lose` settle the focus team's
 * games, `favorites` every other game, each to the side with the higher
 * expected score.
 */
export function presetResults(path, preset, focusId) {
  const { state, games } = path;
  const { means } = expectedScores(state);
  const results = new Map();

  for (const game of games) {
    const mine = game.team1Id === focusId || game.team2Id === focusId;
    const opponent = game.team1Id === focusId ? game.team2Id : game.team1Id;

    if (preset === 'favorites') {
      results.set(game.id, means[game.a] >= means[game.b] ? game.team1Id : game.team2Id);
    } else if (mine) {
      results.set(game.id, preset === 'win' ? focusId : opponent);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// A scenario in a URL
//
// One token per decided game: the week, a letter for the game's place in that
// week (by id, so it does not depend on the order rows arrive in), and which
// side won. `8c1.9a2` is two games. The index runs over every game of the week
// and not just the unplayed ones, so a link keeps its meaning after a week is
// scored; a token for a game now played is dropped, because the real result won.
// ---------------------------------------------------------------------------

const weekGames = (games) => {
  const byWeek = new Map();
  for (const game of regularGames(games)) {
    if (!byWeek.has(game.week)) byWeek.set(game.week, []);
    byWeek.get(game.week).push(game);
  }
  for (const list of byWeek.values()) {
    list.sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  }
  return byWeek;
};

const LETTER_A = 'a'.charCodeAt(0);

/**
 * @param {Map<string, string>} results - game id → winning team id
 * @param {Array<Object>} games - the season's games
 * @returns {string} empty when nothing is decided
 */
export function encodeScenario(results, games) {
  const tokens = [];
  for (const [week, list] of [...weekGames(games).entries()].sort(([a], [b]) => a - b)) {
    list.forEach((game, index) => {
      const winner = results.get(game.id);
      if (winner == null) return;
      const side = winner === game.team1Id ? 1 : 2;
      tokens.push(`${week}${String.fromCharCode(LETTER_A + index)}${side}`);
    });
  }
  return tokens.join('.');
}

/**
 * The inverse. Anything unreadable, out of range or already played is skipped:
 * a hand-edited or stale link opens with what it can still say.
 *
 * @returns {Map<string, string>} game id → winning team id
 */
export function decodeScenario(param, games) {
  const results = new Map();
  if (!param) return results;

  const byWeek = weekGames(games);
  for (const token of String(param).split('.')) {
    const match = /^(\d+)([a-z])([12])$/.exec(token);
    if (!match) continue;

    const game = byWeek.get(Number(match[1]))?.[match[2].charCodeAt(0) - LETTER_A];
    if (!game || isScored(game)) continue;
    results.set(game.id, match[3] === '1' ? game.team1Id : game.team2Id);
  }
  return results;
}
