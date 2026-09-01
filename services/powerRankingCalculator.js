/**
 * The power ranking.
 *
 * Nine components, each normalized 0-100 across the league, combined with the
 * weights in `types/index.js`. A component that cannot be computed is null and
 * drops out, with the remaining weights renormalized — so a season with no
 * player data scores on its team components alone rather than taking zeros for
 * the rest.
 *
 * What this replaces, and why:
 *
 *   - `calculateTeamStrength` was `async` and `calculateStrengthOfSchedule`
 *     summed its return value synchronously, so strength of schedule was the
 *     result of adding Promises together. Every internal here is synchronous.
 *   - The roster inputs read `player.playerId` / `player.isActive`, keys the
 *     roster rows do not have (`{ rosterSlot, player: { id, espnPlayerId } }`),
 *     so team strength was always 0 and the projection score silently fell back
 *     to a fraction of the performance score.
 *   - All-play ignored the viewing-week cutoff, so paging back to week 3 scored
 *     teams using games from week 12.
 *   - The weights were numeric literals inline in `calculatePowerRating` while
 *     `POWER_RANKING_WEIGHTS` sat in `types/index.js` imported by nobody, and
 *     the UI legend described a third set of numbers again.
 *
 * The roster components come from `player_week_stats` — what each team's
 * players actually scored, week by week, under this league's scoring settings.
 * See `services/db/playerWeekStats.js`.
 */

import { POWER_RANKING_WEIGHTS, THRESHOLDS } from '../types/index.js';
import { PlayoffOddsCalculator } from './playoffOddsCalculator.js';

/**
 * The lineup an optimally-managed roster would have started.
 *
 * FLEX is deliberately last: filling the fixed slots first with the best player
 * at each position and giving FLEX the best of what remains is the optimal
 * assignment for a single flex slot, which is what this league runs.
 */
export const OPTIMAL_LINEUP_TEMPLATE = Object.freeze([
  'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'D/ST', 'K', 'FLEX'
]);

const FLEX_POSITIONS = new Set(['RB', 'WR', 'TE']);

/** Roster slots that do not score. */
const NON_STARTING_SLOTS = new Set(['BE', 'IR']);

/** ESPN's IR slot. A player there could not legally have been started. */
const IR_LINEUP_SLOT_ID = 21;

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const isUsable = (value) => value !== null && value !== undefined && Number.isFinite(value);

/**
 * Min-max a raw component across the league.
 *
 * Nulls stay null — "we could not compute this" is not the same as "this team
 * scored lowest". When every team ties (a league before week 1, or one where
 * nobody has player data), the span is zero and everyone gets a neutral 50
 * rather than a division by zero.
 */
export function normalizeAcrossLeague(rawByTeam) {
  const out = {};
  const values = Object.values(rawByTeam).filter(isUsable);

  if (values.length === 0) {
    for (const teamId of Object.keys(rawByTeam)) out[teamId] = null;
    return out;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  for (const [teamId, value] of Object.entries(rawByTeam)) {
    out[teamId] = isUsable(value) ? (span === 0 ? 50 : ((value - min) / span) * 100) : null;
  }

  return out;
}

/**
 * Weighted mean over the components that exist.
 *
 * Dividing by the surviving weight rather than by 1 is what lets a 2025 season
 * — no `player_week_stats` rows at all — rank on five components without every
 * team being dragged toward zero by the four it cannot compute.
 */
export function combineWeightedComponents(components, weights = POWER_RANKING_WEIGHTS) {
  let weighted = 0;
  let weightSum = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const value = components?.[key];
    if (!isUsable(value)) continue;
    weighted += value * weight;
    weightSum += weight;
  }

  // Nothing computable at all: neutral, so ordering stays stable and finite.
  if (weightSum === 0) return 50;

  return weighted / weightSum;
}

/**
 * The points the best legal lineup would have scored, from one week of rows.
 *
 * Exported because it is the piece most worth testing against a hand-computed
 * fixture: a wrong answer here does not throw, it just quietly rates every
 * manager as more efficient than they were.
 */
