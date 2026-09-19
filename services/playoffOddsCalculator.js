/**
 * Playoff odds: a simulation of the rest of the regular season, bounded by what
 * is mathematically possible.
 *
 * It used to be a heuristic — a base number by current position, plus points
 * for games ahead of the cutoff, recent form and schedule — clamped to 0-100.
 * The clamp was the problem: a 1-0 team collected enough bonuses to read 100%
 * after one week of fourteen, which says "clinched" about a team that has
 * clinched nothing. Two rules replace it:
 *
 * - **100 means clinched and 0 means eliminated, and nothing else reads
 *   either.** Both are decided by `mathematicalStatus`, which asks whether any
 *   outcome of the remaining games could keep a team out (or let it in), with
 *   every tie on record resolved against it (or for it) — points for is still
 *   to be scored, so a tie in the standings is a tie that could go either way.
 *   Everything short of certain is held to 1-99.
 * - **Between those, the number is a frequency.** The remaining schedule is
 *   played `SIMULATIONS` times, each team scoring from a normal distribution
 *   around its own average regressed toward the league's, and the odds are the
 *   share of seasons in which the team makes the field. The field is decided by
 *   the same rules the league uses, so the simulation cannot disagree with
 *   `computeSeeds` about who gets in.
 *
 * The records are rebuilt from `games`, counting only weeks before the one
 * being viewed — the same `week < viewingWeek` rule as the rest of the
 * ranking — so paging back to week 4 shows the odds as they stood in week 4,
 * not today's records squeezed into week 4's remaining schedule.
 *
 * Two qualification rules, chosen by season year:
 *
 * - **Through 2025**, the top three of each division.
 * - **From 2026**, each division winner and the next four teams league-wide
 *   (`utils/playoffSeeding.js`).
 *
 * Everything here is pure and deterministic: the random stream is seeded, so
 * the same inputs give the same odds on every render.
 */

import {
  BYE_COUNT,
  PLAYOFF_FIELD_SIZE,
  divisionIdOf,
  teamIdOf,
  usesSeededPlayoffs
} from '../utils/playoffSeeding.js';

/**
 * Seasons played per calculation: ±0.7 points of standard error at 50%, and
 * well under 100ms. The rankings page runs two calculations per load (the
 * viewed week and the one before, for rank changes), on the main thread.
 */
export const SIMULATIONS = 5000;

/**
 * Week-to-week spread of one team's score around its own average. Measured
 * over the 2020-25 regular seasons, where it was 21.0-23.5 every year.
 */
export const SCORE_SD = 22.5;

/**
 * How many weeks of league-average scoring a team's own average is blended
 * with. Over 2020-25 true team strength varied by about 6 points a week against
 * 22.5 of weekly noise, so it takes about fourteen games — a full regular
 * season — before a team's record says as much as the league average does.
 * This is what keeps a week-1 blowout from reading as a playoff lock.
 */
export const PRIOR_WEEKS = 14;

/** League scoring average when no game has been scored yet. 2020-25 averaged 113. */
export const DEFAULT_LEAGUE_MEAN = 113;

/**
 * Remaining games up to which clinching and elimination are decided by trying
 * every outcome (2^16 = 65,536 of them — two weeks of a fourteen-team league).
 * Beyond it, a bound that treats each team's games independently decides
 * them: it can miss a clinch that depends on two rivals playing each other,
 * but it never reports one that has not happened.
 */
export const EXACT_OUTCOME_LIMIT = 16;

const RANDOM_SEED = 0x5eed2026;
const TIE_EPSILON = 1e-9;

const toNumber = (value) => {
  const parsed = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
};

const scoresOf = (game) => [
  toNumber(game.team1Score ?? game.team1_score),
  toNumber(game.team2Score ?? game.team2_score)
];

// ---------------------------------------------------------------------------
// The season so far, and what is left of it
// ---------------------------------------------------------------------------

/**
 * Records through the week before `viewingWeek`, and the games still to play.
 *
 * When `games` holds no regular-season schedule at all, the stored team rows
 * supply the records and every team is given its remaining weeks against an
 * unknown, league-average opponent. When a schedule exists but misses some of
 * a team's weeks, those weeks are filled the same way.
 *
 * @returns {{
 *   ids: Array, divisions: Array, wins: number[], played: number[],
 *   pointsFor: number[], pointsAgainst: number[], scoredGames: number[],
 *   remaining: Array<[number, number]>, unscheduled: number[]
 * }}
 */
