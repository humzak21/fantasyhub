/**
 * Punishment Watch: the playoff-odds simulation, asked who finishes last.
 *
 * The punishment goes to last place in the regular season by the canonical
 * standings sort (`utils/recordBook/situations.js`), so this plays out the rest
 * of the regular season exactly as `playoffPathCalculator.js` does (same team
 * strengths, same score spread, same seeded random stream) and counts, in each
 * simulated season, the team at the bottom of `standingsOrder`. Everything a
 * team at the foot of the table would want to know is a tally inside that one
 * loop:
 *
 * - **The odds.** The share of seasons in which a team finishes last, held to
 *   1-99 unless the arithmetic has settled it: 100 when `lockedEnds` says last
 *   place is sewn up, 0 when somebody can no longer catch the team even if it
 *   loses out (`isSafe`).
 * - **The most likely path.** Among the seasons a team is punished in, the most
 *   common record over its games left ("goes 1-4"), with how often that record
 *   ends in punishment, and the likeliest run of results to it ("L, W, L, L, L").
 *   A record is a fact about one team's games, so it is something its manager
 *   can actually set out to avoid. The record comes first because one exact run
 *   is nearly always "lose out": every 1-4 run is a fifth of the 1-4s.
 * - **What it takes.** The punishment chance at each number of wins left, and
 *   the number of wins that rules it out whatever anybody else does
 *   (`winsToBeSafe`).
 * - **The games that matter.** Each game left, the team's chance under either
 *   result, and so whom to root for in games it is not in.
 * - **The race.** Who finishes just above the team in the seasons it is
 *   punished: the team it is really racing.
 *
 * Pure and deterministic. Unknown is absent, never zero: a team with no games
 * left has no path, and a share with nothing under it is null.
 */

import { compareStandings } from '../utils/playoffSeeding.js';
import { tallyRecords } from '../utils/standings/computeStandings.js';
import { lastScoredWeek } from '../utils/projectedBracket.js';
import { lockedEnds } from '../utils/recordBook/situations.js';
import { buildPath } from './playoffPathCalculator.js';
import {
  SCORE_SD,
  SIMULATIONS,
  createSimulationNormal,
  expectedScores,
  standingsOrder
} from './playoffOddsCalculator.js';

/** The last scored week before the home page shows the watch. */
export const PUNISHMENT_WATCH_AFTER_WEEK = 9;

/** How many teams from the bottom the watch follows. */
export const WATCHED_TEAMS = 4;

/** Games shown as the ones that matter most to a team. */
const KEY_GAMES = 4;

/** Is the watch on the home page? From the Tuesday week 9 is scored. */
export function showsPunishmentWatch(games) {
  return lastScoredWeek(games) >= PUNISHMENT_WATCH_AFTER_WEEK;
}

const equivalentWins = (row) => row.wins + row.ties / 2;

/**
 * Can `row` no longer finish last, whatever happens? True when some rival
 * winning every game it has left would still finish below `row` losing every
 * game it has left. Level on record is not safe while games remain, because
 * points for is still to be scored.
 *
 * A bound, never early: two rivals who play each other cannot both win out, so
 * a team can be safe a little before this says so. It never says safe when not.
 */
export function isSafe(table, id) {
  const row = table.find((entry) => entry.id === id);
  if (!row) return false;
  if (table.every((entry) => entry.gamesLeft === 0)) {
    return [...table].sort(compareStandings).at(-1).id !== id;
  }
  return table.some(
    (rival) => rival.id !== id && equivalentWins(rival) + rival.gamesLeft < equivalentWins(row)
  );
}

/**
 * The fewest of its remaining games a team has to win to rule last place out
 * whatever anybody else does, or null if winning out does not. The same bound
 * as `isSafe`, so it can ask for a win more than is strictly needed, never one
 * fewer.
 */