export function optimalLineupPoints(rows = []) {
  const pool = rows
    .filter((row) => row.lineupSlotId !== IR_LINEUP_SLOT_ID && row.position)
    .map((row) => ({ position: row.position, points: toNumber(row.actualPoints) }));

  const used = new Set();
  let total = 0;

  for (const slot of OPTIMAL_LINEUP_TEMPLATE) {
    let bestIndex = -1;

    for (let i = 0; i < pool.length; i++) {
      if (used.has(i)) continue;

      const eligible = slot === 'FLEX'
        ? FLEX_POSITIONS.has(pool[i].position)
        : pool[i].position === slot;
      if (!eligible) continue;

      if (bestIndex === -1 || pool[i].points > pool[bestIndex].points) bestIndex = i;
    }

    if (bestIndex !== -1) {
      used.add(bestIndex);
      total += pool[bestIndex].points;
    }
  }

  return total;
}

export class PowerRankingCalculator {
  /**
   * @param {Array}  teams
   * @param {Array}  games
   * @param {number} currentWeek        the week the league is actually in
   * @param {Array}  players            season players, with projection columns
   * @param {number} viewingWeek        the week being viewed; defaults to current
   * @param {Array}  divisions
   * @param {number} regularSeasonWeeks
   * @param {Object} playerWeekStats    `{ [teamId]: { [week]: rows } }`, or null
   */
  constructor(
    teams,
    games,
    currentWeek = 1,
    players = [],
    viewingWeek = null,
    divisions = [],
    regularSeasonWeeks = 14,
    playerWeekStats = null,
    seasonYear = null
  ) {
    this.teams = Array.isArray(teams) ? teams : [];
    this.games = Array.isArray(games) ? games : [];
    this.players = Array.isArray(players) ? players : [];
    this.currentWeek = currentWeek;
    // viewingWeek is the week the user is viewing (for historical power
    // rankings). Viewing week 3 means only weeks 1-2 count.
    this.viewingWeek = viewingWeek || currentWeek;

    this.divisions = Array.isArray(divisions) ? divisions : [];
    this.regularSeasonWeeks = regularSeasonWeeks;
    // Which playoff rule this season is under. Ninth argument and optional:
    // without it the odds calculator uses the pre-2026 top-3-per-division
    // model, which is right for every season it was written for.
    this.seasonYear = seasonYear;

    this.playerWeekStats =
      playerWeekStats && typeof playerWeekStats === 'object' ? playerWeekStats : null;

    // Projections describe the future, and nobody archived last month's view of
    // it. They are honest for the live week and a fabrication for any earlier
    // one, so the outlook component only exists when the two weeks agree.
    this.isLiveView = this.viewingWeek >= this.currentWeek;

    this.playersById = new Map();
    this.playersByEspnId = new Map();
    for (const player of this.players) {
      if (player?.id != null) this.playersById.set(player.id, player);
      const espnId = player?.espnPlayerId ?? player?.espn_player_id;
      if (espnId != null) this.playersByEspnId.set(espnId, player);
    }

    this.statsCache = new Map();
    this.leagueStats = this.calculateLeagueStats();
    this.teamRosterMetrics = this.calculateAllTeamRosterMetrics();
    this.componentsByTeam = this.calculateAllComponents();
  }

  // ---------------------------------------------------------------------
  // League-wide context
  // ---------------------------------------------------------------------

  calculateLeagueStats() {
    const completedGames = this.completedGamesBeforeViewingWeek();
    const totalPoints = completedGames.reduce(
      (sum, game) => sum + toNumber(game.team1Score) + toNumber(game.team2Score),
      0
    );
    const totalTeams = this.teams.length;

    const teamWinPercentages = this.teams.map((team) => {
      const teamGames = completedGames.filter(
        (game) => game.team1Id === team.id || game.team2Id === team.id
      );
      const wins = teamGames.filter((game) => this.getWinnerFromGame(game) === team.id).length;
      return teamGames.length > 0 ? wins / teamGames.length : 0;
    });

    return {
      averageWinPercentage:
        totalTeams > 0
          ? teamWinPercentages.reduce((sum, pct) => sum + pct, 0) / totalTeams
          : 0,
      averageScore: completedGames.length > 0 ? totalPoints / (completedGames.length * 2) : 0,
      totalGames: completedGames.length,
      currentWeek: this.currentWeek
    };
  }