export function buildSeasonState({ teams, games, viewingWeek, regularSeasonWeeks }) {
  const ids = teams.map(teamIdOf);
  const divisions = teams.map(divisionIdOf);
  const indexOf = new Map(ids.map((id, index) => [id, index]));
  const count = teams.length;

  const wins = new Array(count).fill(0); // a tie is half a win
  const played = new Array(count).fill(0);
  const pointsFor = new Array(count).fill(0);
  const pointsAgainst = new Array(count).fill(0);
  const scoredGames = new Array(count).fill(0);
  const remaining = [];

  const weeksLeft = Math.max(0, regularSeasonWeeks - viewingWeek + 1);

  const regular = games.filter((game) => {
    const week = Number(game.week);
    const type = game.type ?? 'regular';
    const a = indexOf.get(game.team1Id ?? game.team1_id);
    const b = indexOf.get(game.team2Id ?? game.team2_id);
    return (
      type === 'regular' &&
      Number.isFinite(week) &&
      week <= regularSeasonWeeks &&
      a !== undefined &&
      b !== undefined &&
      a !== b
    );
  });

  if (regular.length === 0) {
    teams.forEach((team, i) => {
      const w = toNumber(team.wins) ?? 0;
      const l = toNumber(team.losses) ?? 0;
      const t = toNumber(team.ties) ?? 0;
      wins[i] = w + t / 2;
      played[i] = w + l + t;
      pointsFor[i] = toNumber(team.pointsFor ?? team.points_for) ?? 0;
      pointsAgainst[i] = toNumber(team.pointsAgainst ?? team.points_against) ?? 0;
      scoredGames[i] = played[i];
    });

    return {
      ids,
      divisions,
      wins,
      played,
      pointsFor,
      pointsAgainst,
      scoredGames,
      remaining,
      unscheduled: new Array(count).fill(weeksLeft)
    };
  }

  const scheduled = new Array(count).fill(0);

  for (const game of regular) {
    const a = indexOf.get(game.team1Id ?? game.team1_id);
    const b = indexOf.get(game.team2Id ?? game.team2_id);

    if (Number(game.week) >= viewingWeek) {
      // Unplayed as of the viewed week, whether or not it has been played since.
      remaining.push([a, b]);
      scheduled[a] += 1;
      scheduled[b] += 1;
      continue;
    }

    const [scoreA, scoreB] = scoresOf(game);
    if (scoreA === null || scoreB === null) continue; // a past week never scored

    played[a] += 1;
    played[b] += 1;
    pointsFor[a] += scoreA;
    pointsAgainst[a] += scoreB;
    pointsFor[b] += scoreB;
    pointsAgainst[b] += scoreA;
    scoredGames[a] += 1;
    scoredGames[b] += 1;

    if (scoreA > scoreB) wins[a] += 1;
    else if (scoreB > scoreA) wins[b] += 1;
    else {
      wins[a] += 0.5;
      wins[b] += 0.5;
    }
  }

  return {
    ids,
    divisions,
    wins,
    played,
    pointsFor,
    pointsAgainst,
    scoredGames,
    remaining,
    unscheduled: scheduled.map((n) => Math.max(0, weeksLeft - n))
  };
}

// ---------------------------------------------------------------------------
// Who makes the field
// ---------------------------------------------------------------------------

/** How the six berths are awarded, precomputed once per league. */
export function buildRule(divisions, seeded) {
  const count = divisions.length;
  const members = new Map();
  divisions.forEach((division, i) => {
    const key = division ?? null;
    if (!members.has(key)) members.set(key, []);
    members.get(key).push(i);
  });

  // `computeSeeds` crowns division winners only when there are exactly two
  // assigned divisions, and otherwise awards the byes league-wide.
  const assigned = [...members.keys()].filter((key) => key !== null);
  const byDivisionWinners = seeded && assigned.length === BYE_COUNT;

  return {
    seeded,
    count,
    divisions,
    byDivisionWinners,
    assigned: new Set(assigned),
    wildcards: PLAYOFF_FIELD_SIZE - BYE_COUNT
  };
}