export function winsToBeSafe(table, id) {
  const row = table.find((entry) => entry.id === id);
  if (!row) return null;
  // Losing the rest is the worst case once those wins are banked, and the
  // rival most likely to stay below is the one with the lowest ceiling.
  const lowestCeiling = Math.min(
    ...table.filter((rival) => rival.id !== id).map((rival) => equivalentWins(rival) + rival.gamesLeft)
  );
  const needed = Math.max(0, Math.floor(lowestCeiling - equivalentWins(row)) + 1);
  return needed <= row.gamesLeft ? needed : null;
}

const share = (n, of) => (of > 0 ? n / of : null);

/**
 * @param {object} input
 * @param {Array<Object>} input.teams - the season's teams
 * @param {Array<Object>} input.games - the season's games
 * @param {number} [input.regularSeasonWeeks]
 * @param {number} [input.simulations]
 * @returns {null | {
 *   asOfWeek: number, scoredWeek: number, simulations: number, decided: boolean,
 *   table: Array<Object>, watched: Array<Object>, others: Array<{ id, odds: number }>
 * }}
 *   `table` is every team in standings order, best first, each with `place`,
 *   `gamesLeft`, `odds` (0-100), `share` and `status` ('locked' | 'safe' | 'open').
 *   `watched` is the bottom `WATCHED_TEAMS`, last place first, each a table row
 *   plus `gamesBack`, `aboveId`, `winsToBeSafe`, `schedule`, `byWins`, `path`,
 *   `rivals` and `keyGames`.
 */