  /** Every completed game the viewing week is allowed to see. */
  completedGamesBeforeViewingWeek() {
    return this.games.filter((game) => game.isCompleted && game.week < this.viewingWeek);
  }

  /** A team's completed games, subject to the same cutoff. */
  gamesFor(teamId) {
    return this.games.filter(
      (game) =>
        (game.team1Id === teamId || game.team2Id === teamId) &&
        game.isCompleted &&
        game.week < this.viewingWeek
    );
  }

  scoreFor(game, teamId) {
    return toNumber(game.team1Id === teamId ? game.team1Score : game.team2Score);
  }

  opponentScoreFor(game, teamId) {
    return toNumber(game.team1Id === teamId ? game.team2Score : game.team1Score);
  }

  getWinnerFromGame(game) {
    if (!game.isCompleted) return null;
    if (game.team1Score > game.team2Score) return game.team1Id;
    if (game.team2Score > game.team1Score) return game.team2Id;
    // No ties in fantasy football - this should never happen
    return null;
  }

  // ---------------------------------------------------------------------
  // Team-level components
  // ---------------------------------------------------------------------

  /**
   * All-play: what share of the league this team would have beaten each week.
   *
   * The cutoff is the fix. This used to filter the team's own games by
   * `isCompleted` alone and then pool *every* completed game of that week, so a
   * historical view leaked results the user had not navigated to — and the same
   * unbounded pool fed the high-performance-week threshold.
   */
  calculateAllPlayWinPercentage(teamId) {
    const teamGames = this.gamesFor(teamId);
    if (teamGames.length === 0) return 0;

    let totalPossibleWins = 0;
    let totalActualWins = 0;

    for (const game of teamGames) {
      const teamScore = this.scoreFor(game, teamId);

      const weekGames = this.games.filter(
        (candidate) =>
          candidate.week === game.week &&
          candidate.isCompleted &&
          candidate.week < this.viewingWeek
      );

      const otherScores = [];
      for (const weekGame of weekGames) {
        if (weekGame.team1Id !== teamId) otherScores.push(toNumber(weekGame.team1Score));
        if (weekGame.team2Id != null && weekGame.team2Id !== teamId) {
          otherScores.push(toNumber(weekGame.team2Score));
        }
      }

      totalActualWins += otherScores.filter((score) => teamScore > score).length;
      totalPossibleWins += otherScores.length;
    }

    return totalPossibleWins > 0 ? totalActualWins / totalPossibleWins : 0;
  }

  /**
   * How much luckier a team's record is than its scoring deserved. Diagnostic
   * only — it is reported to the UI but carries no weight, because rewarding
   * luck and rewarding the absence of it are both wrong.
   */
  calculateLuckPercentage(teamId) {
    const teamGames = this.gamesFor(teamId);
    if (teamGames.length === 0) return 0;

    const wins = teamGames.filter((game) => this.getWinnerFromGame(game) === teamId).length;
    return wins / teamGames.length - this.calculateAllPlayWinPercentage(teamId);
  }

  /**
   * Record, quality-adjusted, then scaled by how hard the schedule has been.
   *
   * This is the replacement for the old strength-of-schedule component, which
   * could not work: it averaged `calculateTeamStrength` over opponents, and
   * that function was async, so it was averaging Promises.
   */
  rawRecordScore(teamId) {
    const stats = this.calculateTeamStats(teamId);
    if (stats.gamesPlayed === 0) return 0;

    const base = stats.winPercentage * 100 + 2 * (stats.qualityWins - stats.badLosses);
    return base * (1 + (stats.opponentWinPercentage - 0.5) * 0.25);
  }

  /** Consistency: penalizes week-to-week variance, rewards a high floor. */
  calculateConsistencyScore(teamId) {
    const teamGames = this.gamesFor(teamId);
    if (teamGames.length < 2) return 0.5; // Neutral score for insufficient data

    const scores = teamGames.map((game) => this.scoreFor(game, teamId));
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance =
      scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

    const aboveMean = scores.filter((score) => score > mean).length;
    const floorCeilingBalance = aboveMean / scores.length;

    let consistencyScore = (1 - cv) * floorCeilingBalance;

    if (cv < THRESHOLDS.eliteConsistency) {
      consistencyScore *= 1.05;
    } else if (cv > THRESHOLDS.highVariance) {
      consistencyScore *= 0.95;
    }

    return Math.max(0, Math.min(1, consistencyScore));
  }

