/**
 * Where a team stands right now: its power rank, its place in its division and
 * its points for, off the same rows the Rankings tab and the standings drawer
 * read. Pure, so a page cannot disagree with them about what a rank means.
 *
 * Rankings arrive best first, so a team's rank is its position. Anything not
 * found is null, never 0: unknown is not last.
 *
 * @param {object} args
 * @param {string|number|null} args.teamId - the team in the active season
 * @param {Array} [args.rankings] - `useRankingsForWeek` rows
 * @param {object} [args.standings] - `useStandings` data
 * @returns {{ powerRank: number|null, divisionRank: number|null,
 *   divisionName: string|null, pointsFor: number|null }|null}
 */
export function currentSeasonStanding({ teamId, rankings = [], standings = null }) {
  if (teamId == null) return null;
  const same = (id) => String(id) === String(teamId);

  const rankIndex = rankings.findIndex((row) => same(row.teamId ?? row.id));

  for (const division of standings?.divisions ?? []) {
    const index = (division.teams ?? []).findIndex((team) => same(team.teamId ?? team.id));
    if (index === -1) continue;
    const team = division.teams[index];
    const played = (team.wins ?? 0) + (team.losses ?? 0) + (team.ties ?? 0) > 0;
    return {
      powerRank: rankIndex === -1 ? null : rankIndex + 1,
      divisionRank: played ? team.divisionRank ?? index + 1 : null,
      divisionName: division.divisionName ?? null,
      pointsFor: played ? team.pointsFor ?? null : null
    };
  }

  return { powerRank: rankIndex === -1 ? null : rankIndex + 1, divisionRank: null, divisionName: null, pointsFor: null };
}
