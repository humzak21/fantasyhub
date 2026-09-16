/**
 * The facts every comparison is computed from, bucketed by franchise-season.
 *
 * Built on the record book's own per-game rows (`buildSides` + `markWeeks`),
 * from the record book's own source, so a blowout, a phase, an all-play win or
 * a lineup attaches to a game exactly as it does on the Records tab.
 *
 *   buckets  Map<"franchiseId:year", {
 *              franchiseId, year, completed,
 *              weeks:    regular-season team-weeks (a lineup attached if stored),
 *              playoffs: bracket games (consolation games are in neither),
 *              season:   placements, standing and transactions
 *            }>
 *   years    [{ year, isCompleted }], oldest first, seasons with games only
 *   franchiseIds
 */

import { EPSILON, buildSides, markWeeks } from '../recordBook/index.js';
import { compareStandings } from '../playoffSeeding.js';

export const bucketKey = (franchiseId, year) => `${franchiseId}:${year}`;

export function buildComparisonFacts(source = {}) {
  const seasons = source.seasons ?? [];
  const teams = source.teams ?? [];
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const sides = buildSides(source.games ?? [], seasonById, teamById);
  markWeeks(sides);

  // Regular-season totals per team: its PPG (an opponent's schedule-strength
  // input) and its standing.
  const totals = new Map();
  for (const side of sides) {
    if (side.phase !== 'regular') continue;
    const t = totals.get(side.teamId) ?? { id: side.teamId, games: 0, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 };
    t.games += 1;
    t.pointsFor += side.pf;
    t.pointsAgainst += side.pa;
    if (side.result === 'W') t.wins += 1;
    else if (side.result === 'L') t.losses += 1;
    else t.ties += 1;
    totals.set(side.teamId, t);
  }

  const lineupByTeamWeek = new Map();
  for (const row of source.lineups ?? []) {
    if (!Number.isFinite(row.starterPoints) || !Number.isFinite(row.optimalPoints)) continue;
    lineupByTeamWeek.set(`${row.teamId}:${row.week}`, row);
  }

  const buckets = new Map();
  const bucketFor = (team, season) => {
    const key = bucketKey(team.franchiseId, season.year);
    if (!buckets.has(key)) {
      buckets.set(key, {
        franchiseId: team.franchiseId,
        year: season.year,
        completed: Boolean(season.isCompleted),
        weeks: [],
        playoffs: [],
        season: null
      });
    }
    return buckets.get(key);
  };

  for (const side of sides) {
    const team = teamById.get(side.teamId);
    const season = seasonById.get(side.seasonId);
    if (!team?.franchiseId) continue;

    if (side.phase === 'regular') {
      const lineup = lineupByTeamWeek.get(`${side.teamId}:${side.week}`);
      const opponent = totals.get(side.opponentTeamId);
      bucketFor(team, season).weeks.push({
        ...side,
        opponentPpg: opponent?.games > 0 ? opponent.pointsFor / opponent.games : null,
        lineup: lineup
          ? {
              starterPoints: lineup.starterPoints,
              optimalPoints: lineup.optimalPoints,
              startersScoring: lineup.startersScoring
            }
          : null
      });
    } else if (side.phase === 'playoff') {
      bucketFor(team, season).playoffs.push(side);
    }
  }

  const txByKey = new Map((source.transactions ?? []).map((tx) => [`${tx.seasonId}:${tx.franchiseId}`, tx]));

  // Season facts: every team with a regular-season game.
  const bySeason = new Map();
  for (const t of totals.values()) {
    const team = teamById.get(t.id);
    if (!team?.franchiseId) continue;
    if (!bySeason.has(team.seasonId)) bySeason.set(team.seasonId, []);
    bySeason.get(team.seasonId).push(t);
  }

  for (const [seasonId, list] of bySeason) {
    const season = seasonById.get(seasonId);
    const standing = [...list].sort(compareStandings);
    const highPf = Math.max(...list.map((t) => t.pointsFor));
    const lastRank = Math.max(0, ...list.map((t) => teamById.get(t.id).finalRank).filter(Number.isFinite));

    standing.forEach((t, index) => {
      const team = teamById.get(t.id);
      const bucket = bucketFor(team, season);
      const playoffs = bucket.playoffs;
      bucket.season = {
        franchiseId: team.franchiseId,
        teamId: team.id,
        year: season.year,
        completed: Boolean(season.isCompleted),
        teamsInSeason: list.length,
        standing: index + 1,
        scoringTitle: Math.abs(t.pointsFor - highPf) < EPSILON,
        madePlayoffs: Boolean(team.madePlayoffs),
        playoffFinish: team.playoffFinish ?? null,
        finalRank: Number.isFinite(team.finalRank) ? team.finalRank : null,
        lastPlace: lastRank > 0 && team.finalRank === lastRank,
        playoffGames: playoffs.length,
        playoffWins: playoffs.filter((side) => side.result === 'W').length,
        playoffLosses: playoffs.filter((side) => side.result === 'L').length,
        playoffTies: playoffs.filter((side) => side.result === 'T').length,
        playoffPoints: playoffs.reduce((sum, side) => sum + side.pf, 0),
        transactions: txByKey.get(`${seasonId}:${team.franchiseId}`) ?? null
      };
    });
  }

  // A bucket with bracket games but no regular season cannot exist in this
  // league; drop it rather than carry a bucket with no season facts.
  for (const [key, bucket] of buckets) {
    if (!bucket.season) buckets.delete(key);
  }

  const yearsWithGames = new Set([...buckets.values()].map((bucket) => bucket.year));
  const years = seasons
    .filter((season) => yearsWithGames.has(season.year))
    .map((season) => ({ year: season.year, isCompleted: Boolean(season.isCompleted) }))
    .sort((a, b) => a.year - b.year);

  const franchiseIds = [...new Set([...buckets.values()].map((bucket) => bucket.franchiseId))];

  return { buckets, years, franchiseIds };
}
