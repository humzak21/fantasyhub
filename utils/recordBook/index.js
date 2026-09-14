/**
 * The league's record book, computed from the live tables.
 *
 * Pure. `services/db/history.js::getRecordBookSource` reads the rows —
 * seasons, teams, games, transactions, individual trades and bids, and
 * `team_week_lineups` — and this turns them into every leaderboard the Records
 * tab shows. It replaces `v_record_book`, which could only answer "who is
 * first", and the single-season helper that picked one winner per question.
 * The same decide/execute split as the grader and the game mapper: nothing
 * here fetches, so every rule below is tested against a hand-built league.
 *
 * The output is raw rows, not leaderboards. `rankRows` ranks them at render
 * time, because the same rows serve two records (most and fewest points), the
 * season picker filters them, and the card decides how many to show.
 *
 *   book.career[key]  one row per franchise (streaks: one row per streak)
 *   book.season[key]  one row per team-season, game, bid, trade pair or
 *                     in-season streak, each carrying its `year`
 *
 * Rules that are load-bearing:
 *
 *   * **Records are regular-season games.** A playoff game is a bracket game
 *     (`playoff_*` but not `playoff_consolation_*`, the same line
 *     `v_game_results.is_playoff` draws); the game records carry `phase` so
 *     the card can show playoff games separately, and consolation games are
 *     in neither.
 *   * **Season totals are completed seasons only.** Two weeks of 2026 would
 *     otherwise hold every "fewest" record. Game records and streaks include
 *     the season in progress, because a game that has been played is a result.
 *   * **Blowouts and narrow games are `games.is_blowout` / `is_close`**, the
 *     trigger's flags, never a threshold restated here.
 *   * **A rate needs a sample.** Career win percentage and points per game
 *     need 28 games; a season's lineup efficiency needs 7 settled weeks. A
 *     franchise below the line has no row, rather than a 100% from one game.
 *   * **Unknown is absent, never zero.** A season with no lineup data produces
 *     no lineup rows, and a record with no rows says so.
 */

import { compareStandings } from '../playoffSeeding.js';
import { streakRuns } from './streaks.js';

export { rankRows } from './rank.js';
export { streakRuns } from './streaks.js';

export const CAREER_MIN_GAMES = 28;
export const SEASON_MIN_LINEUP_WEEKS = 7;
export const CAREER_MIN_LINEUP_WEEKS = 28;
/** A lineup starts nine; a win with fewer scoring is short-handed. */
export const FULL_LINEUP = 9;
/** A streak is at least two. */
export const MIN_STREAK = 2;

const EPSILON = 0.005;

const round = (value, places = 4) => {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
};
const sum = (values) => values.reduce((total, value) => total + value, 0);

function stddev(values) {
  if (values.length < 2) return null;
  const mean = sum(values) / values.length;
  return Math.sqrt(sum(values.map((value) => (value - mean) ** 2)) / (values.length - 1));
}

const groupBy = (items, keyOf) => {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
};

const push = (store, key, row) => {
  if (!Number.isFinite(row.value)) return;
  (store[key] ??= []).push(row);
};

/** A tie is half a win, as in `v_team_standings`. Scaled 0-100 for `formatPct`. */
const winPct = ({ wins, ties, games }) => (games > 0 ? ((wins + ties / 2) / games) * 100 : null);

const rosterMoves = (tx) => (tx.freeAgentAdds ?? 0) + (tx.waiverClaims ?? 0) + (tx.drops ?? 0);

/** 'regular' | 'playoff' (a bracket game) | 'consolation' | null. */
export function phaseOf(type) {
  if (type === 'regular') return 'regular';
  if (typeof type !== 'string') return null;
  if (type.startsWith('playoff_consolation')) return 'consolation';
  if (type.startsWith('playoff')) return 'playoff';
  return null;
}

// ---------------------------------------------------------------------------
// Games, as one row per team per game
// ---------------------------------------------------------------------------