  // ---------------------------------------------------------------------
  // Roster components, from player_week_stats
  // ---------------------------------------------------------------------

  /** `{ [week]: rows }` for one team, cut off at the viewing week. */
  playerWeeksFor(teamId) {
    const byWeek = this.playerWeekStats?.[teamId];
    if (!byWeek) return [];

    return Object.entries(byWeek)
      .map(([week, rows]) => ({ week: Number(week), rows: Array.isArray(rows) ? rows : [] }))
      .filter((entry) => entry.week < this.viewingWeek && entry.rows.length > 0)
      .sort((a, b) => a.week - b.week);
  }

  /** Mean points the actual starting lineup produced per week. */
  rawRosterStrength(teamId) {
    const weeks = this.playerWeeksFor(teamId);
    if (weeks.length === 0) return null;

    const total = weeks.reduce(
      (sum, { rows }) =>
        sum +
        rows
          .filter((row) => row.started)
          .reduce((weekSum, row) => weekSum + toNumber(row.actualPoints), 0),
      0
    );

    return total / weeks.length;
  }

  /**
   * The share of each week's best possible lineup that was actually started,
   * averaged over the season. This is the one component that measures the
   * manager rather than the roster.
   */
  rawLineupEfficiency(teamId) {
    const weeks = this.playerWeeksFor(teamId);
    if (weeks.length === 0) return null;

    const ratios = [];

    for (const { rows } of weeks) {
      const optimal = optimalLineupPoints(rows);
      // A week where the best lineup scores nothing (a bye, or a week not yet
      // played) says nothing about management; averaging in a 0 would.
      if (optimal <= 0) continue;

      const started = rows
        .filter((row) => row.started)
        .reduce((sum, row) => sum + toNumber(row.actualPoints), 0);

      ratios.push(Math.max(0, Math.min(1, started / optimal)));
    }

    if (ratios.length === 0) return null;

    return (ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length) * 100;
  }

  // ---------------------------------------------------------------------
  // Forward-looking components
  // ---------------------------------------------------------------------

  /** The `players` row behind a roster entry, which carries the projections. */
  resolvePlayerForRosterEntry(entry) {
    const embedded = entry?.player ?? null;

    const id = embedded?.id ?? entry?.playerId ?? null;
    if (id != null && this.playersById.has(id)) return this.playersById.get(id);

    const espnId =
      embedded?.espnPlayerId ?? embedded?.espn_player_id ?? entry?.espnPlayerId ?? null;
    if (espnId != null && this.playersByEspnId.has(espnId)) {
      return this.playersByEspnId.get(espnId);
    }

    // The embedded row is selected without the projection columns, so it is a
    // last resort rather than a substitute.
    return embedded;
  }

  /** Current starters of a team, from the roster attached to it. */
  currentStarters(teamId) {
    const team = this.teams.find((candidate) => candidate.id === teamId);
    const roster = team?.roster;
    if (!Array.isArray(roster) || roster.length === 0) return [];

    return roster.filter((entry) => {
      const slot = entry?.rosterSlot ?? entry?.roster_slot;
      return slot != null && !NON_STARTING_SLOTS.has(slot);
    });
  }

  /**
   * Projected points still to come from the current starters.
   *
   * Two horizons, returned separately because they are on different scales —
   * a season remainder is in the hundreds, one week is around a hundred. The
   * caller normalizes each across the league before blending them, so the
   * 60/40 split means what it says instead of being swallowed by the larger
   * number.
   *
   * Rest-of-season leans on `season_projected_points − season_actual_points`
   * and next week on `projected_points`, both already synced weekly and both
   * scored with this league's settings. ESPN bakes NFL opponent difficulty into
   * those projections, which is where the second kind of schedule difficulty
   * the ranking promises comes from.
   */
  rawFutureOutlook(teamId) {
    if (!this.isLiveView) return null;

    const starters = this.currentStarters(teamId);
    if (starters.length === 0) return null;

    let restOfSeason = 0;
    let nextWeek = 0;
    let resolved = 0;

    for (const entry of starters) {
      const player = this.resolvePlayerForRosterEntry(entry);
      if (!player) continue;

      const seasonProjected = toNumber(
        player.seasonProjectedPoints ?? player.season_projected_points
      );
      const seasonActual = toNumber(player.seasonActualPoints ?? player.season_actual_points);
      const weekProjected = toNumber(player.projectedPoints ?? player.projected_points);

      if (seasonProjected === 0 && weekProjected === 0) continue;

      resolved += 1;
      restOfSeason += Math.max(0, seasonProjected - seasonActual);
      nextWeek += weekProjected;
    }

    if (resolved === 0) return null;

    return { restOfSeason, nextWeek };
  }

