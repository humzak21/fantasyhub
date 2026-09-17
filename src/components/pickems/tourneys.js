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
 * read against. This module is the statement of the rule, not a gate.
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