function buildSides(games, seasonById, teamById) {
  const sides = [];

  for (const game of games) {
    const phase = phaseOf(game.type);
    const season = seasonById.get(game.seasonId);
    const team1 = teamById.get(game.team1Id);
    const team2 = teamById.get(game.team2Id);
    if (!phase || !season || !team1 || !team2) continue;
    if (!Number.isFinite(game.team1Score) || !Number.isFinite(game.team2Score)) continue;

    const side = (team, opponent, pf, pa, isTeam1) => ({
      gameId: game.id,
      seasonId: season.id,
      year: season.year,
      completedSeason: Boolean(season.isCompleted),
      week: game.week,
      phase,
      isTeam1,
      teamId: team.id,
      franchiseId: team.franchiseId,
      opponentTeamId: opponent.id,
      opponentFranchiseId: opponent.franchiseId,
      pf,
      pa,
      margin: round(pf - pa, 2),
      result: pf > pa ? 'W' : pf < pa ? 'L' : 'T',
      isBlowout: Boolean(game.isBlowout),
      isClose: Boolean(game.isClose),
      weeklyHigh: false,
      facedTop: false,
      apW: 0,
      apL: 0,
      apT: 0
    });

    sides.push(
      side(team1, team2, game.team1Score, game.team2Score, true),
      side(team2, team1, game.team2Score, game.team1Score, false)
    );
  }

  return sides.sort((a, b) => a.year - b.year || a.week - b.week);
}

/**
 * The week-level facts: who had the high score, who faced it, and each team's
 * all-play record — how it would have done against every other team that week.
 * Ties share the high score, and an all-play tie is half a win.
 */