  /** Remaining regular-season opponents from the viewing week onward. */
  remainingOpponents(teamId) {
    return this.games
      .filter(
        (game) =>
          (game.team1Id === teamId || game.team2Id === teamId) &&
          game.week >= this.viewingWeek &&
          game.week <= this.regularSeasonWeeks &&
          game.team1Id != null &&
          game.team2Id != null
      )
      .map((game) => (game.team1Id === teamId ? game.team2Id : game.team1Id));
  }

  // ---------------------------------------------------------------------
  // Assembling the components
  // ---------------------------------------------------------------------

  /**
   * Every component for every team, normalized and ready to weight.
   *
   * `leagueSos` needs two passes: it scores a team by the quality of the
   * opponents it has left, and opponent quality is itself a power rating. Pass
   * one rates everyone on the eight components that need no opponent; pass two
   * uses those ratings.
   */
  calculateAllComponents() {
    const teamIds = this.teams.map((team) => team.id);

    const raw = {
      record: {},
      allPlay: {},
      scoring: {},
      recentForm: {},
      consistency: {},
      rosterStrength: {},
      lineupEfficiency: {}
    };
    const futureRestOfSeason = {};
    const futureNextWeek = {};

    for (const teamId of teamIds) {
      const stats = this.calculateTeamStats(teamId);

      raw.record[teamId] = this.rawRecordScore(teamId);
      raw.allPlay[teamId] = this.calculateAllPlayWinPercentage(teamId) * 100;
      raw.scoring[teamId] = stats.averagePointsFor;
      raw.recentForm[teamId] = this.calculateFormScore(teamId, this.getLastNGames(teamId, 3));
      raw.consistency[teamId] = this.calculateConsistencyScore(teamId) * 100;
      raw.rosterStrength[teamId] = this.rawRosterStrength(teamId);
      raw.lineupEfficiency[teamId] = this.rawLineupEfficiency(teamId);

      const outlook = this.rawFutureOutlook(teamId);
      futureRestOfSeason[teamId] = outlook ? outlook.restOfSeason : null;
      futureNextWeek[teamId] = outlook ? outlook.nextWeek : null;
    }

    const normalized = {};
    for (const [key, values] of Object.entries(raw)) {
      normalized[key] = normalizeAcrossLeague(values);
    }

    const restOfSeason = normalizeAcrossLeague(futureRestOfSeason);
    const nextWeek = normalizeAcrossLeague(futureNextWeek);

    const components = {};
    for (const teamId of teamIds) {
      components[teamId] = {
        record: normalized.record[teamId],
        allPlay: normalized.allPlay[teamId],
        scoring: normalized.scoring[teamId],
        recentForm: normalized.recentForm[teamId],
        consistency: normalized.consistency[teamId],
        rosterStrength: normalized.rosterStrength[teamId],
        lineupEfficiency: normalized.lineupEfficiency[teamId],
        futureStrength: isUsable(restOfSeason[teamId])
          ? 0.6 * restOfSeason[teamId] + 0.4 * toNumber(nextWeek[teamId])
          : null,
        leagueSos: null
      };
    }

    // Pass one: a rating that owes nothing to opponents.
    const baseRating = {};
    for (const teamId of teamIds) {
      baseRating[teamId] = combineWeightedComponents(components[teamId]);
    }

    // Pass two: how strong the teams still to be played are.
    const opponentStrength = {};
    for (const teamId of teamIds) {
      const opponents = this.remainingOpponents(teamId).filter((id) => id in baseRating);
      opponentStrength[teamId] = opponents.length
        ? opponents.reduce((sum, id) => sum + baseRating[id], 0) / opponents.length
        : null;
    }

    // A harder run-in scores higher — the same direction the `record` component
    // already adjusts for past opponents. Those two used to disagree: facing
    // strong teams raised your record score but lowered this one, so a schedule
    // was simultaneously an excuse and a penalty. Rewarding an easy run-in also
    // stacked on top of all-play, which is what let a 2-4 team with the league's
    // best all-play and the softest remaining schedule rank third.
    //
    // The remaining schedule is not evidence of quality either way, so it is
    // deliberately the smallest weight; what it does is stop an easy path from
    // flattering a team the rest of the components rate as average.
    const normalizedOpponentStrength = normalizeAcrossLeague(opponentStrength);
    for (const teamId of teamIds) {
      components[teamId].leagueSos = normalizedOpponentStrength[teamId];
    }

    return components;
  }

