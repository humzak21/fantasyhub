/**
 * Pick'ems standings, from the picks themselves.
 *
 * The Standings tab has three views of one set of picks, the two tourneys and
 * the season, so this is pure and takes whichever picks it is given. A view is
 * therefore the same arithmetic over fewer rows, and changing tab fetches
 * nothing. `picksInScope` in `tourneys.js` does the filtering.
 */

/**
 * A pick is *decided* once its game is over.
 *
 * Every score counts hits against decided picks rather than against picks
 * entered, which is the same rule the rest of this codebase states as "unknown
 * is absent, never zero": a game nobody has played is not a miss. A member who
 * had gone 5-for-7 in week 1 and entered week 2 before kickoff read as 5/14 at
 * 35.7% — a record they could not have had, and one that fell further every
 * Tuesday as the new week's picks landed.
 *
 * `isCorrect` already requires `is_completed`, so this is the other half of
 * the same fact and has to come from the same place. Note a tie is decided and
 * correct for nobody; that is unchanged.
 *
 * @param {{ gameCompleted?: boolean }} pick
 * @returns {boolean}
 */
export const isDecided = (pick) => Boolean(pick?.gameCompleted);

/**
 * @param {Array<object>} picks - rows from `getAllSeasonPicks`, each carrying
 *   its `weekNumber`
 * @returns {Array<object>} one row per member who has a pick here, by points
 *   and then accuracy. `rankSeasonStandings` numbers them.
 */
export function buildPickEmStandings(picks = []) {
  const members = new Map();

  for (const pick of picks) {
    const member = members.get(pick.userId) ?? {
      userId: pick.userId,
      displayName: pick.displayName,
      totalPicks: 0,
      totalDecidedPicks: 0,
      totalCorrectPicks: 0,
      totalPoints: 0,
      weeks: new Map()
    };
    members.set(pick.userId, member);

    const week = member.weeks.get(pick.weekNumber) ?? { picks: 0, decided: 0, correct: 0 };
    member.weeks.set(pick.weekNumber, week);

    member.totalPicks++;
    week.picks++;
    if (isDecided(pick)) {
      member.totalDecidedPicks++;
      week.decided++;
    }
    if (pick.isCorrect) {
      member.totalCorrectPicks++;
      member.totalPoints += pick.pointsEarned || 1;
      week.correct++;
    }
  }

  return [...members.values()]
    .map(({ weeks, ...member }) => {
      const entered = [...weeks.values()];
      return {
        ...member,
        // Participation is *entering*, not being scored. The tourney floor is
        // read against this number, and a member who submitted on Tuesday has
        // played that week whether or not a ball has been thrown.
        totalWeeksParticipated: entered.length,
        // Every pick decided is the guard: a week where the Thursday game is
        // the only one played is 1-from-1 and therefore 100%, and crediting
        // that as a perfect week would take it back on Sunday.
        perfectWeeks: entered.filter(
          (week) => week.decided === week.picks && week.correct === week.picks
        ).length,
        overallAccuracyPercentage:
          member.totalDecidedPicks > 0
            ? (member.totalCorrectPicks / member.totalDecidedPicks) * 100
            : 0
      };
    })
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.overallAccuracyPercentage - a.overallAccuracyPercentage
    );
}