function markWeeks(sides) {
  const weeks = groupBy(
    sides.filter((side) => side.phase === 'regular'),
    (side) => `${side.seasonId}:${side.week}`
  );

  for (const week of weeks.values()) {
    const high = Math.max(...week.map((side) => side.pf));

    for (const side of week) {
      side.weeklyHigh = side.pf === high;
      side.facedTop = side.pa === high;
      for (const other of week) {
        if (other === side) continue;
        if (side.pf > other.pf) side.apW += 1;
        else if (side.pf < other.pf) side.apL += 1;
        else side.apT += 1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Team-seasons
// ---------------------------------------------------------------------------

const emptyAggregate = (team, side) => ({
  teamId: team.id,
  franchiseId: team.franchiseId,
  seasonId: side.seasonId,
  year: side.year,
  completed: side.completedSeason,
  team,
  games: 0, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0,
  scores: [], opponents: [],
  apW: 0, apL: 0, apT: 0,
  blowoutWins: 0, blowoutLosses: 0, narrowWins: 0, narrowLosses: 0,
  weeklyHighs: 0, facedTop: 0,
  playoffWins: 0, playoffLosses: 0, playoffPoints: 0,
  lineupWeeks: 0, starterPoints: 0, optimalPoints: 0, perfectWeeks: 0,
  benchPoints: 0, avoidableLosses: 0, shortHandedWins: 0
});

function aggregateTeamSeasons(sides, teamById, lineups) {
  const byTeam = new Map();
  const regularByTeamWeek = new Map();

  for (const side of sides) {
    if (!byTeam.has(side.teamId)) byTeam.set(side.teamId, emptyAggregate(teamById.get(side.teamId), side));
    const a = byTeam.get(side.teamId);

    if (side.phase === 'regular') {
      regularByTeamWeek.set(`${side.teamId}:${side.week}`, side);
      a.games += 1;
      a.pf += side.pf;
      a.pa += side.pa;
      a.scores.push(side.pf);
      a.opponents.push(side.opponentTeamId);
      a.apW += side.apW;
      a.apL += side.apL;
      a.apT += side.apT;
      if (side.weeklyHigh) a.weeklyHighs += 1;
      if (side.facedTop) a.facedTop += 1;

      if (side.result === 'W') {
        a.wins += 1;
        if (side.isBlowout) a.blowoutWins += 1;
        if (side.isClose) a.narrowWins += 1;
      } else if (side.result === 'L') {
        a.losses += 1;
        if (side.isBlowout) a.blowoutLosses += 1;
        if (side.isClose) a.narrowLosses += 1;
      } else {
        a.ties += 1;
      }
    } else if (side.phase === 'playoff') {
      a.playoffPoints += side.pf;
      if (side.result === 'W') a.playoffWins += 1;
      if (side.result === 'L') a.playoffLosses += 1;
    }
  }

  // Lineups attach to the regular-season game they were the lineup for; a
  // lineup with no such game (a postseason week) is not a record input.
  for (const row of lineups) {
    const side = regularByTeamWeek.get(`${row.teamId}:${row.week}`);
    const a = side && byTeam.get(row.teamId);
    if (!a || !Number.isFinite(row.starterPoints) || !Number.isFinite(row.optimalPoints)) continue;

    a.lineupWeeks += 1;
    a.starterPoints += row.starterPoints;
    a.optimalPoints += row.optimalPoints;
    a.benchPoints += row.optimalPoints - row.starterPoints;
    if (row.optimalPoints - row.starterPoints < EPSILON) a.perfectWeeks += 1;
    // Lost, but the best lineup on the roster would have outscored the opponent.
    if (side.result === 'L' && row.optimalPoints > side.pa) a.avoidableLosses += 1;
    if (side.result === 'W' && row.startersScoring < FULL_LINEUP) a.shortHandedWins += 1;
  }

  for (const a of byTeam.values()) {
    a.ppg = a.games > 0 ? a.pf / a.games : null;
  }

  for (const a of byTeam.values()) {
    const allPlayGames = a.apW + a.apL + a.apT;
    a.winPct = winPct(a);
    a.allPlayWins = a.apW + a.apT / 2;
    a.allPlayLosses = a.apL + a.apT / 2;
    // Luck: wins beyond what the team's scoring earned against the whole
    // league. A team that beat nine of thirteen opponents a week "should" have
    // won 9/13 of its games; the difference is the schedule's doing.
    a.luck = allPlayGames > 0 ? a.wins + a.ties / 2 - (a.allPlayWins / allPlayGames) * a.games : null;
    // Schedule strength: the average scoring of the teams actually faced,
    // over their whole season, so one opponent's big week is not the measure.
    const faced = a.opponents.map((id) => byTeam.get(id)?.ppg).filter(Number.isFinite);
    a.schedule = faced.length > 0 ? sum(faced) / faced.length : null;
    a.consistency = stddev(a.scores);
  }

  return [...byTeam.values()].filter((a) => a.games > 0);
}

/** Per completed season: the top record, the scoring title, last place, the podium. */
function markSeasonHonours(aggregates, teamById) {
  const lastRankBySeason = new Map();
  for (const team of teamById.values()) {
    if (Number.isFinite(team.finalRank)) {
      lastRankBySeason.set(team.seasonId, Math.max(lastRankBySeason.get(team.seasonId) ?? 0, team.finalRank));
    }
  }

  for (const [seasonId, list] of groupBy(aggregates.filter((a) => a.completed), (a) => a.seasonId)) {
    const standing = (a) => ({
      id: a.teamId, wins: a.wins, losses: a.losses, ties: a.ties, pointsFor: a.pf, pointsAgainst: a.pa
    });
    const leader = [...list].sort((x, y) => compareStandings(standing(x), standing(y)))[0];
    const highPf = Math.max(...list.map((a) => a.pf));
    const lastRank = lastRankBySeason.get(seasonId) ?? 0;

    for (const a of list) {
      a.madePlayoffs = Boolean(a.team.madePlayoffs);
      a.champion = a.team.playoffFinish === 'champion';
      a.finalist = a.team.playoffFinish === 'champion' || a.team.playoffFinish === '2nd';
      a.topRecord = a === leader;
      a.topRecordFlop = a.topRecord && !a.finalist;
      a.scoringTitle = Math.abs(a.pf - highPf) < EPSILON;
      a.lastPlace = lastRank > 0 && a.team.finalRank === lastRank;
    }
  }
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function addSeasonRows(store, aggregates, transactions) {
  const txByKey = new Map(transactions.map((tx) => [`${tx.seasonId}:${tx.franchiseId}`, tx]));

  for (const a of aggregates) {
    if (!a.completed) continue;

    const base = {
      franchiseId: a.franchiseId,
      teamId: a.teamId,
      year: a.year,
      record: { wins: a.wins, losses: a.losses, ties: a.ties }
    };
    const add = (key, value) => {
      if (value != null) push(store, key, { ...base, value: round(value) });
    };

    add('wins', a.wins);
    add('losses', a.losses);
    add('winPct', a.winPct);
    add('allPlayWins', a.allPlayWins);
    add('allPlayLosses', a.allPlayLosses);
    add('blowoutWins', a.blowoutWins);
    add('blowoutLosses', a.blowoutLosses);
    add('narrowWins', a.narrowWins);
    add('narrowLosses', a.narrowLosses);

    add('pointsFor', a.pf);
    add('pointsAgainst', a.pa);
    add('pointDiff', a.pf - a.pa);
    add('weeklyHighs', a.weeklyHighs);
    add('facedTop', a.facedTop);
    add('consistency', a.consistency);
    if (!a.madePlayoffs) add('pointsMissedPlayoffs', a.pf);

    if (a.madePlayoffs) {
      add('playoffWins', a.playoffWins);
      add('playoffLosses', a.playoffLosses);
      add('playoffPoints', a.playoffPoints);
    }

    add('schedule', a.schedule);
    add('luck', a.luck);

    if (a.lineupWeeks >= SEASON_MIN_LINEUP_WEEKS) {
      add('lineupEfficiency', (a.starterPoints / a.optimalPoints) * 100);
      add('perfectRate', (a.perfectWeeks / a.lineupWeeks) * 100);
    }
    if (a.lineupWeeks > 0) {
      add('benchPoints', a.benchPoints);
      add('avoidableLosses', a.avoidableLosses);
      add('shortHandedWins', a.shortHandedWins);
    }

    const tx = txByKey.get(`${a.seasonId}:${a.franchiseId}`);
    if (tx) {
      add('trades', tx.trades ?? 0);
      add('rosterMoves', rosterMoves(tx));
      add('waiverClaims', tx.waiverClaims ?? 0);
      add('faabSpent', tx.faabSpent ?? 0);
    }
  }
}

function addCareerRows(store, aggregates, transactions) {
  const careers = new Map();

  for (const a of aggregates) {
    const c = careers.get(a.franchiseId) ?? {
      franchiseId: a.franchiseId,
      seasons: 0, games: 0, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0,
      apW: 0, apL: 0, apT: 0,
      blowoutWins: 0, blowoutLosses: 0, narrowWins: 0, narrowLosses: 0,
      weeklyHighs: 0, facedTop: 0, luck: 0,
      playoffWins: 0, playoffLosses: 0, playoffPoints: 0,
      championships: 0, finals: 0, playoffAppearances: 0,
      topRecords: 0, topRecordFlops: 0, scoringTitles: 0, lastPlaces: 0,
      lineupWeeks: 0, starterPoints: 0, optimalPoints: 0, perfectWeeks: 0,
      benchPoints: 0, avoidableLosses: 0, shortHandedWins: 0
    };

    for (const key of [
      'games', 'wins', 'losses', 'ties', 'pf', 'pa', 'apW', 'apL', 'apT',
      'blowoutWins', 'blowoutLosses', 'narrowWins', 'narrowLosses', 'weeklyHighs', 'facedTop',
      'playoffWins', 'playoffLosses', 'playoffPoints',
      'lineupWeeks', 'starterPoints', 'optimalPoints', 'perfectWeeks',
      'benchPoints', 'avoidableLosses', 'shortHandedWins'
    ]) {
      c[key] += a[key];
    }
    if (a.luck != null) c.luck += a.luck;

    // Placements are facts about a finished season.
    if (a.completed) {
      c.seasons += 1;
      if (a.champion) c.championships += 1;
      if (a.finalist) c.finals += 1;
      if (a.madePlayoffs) c.playoffAppearances += 1;
      if (a.topRecord) c.topRecords += 1;
      if (a.topRecordFlop) c.topRecordFlops += 1;
      if (a.scoringTitle) c.scoringTitles += 1;
      if (a.lastPlace) c.lastPlaces += 1;
    }

    careers.set(a.franchiseId, c);
  }

  const txByFranchise = groupBy(transactions, (tx) => tx.franchiseId);

  for (const c of careers.values()) {
    const base = {
      franchiseId: c.franchiseId,
      seasons: c.seasons,
      record: { wins: c.wins, losses: c.losses, ties: c.ties }
    };
    const add = (key, value) => {
      if (value != null) push(store, key, { ...base, value: round(value) });
    };

    add('wins', c.wins);
    add('losses', c.losses);
    if (c.games >= CAREER_MIN_GAMES) {
      add('winPct', winPct(c));
      add('ppg', c.pf / c.games);
      add('paPerGame', c.pa / c.games);
      add('diffPerGame', (c.pf - c.pa) / c.games);
    }
    add('allPlayWins', c.apW + c.apT / 2);
    add('allPlayLosses', c.apL + c.apT / 2);
    add('blowoutWins', c.blowoutWins);
    add('blowoutLosses', c.blowoutLosses);
    add('narrowWins', c.narrowWins);
    add('narrowLosses', c.narrowLosses);
    add('topRecords', c.topRecords);
    add('topRecordFlops', c.topRecordFlops);
    add('lastPlaces', c.lastPlaces);

    add('pointsFor', c.pf);
    add('weeklyHighs', c.weeklyHighs);
    add('scoringTitles', c.scoringTitles);
    add('facedTop', c.facedTop);

    add('championships', c.championships);
    add('finals', c.finals);
    add('playoffAppearances', c.playoffAppearances);
    add('playoffWins', c.playoffWins);
    add('playoffLosses', c.playoffLosses);
    add('playoffPoints', c.playoffPoints);

    add('luck', c.luck);

    if (c.lineupWeeks >= CAREER_MIN_LINEUP_WEEKS) {
      add('lineupEfficiency', (c.starterPoints / c.optimalPoints) * 100);
      add('perfectRate', (c.perfectWeeks / c.lineupWeeks) * 100);
    }
    if (c.lineupWeeks > 0) {
      add('benchPoints', c.benchPoints);
      add('avoidableLosses', c.avoidableLosses);
      add('shortHandedWins', c.shortHandedWins);
    }

    const txs = txByFranchise.get(c.franchiseId) ?? [];
    if (txs.length > 0) {
      add('trades', sum(txs.map((tx) => tx.trades ?? 0)));
      add('rosterMoves', sum(txs.map(rosterMoves)));
      add('waiverClaims', sum(txs.map((tx) => tx.waiverClaims ?? 0)));
      add('faabSpent', sum(txs.map((tx) => tx.faabSpent ?? 0)));
    }
  }
}

/** One row per side per game, for regular-season and bracket games. */
function addGameRows(store, sides) {
  for (const side of sides) {
    if (side.phase !== 'regular' && side.phase !== 'playoff') continue;

    const base = {
      franchiseId: side.franchiseId,
      teamId: side.teamId,
      opponentFranchiseId: side.opponentFranchiseId,
      opponentTeamId: side.opponentTeamId,
      year: side.year,
      week: side.week,
      phase: side.phase,
      score: [side.pf, side.pa]
    };
    const add = (key, value) => push(store, key, { ...base, value: round(value, 2) });

    add('score', side.pf);
    if (side.result === 'W') {
      add('winMargin', side.margin);
      add('winningScore', side.pf);
    }
    if (side.result === 'L') add('losingScore', side.pf);
    // A combined score is one fact about one game: list it under the winner.
    if (side.result === 'W' || (side.result === 'T' && side.isTeam1)) add('combined', side.pf + side.pa);
  }
}

function addStreakRows(career, season, sides, aggregates) {
  const regular = sides.filter((side) => side.phase === 'regular');

  if (regular.length > 0) {
    const latestYear = Math.max(...regular.map((side) => side.year));
    const GAME_STREAKS = [
      ['winStreak', (side) => side.result === 'W'],
      ['lossStreak', (side) => side.result === 'L'],
      ['highScoreStreak', (side) => side.weeklyHigh],
      ['highScoreDrought', (side) => !side.weeklyHigh]
    ];
    const row = (run, active) => ({
      franchiseId: run.start.franchiseId,
      value: run.length,
      year: run.start.year,
      start: { year: run.start.year, week: run.start.week },
      end: { year: run.end.year, week: run.end.week },
      active
    });

    // Across seasons: the last week of one season runs straight into week 1
    // of the next, but a season the franchise sat out breaks the run.
    for (const items of groupBy(regular, (side) => side.franchiseId).values()) {
      for (const [key, predicate] of GAME_STREAKS) {
        for (const run of streakRuns(items, predicate, (prev, item) => item.year - prev.year <= 1)) {
          if (run.length < MIN_STREAK) continue;
          push(career, key, row(run, run.endIndex === items.length - 1 && run.end.year === latestYear));
        }
      }
    }

    // Within one season.
    for (const items of groupBy(regular, (side) => side.teamId).values()) {
      for (const [key, predicate] of GAME_STREAKS) {
        for (const run of streakRuns(items, predicate)) {
          if (run.length < MIN_STREAK) continue;
          push(season, key, row(run, !run.end.completedSeason && run.endIndex === items.length - 1));
        }
      }
    }
  }

  const completed = aggregates.filter((a) => a.completed).sort((a, b) => a.year - b.year);
  if (completed.length === 0) return;

  const latestCompleted = Math.max(...completed.map((a) => a.year));
  const SEASON_STREAKS = [
    ['winningSeasonStreak', (a) => a.winPct > 50],
    ['playoffStreak', (a) => a.madePlayoffs],
    ['finalsStreak', (a) => a.finalist]
  ];

  for (const items of groupBy(completed, (a) => a.franchiseId).values()) {
    for (const [key, predicate] of SEASON_STREAKS) {
      for (const run of streakRuns(items, predicate, (prev, item) => item.year === prev.year + 1)) {
        if (run.length < MIN_STREAK) continue;
        push(career, key, {
          franchiseId: run.start.franchiseId,
          value: run.length,
          startYear: run.start.year,
          endYear: run.end.year,
          active: run.endIndex === items.length - 1 && run.end.year === latestCompleted
        });
      }
    }
  }
}

/** How often each pair of franchises has traded, overall and per season. */
function addTradeRows(career, season, trades, seasonById) {
  const overall = new Map();
  const bySeason = new Map();
  const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const trade of trades) {
    const year = seasonById.get(trade.seasonId)?.year;
    if (year == null) continue;

    const ids = [...new Set(trade.franchiseIds ?? [])].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        bump(overall, `${ids[i]}|${ids[j]}`);
        bump(bySeason, `${year}|${ids[i]}|${ids[j]}`);
      }
    }
  }

  for (const [key, value] of overall) {
    const [franchiseId, partnerFranchiseId] = key.split('|');
    push(career, 'tradePartners', { franchiseId, partnerFranchiseId, value });
  }
  for (const [key, value] of bySeason) {
    const [year, franchiseId, partnerFranchiseId] = key.split('|');
    push(season, 'tradePartners', { franchiseId, partnerFranchiseId, year: Number(year), value });
  }
}

function addBidRows(season, bids, seasonById) {
  for (const bid of bids) {
    const year = seasonById.get(bid.seasonId)?.year;
    if (year == null || !(bid.bidAmount > 0)) continue;

    push(season, 'faabBids', {
      franchiseId: bid.franchiseId,
      teamId: bid.teamId,
      year,
      week: bid.scoringPeriod ?? null,
      value: bid.bidAmount,
      playerName: bid.playerName ?? null
    });
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * @param {object} source from `getRecordBookSource`
 * @returns {{ years: {year: number, isCompleted: boolean}[], teams: object,
 *   career: Object<string, object[]>, season: Object<string, object[]> }}
 */
export function buildRecordBook(source = {}) {
  const seasons = [...(source.seasons ?? [])].sort((a, b) => a.year - b.year);
  const seasonById = new Map(seasons.map((season) => [season.id, season]));

  const teamById = new Map();
  for (const team of source.teams ?? []) {
    const season = seasonById.get(team.seasonId);
    if (season) teamById.set(team.id, { ...team, year: season.year });
  }

  const sides = buildSides(source.games ?? [], seasonById, teamById);
  markWeeks(sides);

  const aggregates = aggregateTeamSeasons(sides, teamById, source.lineups ?? []);
  markSeasonHonours(aggregates, teamById);

  const career = {};
  const season = {};
  addSeasonRows(season, aggregates, source.transactions ?? []);
  addCareerRows(career, aggregates, source.transactions ?? []);
  addGameRows(season, sides);
  addStreakRows(career, season, sides, aggregates);
  addTradeRows(career, season, source.trades ?? [], seasonById);
  addBidRows(season, source.bids ?? [], seasonById);

  const yearsPlayed = new Set(sides.map((side) => side.year));

  return {
    years: seasons
      .filter((s) => yearsPlayed.has(s.year))
      .map((s) => ({ year: s.year, isCompleted: Boolean(s.isCompleted) }))
      .reverse(),
    teams: Object.fromEntries(
      [...teamById.values()].map((team) => [
        team.id,
        { id: team.id, name: team.name, owner: team.owner, franchiseId: team.franchiseId, year: team.year }
      ])
    ),
    career,
    season
  };
}

/**
 * The rows behind one record, optionally narrowed to one season.
 *
 * @param {object} book from `buildRecordBook`
 * @param {'career'|'season'} scope
 * @param {string} key the row set, e.g. 'pointsFor'
 * @param {{ year?: number|null, phase?: string|null }} [filter]
 */
export function recordRows(book, scope, key, { year = null, phase = null } = {}) {
  const rows = book?.[scope]?.[key] ?? [];
  return rows.filter(
    (row) => (year == null || row.year === year) && (phase == null || row.phase === phase)
  );
}
