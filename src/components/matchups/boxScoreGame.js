/**
 * The one shape `MatchupBoxScoreSheet` opens, from whatever a surface has.
 *
 * Every surface that lists a finished game holds it differently: a
 * head-to-head meeting, a record-book row, a franchise's week, a home form
 * row. This turns the parts each one has into the sheet's game, side 1 first,
 * so the sheet never has to know where it was opened from.
 *
 * `phase` is the record book's word for it (`regular` / `playoff` /
 * `consolation`); a `games.type` works too. Names are the caller's, already
 * masked for the viewer.
 *
 * @param {{ id?, seasonId, year, nflSeasonYear?, week, phase?, type?,
 *   team1: { id, franchiseId?, name?, score }, team2: { id, franchiseId?, name?, score } }} parts
 */
export function boxScoreGame({ id = null, seasonId, year, nflSeasonYear = null, week, phase = null, type = null, team1, team2 }) {
  if (!seasonId || week == null || !team1?.id || !team2?.id) return null;

  const kind = phase ?? phaseOfType(type);
  return {
    id: id ?? `${seasonId}:${week}:${team1.id}`,
    seasonId,
    year,
    nflSeasonYear,
    week,
    type,
    isPlayoff: kind === 'playoff',
    isConsolation: kind === 'consolation',
    team1Id: team1.id,
    team2Id: team2.id,
    team1FranchiseId: team1.franchiseId ?? null,
    team2FranchiseId: team2.franchiseId ?? null,
    team1Name: team1.name ?? null,
    team2Name: team2.name ?? null,
    team1Score: Number.isFinite(team1.score) ? team1.score : null,
    team2Score: Number.isFinite(team2.score) ? team2.score : null
  };
}

/** A `games.type` as a phase: a bracket game is `playoff%` but not consolation. */
export function phaseOfType(type) {
  if (typeof type !== 'string') return 'regular';
  if (type.startsWith('playoff_consolation')) return 'consolation';
  if (type.startsWith('playoff')) return 'playoff';
  return 'regular';
}

/**
 * A record-book game row (`addGameRows`) as a box score: the row's team is
 * side 1, as the row reads ("120–100 vs …").
 */
export function boxScoreFromRecordRow(row, identity) {
  if (!row?.seasonId || !row.teamId || !row.opponentTeamId) return null;
  const [pf, pa] = row.score ?? [];
  return boxScoreGame({
    id: row.gameId ?? null,
    seasonId: row.seasonId,
    year: row.year,
    week: row.week,
    phase: row.phase,
    team1: { id: row.teamId, franchiseId: row.franchiseId, name: identity?.teamName?.(row.teamId), score: pf },
    team2: {
      id: row.opponentTeamId,
      franchiseId: row.opponentFranchiseId,
      name: identity?.teamName?.(row.opponentTeamId),
      score: pa
    }
  });
}