/**
 * The field for one finished season, by the canonical sort — win% desc,
 * points for desc, points against asc, id — exactly as `computeSeeds` (2026+)
 * and the old top-three-per-division rule (through 2025) award it.
 *
 * @returns {boolean[]} qualified, by team index
 */
export function qualifiedField(rule, ids, pct, pointsFor, pointsAgainst) {
  const order = ids.map((_, i) => i);
  order.sort((a, b) => {
    if (pct[a] !== pct[b]) return pct[b] - pct[a];
    if (pointsFor[a] !== pointsFor[b]) return pointsFor[b] - pointsFor[a];
    if (pointsAgainst[a] !== pointsAgainst[b]) return pointsAgainst[a] - pointsAgainst[b];
    const idA = String(ids[a] ?? '');
    const idB = String(ids[b] ?? '');
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  const inField = new Array(ids.length).fill(false);

  if (!rule.seeded) {
    const taken = new Map();
    for (const i of order) {
      const key = rule.divisions[i] ?? null;
      const n = taken.get(key) ?? 0;
      if (n < 3) inField[i] = true;
      taken.set(key, n + 1);
    }
    return inField;
  }

  if (!rule.byDivisionWinners) {
    order.slice(0, PLAYOFF_FIELD_SIZE).forEach((i) => {
      inField[i] = true;
    });
    return inField;
  }

  const crowned = new Set();
  for (const i of order) {
    const division = rule.divisions[i];
    if (rule.assigned.has(division) && !crowned.has(division)) {
      crowned.add(division);
      inField[i] = true;
    }
  }

  let wildcards = 0;
  for (const i of order) {
    if (wildcards >= rule.wildcards) break;
    if (inField[i]) continue;
    inField[i] = true;
    wildcards += 1;
  }

  return inField;
}

/**
 * Does team `i` make the field on these records, with every tie in win% going
 * against it (`favoured` false) or for it (true)?
 *
 * Points for is not yet decided while games remain, so a team level on record
 * with another can finish on either side of it. Putting `i` below everyone it
 * is level with is the worst case for it under both rules: it can only add
 * teams above it, and a team added above can take at most one more berth than
 * it frees.
 *
 * Monotone in the records of the other teams — raising any of them never helps
 * `i` — which is what lets the independent bound in `mathematicalStatus` use it.
 */
export function makesFieldOnRecord(rule, i, pct, favoured) {
  const mine = pct[i];
  const division = rule.divisions[i] ?? null;

  let above = 0;
  let divisionMatesAbove = 0;
  const divisionsAbove = new Set();

  for (let j = 0; j < rule.count; j += 1) {
    if (j === i) continue;
    const gap = pct[j] - mine;
    const isAbove = gap > TIE_EPSILON || (!favoured && Math.abs(gap) <= TIE_EPSILON);
    if (!isAbove) continue;

    above += 1;
    const theirs = rule.divisions[j] ?? null;
    if (theirs === division) divisionMatesAbove += 1;
    if (rule.assigned.has(theirs)) divisionsAbove.add(theirs);
  }

  if (!rule.seeded) return divisionMatesAbove < 3;
  if (!rule.byDivisionWinners) return above < PLAYOFF_FIELD_SIZE;

  // Its own division's winner — nobody in the division finishes above it.
  if (rule.assigned.has(division) && divisionMatesAbove === 0) return true;

  // A wildcard: the teams above it that are not division winners. Each
  // division with anybody above it has exactly one winner among them.
  return above - divisionsAbove.size < rule.wildcards;
}

// ---------------------------------------------------------------------------
// Clinched and eliminated
// ---------------------------------------------------------------------------

const toPct = (wins, played) => wins.map((w, i) => (played[i] > 0 ? w / played[i] : 0));

/**
 * Which teams are in whatever happens, and which are out whatever happens.
 *
 * Exact — every win/loss outcome of the remaining games — when there are few
 * enough of them and every one is on the schedule. (A drawn game is not tried:
 * ESPN scores to the hundredth and the league has never had one.) Otherwise an independent bound: a
 * team is clinched if it makes the field losing out while everyone else wins
 * out, and eliminated if it misses winning out while everyone else loses out.
 * The bound ignores that two rivals who play each other cannot both win, so it
 * can be late to call a clinch; it is never early.
 *
 * @returns {{ clinched: boolean[], eliminated: boolean[] }}
 */
export function mathematicalStatus(rule, state) {
  const { wins, played, remaining, unscheduled } = state;
  const count = wins.length;

  const finalPlayed = played.map((n, i) => n + unscheduled[i]);
  for (const [a, b] of remaining) {
    finalPlayed[a] += 1;
    finalPlayed[b] += 1;
  }

  const allScheduled = unscheduled.every((n) => n === 0);

  if (allScheduled && remaining.length <= EXACT_OUTCOME_LIMIT) {
    const canMiss = new Array(count).fill(false);
    const canMake = new Array(count).fill(false);
    const outcomes = 2 ** remaining.length;
    const final = new Array(count);

    for (let mask = 0; mask < outcomes; mask += 1) {
      for (let i = 0; i < count; i += 1) final[i] = wins[i];
      remaining.forEach(([a, b], g) => {
        if (mask & (1 << g)) final[a] += 1;
        else final[b] += 1;
      });
      const pct = toPct(final, finalPlayed);

      let undecided = false;
      for (let i = 0; i < count; i += 1) {
        if (!canMiss[i] && !makesFieldOnRecord(rule, i, pct, false)) canMiss[i] = true;
        if (!canMake[i] && makesFieldOnRecord(rule, i, pct, true)) canMake[i] = true;
        if (!canMiss[i] || !canMake[i]) undecided = true;
      }
      if (!undecided) break;
    }

    return {
      clinched: canMiss.map((miss) => !miss),
      eliminated: canMake.map((make) => !make)
    };
  }

  const gamesLeft = unscheduled.slice();
  for (const [a, b] of remaining) {
    gamesLeft[a] += 1;
    gamesLeft[b] += 1;
  }
  const floor = wins;
  const ceiling = wins.map((w, i) => w + gamesLeft[i]);

  const clinched = [];
  const eliminated = [];
  for (let i = 0; i < count; i += 1) {
    const worst = ceiling.slice();
    worst[i] = floor[i];
    clinched.push(makesFieldOnRecord(rule, i, toPct(worst, finalPlayed), false));

    const best = floor.slice();
    best[i] = ceiling[i];
    eliminated.push(!makesFieldOnRecord(rule, i, toPct(best, finalPlayed), true));
  }

  return { clinched, eliminated };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** mulberry32: small, fast, and seedable, which Math.random is not. */
function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws, two per Box-Muller transform. */
function createNormal(random) {
  let spare = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    const u = 1 - random(); // (0, 1], so the log is finite
    const v = random();
    const radius = Math.sqrt(-2 * Math.log(u));
    spare = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  };
}

/**
 * Each team's expected weekly score: its own average, blended with
 * `PRIOR_WEEKS` weeks of the league's.
 */
export function expectedScores(state) {
  const totalPoints = state.pointsFor.reduce((sum, points) => sum + points, 0);
  const totalGames = state.scoredGames.reduce((sum, n) => sum + n, 0);
  const leagueMean = totalGames > 0 ? totalPoints / totalGames : DEFAULT_LEAGUE_MEAN;

  return {
    leagueMean,
    means: state.pointsFor.map(
      (points, i) => (points + PRIOR_WEEKS * leagueMean) / (state.scoredGames[i] + PRIOR_WEEKS)
    )
  };
}

/**
 * The share of `simulations` seasons in which each team makes the field.
 *
 * @returns {number[]} 0-1, by team index
 */
export function simulateMadeField(rule, state, simulations = SIMULATIONS) {
  const count = state.ids.length;
  const { leagueMean, means } = expectedScores(state);
  const normal = createNormal(createRandom(RANDOM_SEED));

  const finalPlayed = state.played.map((n, i) => n + state.unscheduled[i]);
  for (const [a, b] of state.remaining) {
    finalPlayed[a] += 1;
    finalPlayed[b] += 1;
  }

  const made = new Array(count).fill(0);
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

    for (const [a, b] of state.remaining) {
      const scoreA = means[a] + SCORE_SD * normal();
      const scoreB = means[b] + SCORE_SD * normal();
      pointsFor[a] += scoreA;
      pointsAgainst[a] += scoreB;
      pointsFor[b] += scoreB;
      pointsAgainst[b] += scoreA;
      if (scoreA > scoreB) wins[a] += 1;
      else if (scoreB > scoreA) wins[b] += 1;
      else {
        wins[a] += 0.5;
        wins[b] += 0.5;
      }
    }

    // Weeks the schedule does not cover: an unknown, league-average opponent.
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
    }

    const field = qualifiedField(rule, state.ids, pct, pointsFor, pointsAgainst);
    for (let i = 0; i < count; i += 1) if (field[i]) made[i] += 1;
  }

  return made.map((n) => n / simulations);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @param {Object} input
 * @param {Array} input.teams
 * @param {Array} input.games              the whole season, any type
 * @param {number} input.viewingWeek       records count weeks before this one
 * @param {number} input.regularSeasonWeeks
 * @param {number|null} [input.seasonYear] selects the qualification rule
 * @param {number} [input.simulations]
 * @returns {Map} team id -> integer percentage, 0-100
 */
export function calculatePlayoffOdds({
  teams,
  games,
  viewingWeek,
  regularSeasonWeeks,
  seasonYear = null,
  simulations = SIMULATIONS
}) {
  const odds = new Map();
  const roster = Array.isArray(teams) ? teams.filter(Boolean) : [];
  if (roster.length === 0) return odds;

  const state = buildSeasonState({
    teams: roster,
    games: Array.isArray(games) ? games : [],
    viewingWeek: Number(viewingWeek) || 1,
    regularSeasonWeeks: Number(regularSeasonWeeks) || 14
  });
  const rule = buildRule(state.divisions, usesSeededPlayoffs(seasonYear));

  const gamesLeft =
    state.remaining.length + state.unscheduled.reduce((sum, n) => sum + n, 0);

  // Nothing left to play: the field is a fact, decided by the real tiebreaks.
  if (gamesLeft === 0) {
    const field = qualifiedField(
      rule,
      state.ids,
      toPct(state.wins, state.played),
      state.pointsFor,
      state.pointsAgainst
    );
    state.ids.forEach((id, i) => odds.set(id, field[i] ? 100 : 0));
    return odds;
  }

  const { clinched, eliminated } = mathematicalStatus(rule, state);
  const madeField = simulateMadeField(rule, state, simulations);

  state.ids.forEach((id, i) => {
    let percent;
    if (clinched[i]) percent = 100;
    else if (eliminated[i]) percent = 0;
    else percent = Math.min(99, Math.max(1, Math.round(madeField[i] * 100)));
    odds.set(id, percent);
  });

  return odds;
}

/**
 * The calculator's original shape, kept for `PowerRankingCalculator`.
 * `currentWeek` is the week being viewed: records count the weeks before it.
 */
export class PlayoffOddsCalculator {
  constructor(teams, games, divisions, currentWeek, regularSeasonWeeks, seasonYear = null) {
    this.teams = Array.isArray(teams) ? teams : [];
    this.games = Array.isArray(games) ? games : [];
    this.divisions = Array.isArray(divisions) ? divisions : [];
    this.currentWeek = currentWeek;
    this.regularSeasonWeeks = regularSeasonWeeks;
    // Optional: a caller that does not know the year gets the pre-2026 rule.
    this.seasonYear = seasonYear;
  }

  /** @returns {Map} team id -> percentage (0-100) */
  calculateAllPlayoffOdds() {
    return calculatePlayoffOdds({
      teams: this.teams,
      games: this.games,
      viewingWeek: this.currentWeek,
      regularSeasonWeeks: this.regularSeasonWeeks,
      seasonYear: this.seasonYear
    });
  }

  /** @returns {number} percentage (0-100) */
  getTeamPlayoffOdds(teamId) {
    return this.calculateAllPlayoffOdds().get(teamId) || 0;
  }
}

export default PlayoffOddsCalculator;
