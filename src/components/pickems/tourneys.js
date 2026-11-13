import { buildPickEmStandings } from './pickEmStandings.js';

/**
 * The two in-season pick'ems tourneys.
 *
 * Pick'ems results are tracked for the whole season now, so the season splits
 * into two prizes rather than running as one open-ended leaderboard: weeks 1-8
 * pay $20 FAAB for the season in progress, weeks 9-17 pay $20 FAAB for the
 * next one. Either way the reward needs a participation floor, so a member who
 * entered one lucky week cannot take it from somebody who played every week.
 *
 * Declared once because the rules are stated in two places that must not
 * disagree — the Standings tab, where a member checks where they stand, and
 * the Make Picks page, where they are deciding whether to bother. Two copies
 * of a rule is how the page ends up promising something the league is not
 * paying.
 *
 * Nothing here is enforced anywhere: the prize is settled between people, and
 * `totalWeeksParticipated` on the standings row is the number the floor is
 * read against. This module is the statement of the rule, not a gate. The one
 * thing that acts on it is the winners' push notification, which reads
 * `tourneyWinners` so that it names who this module says won.
 */

/**
 * @typedef {object} PickEmTourney
 * @property {string} id
 * @property {number} startWeek
 * @property {number} endWeek
 * @property {number} minWeeks - weeks entered to be eligible for the prize
 * @property {string} weeks - the span, as it is written
 * @property {string} prize
 */

/** @type {PickEmTourney[]} */
export const PICK_EM_TOURNEYS = [
  {
    id: 'first-half',
    startWeek: 1,
    endWeek: 8,
    minWeeks: 5,
    weeks: 'Weeks 1–8',
    prize: '$20 FAAB for this year'
  },
  {
    id: 'second-half',
    startWeek: 9,
    endWeek: 17,
    minWeeks: 5,
    weeks: 'Weeks 9–17',
    prize: '$20 FAAB for next year'
  }
];

/**
 * The tourney a week belongs to, or null for a week outside both spans (the
 * playoff weeks, which are not part of either prize).
 *
 * @param {number|null|undefined} week
 * @returns {PickEmTourney|null}
 */
export function tourneyForWeek(week) {
  const n = Number(week);
  if (!Number.isFinite(n)) return null;
  return PICK_EM_TOURNEYS.find((t) => n >= t.startWeek && n <= t.endWeek) ?? null;
}

/**
 * The Standings tab's views: each tourney, then the whole season. `span` is how
 * the view is written in the middle of a sentence.
 *
 * @typedef {object} StandingsScope
 * @property {string} id
 * @property {string} label
 * @property {string} span
 * @property {number} [startWeek] - a tourney's; the season has no bounds
 * @property {number} [endWeek]
 */

export const SEASON_SCOPE_ID = 'season';

/** @type {StandingsScope[]} */
export const STANDINGS_SCOPES = [
  ...PICK_EM_TOURNEYS.map(({ id, weeks, startWeek, endWeek }) => ({
    id,
    label: weeks,
    span: weeks.toLowerCase(),
    startWeek,
    endWeek
  })),
  { id: SEASON_SCOPE_ID, label: 'Season-long', span: 'this season' }
];

/**
 * @param {StandingsScope} scope
 * @param {number} week
 * @returns {boolean}
 */
export function scopeIncludesWeek(scope, week) {
  if (scope.id === SEASON_SCOPE_ID) return true;
  return week >= scope.startWeek && week <= scope.endWeek;
}

/**
 * The picks a view counts, which is what keeps its standings and its team
 * popularity about the same weeks.
 *
 * @param {Array<{ weekNumber: number }>} picks
 * @param {StandingsScope} scope
 */
export function picksInScope(picks = [], scope) {
  return picks.filter((pick) => scopeIncludesWeek(scope, pick.weekNumber));
}

/**
 * The view the Standings tab opens on: the tourney in progress, then the season
 * once the last tourney's final week is scored.
 *
 * The week is the league's, not the one being viewed, because "in progress" is
 * present tense. It stops at the season's last week, so it cannot say on its own
 * that the season is over: that takes the scored week or the finalized season.
 *
 * @param {object} input
 * @param {number} input.actualWeek
 * @param {number|null} [input.finishedWeek] - the newest fully scored week
 * @param {boolean} [input.seasonCompleted]
 * @returns {string} a `STANDINGS_SCOPES` id
 */