  /**
   * The rating and the components behind it.
   *
   * `luckPercentage` and `allPlayWinPct` ride along unweighted: the table shows
   * both, and neither belongs in the score.
   */
  calculatePowerRating(teamId) {
    const components = this.componentsByTeam[teamId] ?? {};
    const powerRating = combineWeightedComponents(components);

    return {
      powerRating: Math.max(0, Math.min(100, powerRating)),
      components: {
        ...components,
        allPlayWinPct: this.calculateAllPlayWinPercentage(teamId) * 100,
        luckPercentage: this.calculateLuckPercentage(teamId)
      }
    };
  }

  // ---------------------------------------------------------------------
  // Team statistics
  // ---------------------------------------------------------------------

  calculateTeamStats(teamId) {
    if (this.statsCache.has(teamId)) return this.statsCache.get(teamId);

    const stats = this.computeTeamStats(teamId);
    this.statsCache.set(teamId, stats);
    return stats;
  }

  computeTeamStats(teamId) {
    const teamGames = this.gamesFor(teamId);

    if (teamGames.length === 0) return this.getDefaultStats(teamId);

    const wins = teamGames.filter((game) => this.getWinnerFromGame(game) === teamId).length;
    const losses = teamGames.filter((game) => {
      const winner = this.getWinnerFromGame(game);
      return winner !== null && winner !== teamId;
    }).length;

    const pointsFor = teamGames.reduce((sum, game) => sum + this.scoreFor(game, teamId), 0);
    const pointsAgainst = teamGames.reduce(
      (sum, game) => sum + this.opponentScoreFor(game, teamId),
      0
    );

    const gamesPlayed = teamGames.length;
    const opponentIds = teamGames.map((game) =>
      game.team1Id === teamId ? game.team2Id : game.team1Id
    );
    const opponentWinPercentage = this.calculateOpponentWinPercentage(opponentIds, teamId);

    const blowoutWins = teamGames.filter(
      (game) =>
        this.getWinnerFromGame(game) === teamId &&
        this.scoreFor(game, teamId) - this.opponentScoreFor(game, teamId) >= THRESHOLDS.blowout
    ).length;

    const closeWins = teamGames.filter(
      (game) =>
        this.getWinnerFromGame(game) === teamId &&
        Math.abs(this.scoreFor(game, teamId) - this.opponentScoreFor(game, teamId)) <=
          THRESHOLDS.close
    ).length;

    const closeLosses = teamGames.filter((game) => {
      const winner = this.getWinnerFromGame(game);
      return (
        winner !== null &&
        winner !== teamId &&
        Math.abs(this.scoreFor(game, teamId) - this.opponentScoreFor(game, teamId)) <=
          THRESHOLDS.close
      );
    }).length;

    return {
      teamId,
      gamesPlayed,
      wins,
      losses,
      ties: 0, // No ties in fantasy football
      winPercentage: wins / gamesPlayed,
      pointsFor,
      pointsAgainst,
      pointDifferential: pointsFor - pointsAgainst,
      averagePointsFor: pointsFor / gamesPlayed,
      averagePointsAgainst: pointsAgainst / gamesPlayed,
      // Signed against an even schedule: +0.15 means opponents have won 65% of
      // their other games. The old value came from averaging Promises.
      strengthOfSchedule: opponentWinPercentage - 0.5,
      opponentWinPercentage,
      qualityWins: this.calculateQualityWins(teamId, teamGames),
      badLosses: this.calculateBadLosses(teamId, teamGames),
      blowoutWins,
      closeWins,
      closeLosses,
      recentForm: this.calculateRecentForm(teamId),
      currentStreak: this.calculateCurrentStreak(teamId, teamGames)
    };
  }