export function buildPunishmentWatch({ teams, games, regularSeasonWeeks = 14, simulations = SIMULATIONS }) {
  if (!teams?.length || teams.length < 2) return null;

  const path = buildPath({ teams, games: games ?? [], regularSeasonWeeks });
  const { state, finalPlayed } = path;
  const { ids, remaining } = state;
  const count = ids.length;
  const indexOf = new Map(ids.map((id, i) => [id, i]));

  const records = tallyRecords(teams, games ?? [], { throughWeek: path.asOfWeek - 1 });
  const gamesLeft = finalPlayed.map((n, i) => n - state.played[i]);
  const table = ids
    .map((id, i) => {
      const record = records.get(id) ?? { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, games: 0 };
      return { id, ...record, gamesLeft: gamesLeft[i] };
    })
    .sort(compareStandings)
    .map((row, index) => ({ ...row, place: index + 1 }));

  const watchedIds = table.slice(-WATCHED_TEAMS).reverse().map((row) => row.id);
  const watchedIndex = watchedIds.map((id) => indexOf.get(id));
  const decided = gamesLeft.every((n) => n === 0);
  const locked = lockedEnds(table).last;

  // Nothing left to play: the table is the answer.
  const runs = decided ? 0 : simulations;
  const punished = new Array(count).fill(0);

  // Per watched team.
  const byWins = watchedIndex.map(() => new Map());
  const patterns = watchedIndex.map(() => new Map());
  const rivalCounts = watchedIndex.map(() => new Array(count).fill(0));
  const gameCounts = watchedIndex.map(() => path.games.map(() => ({ a: 0, aPunished: 0, b: 0, bPunished: 0 })));
  const ownGames = watchedIndex.map((i) =>
    path.games.map((game, g) => ({ game, g })).filter(({ game }) => game.a === i || game.b === i)
  );
  const aWins = path.games.map(() => 0);

  if (runs > 0) {
    const { leagueMean, means } = expectedScores(state);
    const normal = createSimulationNormal();
    const wins = new Array(count);
    const pointsFor = new Array(count);
    const pointsAgainst = new Array(count);
    const pct = new Array(count);
    const aWon = new Array(remaining.length).fill(false);

    for (let s = 0; s < runs; s += 1) {
      for (let i = 0; i < count; i += 1) {
        wins[i] = state.wins[i];
        pointsFor[i] = state.pointsFor[i];
        pointsAgainst[i] = state.pointsAgainst[i];
      }

      // The same draws, in the same order, as `simulatePath`.
      for (let g = 0; g < remaining.length; g += 1) {
        const [a, b] = remaining[g];
        const scoreA = means[a] + SCORE_SD * normal();
        const scoreB = means[b] + SCORE_SD * normal();
        pointsFor[a] += scoreA;
        pointsAgainst[a] += scoreB;
        pointsFor[b] += scoreB;
        pointsAgainst[b] += scoreA;
        aWon[g] = scoreA > scoreB;
        if (aWon[g]) aWins[g] += 1;
        if (scoreA > scoreB) wins[a] += 1;
        else if (scoreB > scoreA) wins[b] += 1;
        else {
          wins[a] += 0.5;
          wins[b] += 0.5;
        }
      }

      for (let i = 0; i < count; i += 1) {
        for (let g = 0; g < state.unscheduled[i]; g += 1) {
          const score = means[i] + SCORE_SD * normal();
          const opponent = leagueMean + SCORE_SD * normal();
          pointsFor[i] += score;
          pointsAgainst[i] += opponent;
          if (score > opponent) wins[i] += 1;
          else if (score === opponent) wins[i] += 0.5;
        }
        pct[i] = finalPlayed[i] > 0 ? wins[i] / finalPlayed[i] : 0;
      }

      const order = standingsOrder(ids, pct, pointsFor, pointsAgainst);
      const last = order[count - 1];
      const justAbove = order[count - 2];
      punished[last] += 1;

      watchedIndex.forEach((i, w) => {
        const isLast = last === i ? 1 : 0;
        const added = wins[i] - state.wins[i];

        const tally = byWins[w].get(added) ?? { seasons: 0, punished: 0 };
        tally.seasons += 1;
        tally.punished += isLast;
        byWins[w].set(added, tally);

        let key = '';
        for (const { game, g } of ownGames[w]) key += (game.a === i) === aWon[g] ? 'W' : 'L';
        const pattern = patterns[w].get(key) ?? { seasons: 0, punished: 0 };
        pattern.seasons += 1;
        pattern.punished += isLast;
        patterns[w].set(key, pattern);

        if (isLast) rivalCounts[w][justAbove] += 1;

        const counts = gameCounts[w];
        for (let g = 0; g < remaining.length; g += 1) {
          const c = counts[g];
          if (aWon[g]) {
            c.a += 1;
            c.aPunished += isLast;
          } else {
            c.b += 1;
            c.bPunished += isLast;
          }
        }
      });
    }
  }

  const statusOf = (id) => {
    if (decided) return table.at(-1).id === id ? 'locked' : 'safe';
    if (locked === id) return 'locked';
    if (locked != null || isSafe(table, id)) return 'safe';
    return 'open';
  };

  const oddsOf = (id) => {
    const status = statusOf(id);
    if (status === 'locked') return 100;
    if (status === 'safe') return 0;
    return Math.min(99, Math.max(1, Math.round((punished[indexOf.get(id)] / runs) * 100)));
  };

  const rows = table.map((row) => ({
    ...row,
    status: statusOf(row.id),
    odds: oddsOf(row.id),
    share: decided ? (statusOf(row.id) === 'locked' ? 1 : 0) : punished[indexOf.get(row.id)] / runs
  }));
  const rowOf = new Map(rows.map((row) => [row.id, row]));

  const watched = watchedIds.map((id, w) => {
    const i = indexOf.get(id);
    const row = rowOf.get(id);
    const above = rows[row.place - 2] ?? null;
    const timesPunished = punished[i];

    const schedule = ownGames[w].map(({ game, g }) => {
      const isTeam1 = game.a === i;
      return {
        id: game.id,
        week: game.week,
        opponentId: isTeam1 ? game.team2Id : game.team1Id,
        winShare: share(isTeam1 ? aWins[g] : runs - aWins[g], runs)
      };
    });

    const outcomes = [...byWins[w].entries()]
      .map(([added, tally]) => ({
        wins: added,
        losses: row.gamesLeft - added,
        share: share(tally.seasons, runs),
        punished: share(tally.punished, tally.seasons)
      }))
      .sort((a, b) => a.wins - b.wins);

    // The likeliest way down is a record first, then the likeliest run of
    // results to it. One exact run is almost always "lose out", because each
    // 1-4 run is a fifth of the 1-4s; the record is what a manager can aim at.
    const byRecord = new Map();
    for (const [key, pattern] of patterns[w]) {
      const won = [...key].filter((c) => c === 'W').length;
      const group = byRecord.get(won) ?? { seasons: 0, punished: 0, best: null };
      group.seasons += pattern.seasons;
      group.punished += pattern.punished;
      if (pattern.punished > 0 && (!group.best || pattern.punished > group.best.pattern.punished)) {
        group.best = { key, pattern };
      }
      byRecord.set(won, group);
    }
    let likeliest = null;
    for (const [won, group] of byRecord) {
      if (group.punished === 0) continue;
      if (!likeliest || group.punished > likeliest.group.punished) likeliest = { won, group };
    }

    const keyGames = path.games
      .map((game, g) => {
        const c = gameCounts[w][g];
        const ifTeam1 = share(c.aPunished, c.a);
        const ifTeam2 = share(c.bPunished, c.b);
        const involves = game.a === i || game.b === i;
        // Whom the watched team wants to win: itself, or whichever side
        // leaves it less likely to be last.
        let rootFor = null;
        if (involves) rootFor = id;
        else if (ifTeam1 != null && ifTeam2 != null && ifTeam1 !== ifTeam2) {
          rootFor = ifTeam1 < ifTeam2 ? game.team1Id : game.team2Id;
        }
        return {
          id: game.id,
          week: game.week,
          team1Id: game.team1Id,
          team2Id: game.team2Id,
          involves,
          ifTeam1,
          ifTeam2,
          rootFor,
          swing: ifTeam1 == null || ifTeam2 == null ? 0 : Math.abs(ifTeam1 - ifTeam2)
        };
      })
      .filter((game) => game.swing > 0)
      .sort((a, b) => b.swing - a.swing || a.week - b.week)
      .slice(0, KEY_GAMES);

    return {
      ...row,
      fromBottom: rows.length - row.place + 1,
      aboveId: above?.id ?? null,
      gamesBack: above ? equivalentWins(above) - equivalentWins(row) : null,
      pointsBack: above ? above.pointsFor - row.pointsFor : null,
      winsToBeSafe: decided ? null : winsToBeSafe(table, id),
      schedule,
      byWins: outcomes,
      path: likeliest
        ? {
            wins: likeliest.won,
            losses: ownGames[w].length - likeliest.won,
            // Of this team's punishments, how many came at this record.
            ofPunishments: share(likeliest.group.punished, timesPunished),
            // Of the seasons it finishes with this record, how many end in punishment.
            punishedIfSo: share(likeliest.group.punished, likeliest.group.seasons),
            // The likeliest run of results to that record, among punishments.
            results: schedule.map((game, k) => ({ ...game, won: likeliest.group.best.key[k] === 'W' })),
            runShare: share(likeliest.group.best.pattern.punished, likeliest.group.punished)
          }
        : null,
      rivals: rivalCounts[w]
        .map((n, j) => ({ id: ids[j], share: share(n, timesPunished) }))
        .filter((rival) => rival.share > 0)
        .sort((a, b) => b.share - a.share)
        .slice(0, 3),
      keyGames
    };
  });

  return {
    asOfWeek: path.asOfWeek,
    scoredWeek: lastScoredWeek(games),
    simulations: runs,
    decided,
    table: rows,
    watched,
    others: rows
      .filter((row) => !watchedIds.includes(row.id) && row.odds > 0)
      .map((row) => ({ id: row.id, odds: row.odds }))
  };
}