export function defaultStandingsScopeId({ actualWeek, finishedWeek = null, seasonCompleted = false }) {
  const lastWeek = PICK_EM_TOURNEYS[PICK_EM_TOURNEYS.length - 1].endWeek;
  if (seasonCompleted || (finishedWeek ?? 0) >= lastWeek) return SEASON_SCOPE_ID;
  return tourneyForWeek(actualWeek)?.id ?? SEASON_SCOPE_ID;
}

/**
 * How many weeks of a tourney a member has entered, and whether that clears
 * the floor. `weeks` is the set of week numbers they submitted in — the
 * standings row only carries a count, so a caller that has the weeks passes
 * them and a caller that does not passes nothing and gets `entered: 0`.
 *
 * @param {PickEmTourney} tourney
 * @param {Iterable<number>} [weeks]
 * @returns {{ entered: number, eligible: boolean }}
 */
export function tourneyParticipation(tourney, weeks = []) {
  let entered = 0;
  for (const week of weeks) {
    const n = Number(week);
    if (n >= tourney.startWeek && n <= tourney.endWeek) entered += 1;
  }
  return { entered, eligible: entered >= tourney.minWeeks };
}

/**
 * Each member's score in a tourney, from the week-by-week scores
 * (`getPickEmWeeklyBreakdown`), best first. `weeklyScores` holds only weeks that
 * have a pick'em, and a member's row in one is them having entered it.
 *
 * @param {PickEmTourney} tourney
 * @param {Record<number, Array<{ userId: string, totalPoints?: number }>>} weeklyScores
 * @returns {Array<{ userId: string, totalPoints: number, entered: number, eligible: boolean }>}
 */
export function tourneyStandings(tourney, weeklyScores = {}) {
  const totals = new Map();
  for (const [week, scores] of Object.entries(weeklyScores)) {
    if (Number(week) < tourney.startWeek || Number(week) > tourney.endWeek) continue;
    for (const score of scores ?? []) {
      const total = totals.get(score.userId) ?? { userId: score.userId, totalPoints: 0, weeks: [] };
      total.totalPoints += score.totalPoints ?? 0;
      total.weeks.push(week);
      totals.set(score.userId, total);
    }
  }
  return [...totals.values()]
    .map(({ userId, totalPoints, weeks }) => ({ userId, totalPoints, ...tourneyParticipation(tourney, weeks) }))
    .sort((a, b) => b.totalPoints - a.totalPoints);
}

/**
 * Who won a tourney: every eligible member on the top score, so a tie for
 * first is everybody on it, and a member under the floor cannot take it from
 * somebody who played. Nobody over the floor means no winner.
 *
 * @param {ReturnType<typeof tourneyStandings>} standings
 */
export function tourneyWinners(standings = []) {
  const eligible = standings.filter((row) => row.eligible);
  const top = Math.max(0, ...eligible.map((row) => row.totalPoints));
  return top > 0 ? eligible.filter((row) => row.totalPoints === top) : [];
}

/**
 * A tourney's standings from the season's picks (`getAllSeasonPicks`), in
 * `tourneyStandings`' row shape, carrying each member's `displayName` for the
 * page. The Standings tab already holds these picks, so the page names the
 * winner from the same rows its table ranks, through the same
 * `buildPickEmStandings`.
 *
 * @param {PickEmTourney} tourney
 * @param {Array<{ weekNumber: number }>} picks
 */
export function tourneyStandingsFromPicks(tourney, picks = []) {
  const scoped = picks.filter((pick) => pick.weekNumber >= tourney.startWeek && pick.weekNumber <= tourney.endWeek);
  return buildPickEmStandings(scoped).map((row) => ({
    userId: row.userId,
    displayName: row.displayName,
    totalPoints: row.totalPoints,
    entered: row.totalWeeksParticipated,
    eligible: row.totalWeeksParticipated >= tourney.minWeeks
  }));
}

/**
 * The tourney whose winner the Pick'ems header names, or null: weeks 1-8, in
 * week 9 only, once week 8 is fully scored. One week of announcement, the way
 * the week's winners line names last week and moves on.
 *
 * @param {object} input
 * @param {number|null} input.finishedWeek - the newest fully scored week
 * @param {number|null} input.viewedWeek
 * @returns {PickEmTourney|null}
 */
export function announcedTourney({ finishedWeek, viewedWeek }) {
  const tourney = PICK_EM_TOURNEYS[0];
  const announces = (finishedWeek ?? 0) >= tourney.endWeek && viewedWeek === tourney.endWeek + 1;
  return announces ? tourney : null;
}