  calculateOpponentWinPercentage(opponentIds, excludeTeamId) {
    if (opponentIds.length === 0) return 0;

    const opponentStats = opponentIds.map((opponentId) => {
      const opponentGames = this.games.filter(
        (game) =>
          (game.team1Id === opponentId || game.team2Id === opponentId) &&
          game.isCompleted &&
          game.week < this.viewingWeek &&
          game.team1Id !== excludeTeamId &&
          game.team2Id !== excludeTeamId
      );

      if (opponentGames.length === 0) return 0;

      const wins = opponentGames.filter(
        (game) => this.getWinnerFromGame(game) === opponentId
      ).length;
      return wins / opponentGames.length;
    });

    return opponentStats.reduce((sum, pct) => sum + pct, 0) / opponentStats.length;
  }

  calculateQualityWins(teamId, teamGames) {
    return teamGames.filter(
      (game) =>
        this.getWinnerFromGame(game) === teamId &&
        this.opponentScoreFor(game, teamId) >= this.leagueStats.averageScore * 1.1
    ).length;
  }

  calculateBadLosses(teamId, teamGames) {
    return teamGames.filter((game) => {
      const winner = this.getWinnerFromGame(game);
      return (
        winner !== null &&
        winner !== teamId &&
        this.opponentScoreFor(game, teamId) <= this.leagueStats.averageScore * 0.8
      );
    }).length;
  }

  calculateRecentForm(teamId) {
    const recentWeekStart = Math.max(1, this.viewingWeek - THRESHOLDS.recentFormWeeks);
    const recentGames = this.gamesFor(teamId).filter((game) => game.week >= recentWeekStart);

    if (recentGames.length === 0) return 0;

    const recentPoints = recentGames.reduce((sum, game) => sum + this.scoreFor(game, teamId), 0);
    return recentPoints / recentGames.length - this.leagueStats.averageScore;
  }

  calculateCurrentStreak(teamId, teamGames) {
    if (teamGames.length === 0) return { type: 'none', length: 0 };

    const sortedGames = [...teamGames].sort((a, b) => b.week - a.week);

    const firstResult = this.getWinnerFromGame(sortedGames[0]);
    if (firstResult === null) return { type: 'tie', length: 1 };

    const streakType = firstResult === teamId ? 'win' : 'loss';
    let streakLength = 1;

    for (let i = 1; i < sortedGames.length; i++) {
      const result = this.getWinnerFromGame(sortedGames[i]);
      if (result === null) break;

      const isWin = result === teamId;
      if ((streakType === 'win' && !isWin) || (streakType === 'loss' && isWin)) break;
      streakLength++;
    }

    return { type: streakType, length: streakLength };
  }

  getLastNGames(teamId, n) {
    return this.gamesFor(teamId)
      .sort((a, b) => b.week - a.week)
      .slice(0, n);
  }

  /** Results and scoring over recent games, on a 0-100 scale around a neutral 50. */
  calculateFormScore(teamId, games) {
    if (games.length === 0) return 50;

    let formPoints = 50;
    const weights = [0.5, 0.3, 0.2];

    games.forEach((game, index) => {
      const weight = weights[index] ?? 0.1;
      const winner = this.getWinnerFromGame(game);
      const teamScore = this.scoreFor(game, teamId);
      const margin = teamScore - this.opponentScoreFor(game, teamId);

      if (winner === teamId) {
        formPoints += 15 * weight;
        if (margin >= THRESHOLDS.blowout) formPoints += 5 * weight;
      } else if (winner !== null) {
        formPoints -= 15 * weight;
        if (margin <= -THRESHOLDS.blowout) formPoints -= 5 * weight;
      }

      if (teamScore > this.leagueStats.averageScore * 1.1) {
        formPoints += 5 * weight;
      } else if (teamScore < this.leagueStats.averageScore * 0.9) {
        formPoints -= 5 * weight;
      }
    });

    return Math.max(0, Math.min(100, formPoints));
  }

  getDefaultStats(teamId) {
    return {
      teamId,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      winPercentage: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifferential: 0,
      averagePointsFor: 0,
      averagePointsAgainst: 0,
      strengthOfSchedule: 0,
      opponentWinPercentage: 0,
      qualityWins: 0,
      badLosses: 0,
      blowoutWins: 0,
      closeWins: 0,
      closeLosses: 0,
      recentForm: 0,
      currentStreak: { type: 'none', length: 0 }
    };
  }

  // ---------------------------------------------------------------------
  // Roster metrics (reported alongside the rating, not weighted directly)
  // ---------------------------------------------------------------------

  calculateAllTeamRosterMetrics() {
    const metrics = {};
    for (const team of this.teams) metrics[team.id] = this.calculateRosterMetrics(team);
    return metrics;
  }

  /**
   * What the roster actually did, per week.
   *
   * This used to read `player.playerId` and `player.isActive` off roster rows
   * that carry neither, so every number it produced was zero. It now reads the
   * same `player_week_stats` rows the components do.
   */
  calculateRosterMetrics(team) {
    const weeks = this.playerWeeksFor(team?.id);

    if (weeks.length === 0) {
      return {
        starterPointsPerWeek: null,
        benchPointsPerWeek: null,
        lineupEfficiency: null,
        rosterWeeksRecorded: 0
      };
    }

    let starterTotal = 0;
    let benchTotal = 0;

    for (const { rows } of weeks) {
      for (const row of rows) {
        const points = toNumber(row.actualPoints);
        if (row.started) starterTotal += points;
        else benchTotal += points;
      }
    }

    return {
      starterPointsPerWeek: starterTotal / weeks.length,
      benchPointsPerWeek: benchTotal / weeks.length,
      lineupEfficiency: this.rawLineupEfficiency(team.id),
      rosterWeeksRecorded: weeks.length
    };
  }

  // ---------------------------------------------------------------------
  // Playoff odds and output
  // ---------------------------------------------------------------------

  /**
   * Playoff odds for all teams.
   * @returns {Map} teamId -> percentage (0-100)
   */
  calculatePlayoffOdds() {
    if (this.divisions.length === 0 || this.teams.length === 0) {
      const emptyOdds = new Map();
      for (const team of this.teams) emptyOdds.set(team.id, 0);
      return emptyOdds;
    }

    const playoffCalculator = new PlayoffOddsCalculator(
      this.teams,
      this.games,
      this.divisions,
      this.currentWeek,
      this.regularSeasonWeeks,
      this.seasonYear
    );

    return playoffCalculator.calculateAllPlayoffOdds();
  }

  calculateAllTeamStats() {
    const playoffOddsMap = this.calculatePlayoffOdds();

    return this.teams.map((team) => {
      const stats = this.calculateTeamStats(team.id);
      const { powerRating, components } = this.calculatePowerRating(team.id);

      return {
        ...team,
        ...stats,
        ...(this.teamRosterMetrics[team.id] ?? {}),
        powerRating,
        powerRatingComponents: components,
        playoffOdds: playoffOddsMap.get(team.id) || 0
      };
    });
  }

  getRankings(previousRankings = null) {
    const rankings = this.calculateAllTeamStats().sort(
      (a, b) => b.powerRating - a.powerRating
    );

    return rankings.map((team, index) => {
      const currentRank = index + 1;
      let rankChange = 0;
      let previousRank = null;

      if (previousRankings) {
        const teamIdentifier = team.id || team.teamId;
        const previousEntry = previousRankings.find(
          (previous) =>
            previous.teamId === teamIdentifier ||
            previous.teamId === team.teamId ||
            previous.teamId === team.id
        );
        if (previousEntry) {
          previousRank = previousEntry.rank || previousEntry.previousRank || currentRank;
          rankChange = previousRank - currentRank;
        }
      }

      return { ...team, rank: currentRank, previousRank, rankChange };
    });
  }
}
