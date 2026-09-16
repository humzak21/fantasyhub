/**
 * A franchise's record, week by week — the franchise profile's trend chart.
 *
 * Pure, over `services/db/history.js::getRecordTrendSource`, which reads scored
 * regular-season games only. The chart plots games over .500 (wins minus
 * losses; a tie moves nothing), so a 9–5 that started 1–4 and one that started
 * 8–0 finally look different.
 *
 * `buildRecordTrends` runs once per fetch in the query's `select`;
 * `buildTrendChart` runs per render over whatever teams and seasons the reader
 * picked.
 */

/**
 * @typedef {object} TrendPoint
 * @property {number} week
 * @property {number} wins    cumulative, through this week
 * @property {number} losses
 * @property {number} ties
 * @property {number} net     wins − losses
 * @property {'W'|'L'|'T'} result  this week's game
 * @property {number} pf
 * @property {number} pa
 */

/**
 * @param {{ seasons: object[], teams: object[], games: object[] }} source
 * @returns {{ years: { year: number, isCompleted: boolean }[],
 *             byFranchise: Record<string, Record<number, TrendPoint[]>> }}
 */
export function buildRecordTrends(source) {
  const seasons = [...(source?.seasons ?? [])].sort((a, b) => a.year - b.year);
  const seasonById = new Map(seasons.map((season) => [season.id, season]));
  const teamById = new Map((source?.teams ?? []).map((team) => [team.id, team]));

  /** franchiseId → year → unsorted game sides */
  const grouped = new Map();
  const addSide = (game, season, teamId, pf, pa) => {
    const team = teamById.get(teamId);
    // A team from another season would file the game under the wrong year.
    if (!team?.franchiseId || team.seasonId !== game.seasonId) return;
    if (!Number.isFinite(pf) || !Number.isFinite(pa)) return;

    if (!grouped.has(team.franchiseId)) grouped.set(team.franchiseId, new Map());
    const byYear = grouped.get(team.franchiseId);
    if (!byYear.has(season.year)) byYear.set(season.year, []);
    byYear.get(season.year).push({ week: game.week, pf, pa });
  };

  for (const game of source?.games ?? []) {
    const season = seasonById.get(game.seasonId);
    if (!season || !Number.isFinite(game.week)) continue;
    addSide(game, season, game.team1Id, game.team1Score, game.team2Score);
    addSide(game, season, game.team2Id, game.team2Score, game.team1Score);
  }

  const byFranchise = {};
  for (const [franchiseId, byYear] of grouped) {
    byFranchise[franchiseId] = {};
    for (const [year, sides] of byYear) {
      let wins = 0;
      let losses = 0;
      let ties = 0;
      byFranchise[franchiseId][year] = sides
        .sort((a, b) => a.week - b.week)
        .map(({ week, pf, pa }) => {
          const result = pf > pa ? 'W' : pf < pa ? 'L' : 'T';
          if (result === 'W') wins += 1;
          else if (result === 'L') losses += 1;
          else ties += 1;
          return { week, wins, losses, ties, net: wins - losses, result, pf, pa };
        });
    }
  }

  return {
    years: seasons.map(({ year, isCompleted }) => ({ year, isCompleted: Boolean(isCompleted) })),
    byFranchise
  };
}

/**
 * Every season any of these franchises played, newest first.
 *
 * @param {ReturnType<typeof buildRecordTrends>} trends
 * @param {string[]} franchiseIds
 * @returns {number[]}
 */
export function yearsPlayed(trends, franchiseIds) {
  const years = new Set();
  for (const franchiseId of franchiseIds) {
    for (const year of Object.keys(trends?.byFranchise?.[franchiseId] ?? {})) {
      years.add(Number(year));
    }
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * The lines for every picked franchise in every picked season it played, and
 * the rows recharts reads them from.
 *
 * Series run in the order the franchises were picked, newest season first
 * within each. `rows` holds one entry per week any series has, keyed by series
 * key; a series with no game that week is absent from the row, not zero.
 *
 * @param {ReturnType<typeof buildRecordTrends>} trends
 * @param {string[]} franchiseIds
 * @param {number[]} years
 */
export function buildTrendChart(trends, franchiseIds, years) {
  const isCompleted = new Map((trends?.years ?? []).map((entry) => [entry.year, entry.isCompleted]));
  const newestFirst = [...years].sort((a, b) => b - a);

  const series = [];
  for (const franchiseId of franchiseIds) {
    for (const year of newestFirst) {
      const points = trends?.byFranchise?.[franchiseId]?.[year];
      if (!points?.length) continue;
      series.push({
        key: `${franchiseId}:${year}`,
        franchiseId,
        year,
        isCompleted: isCompleted.get(year) ?? false,
        points,
        final: points[points.length - 1]
      });
    }
  }

  const rowsByWeek = new Map();
  let min = -1;
  let max = 1;
  for (const line of series) {
    for (const point of line.points) {
      if (!rowsByWeek.has(point.week)) rowsByWeek.set(point.week, { week: point.week });
      rowsByWeek.get(point.week)[line.key] = point.net;
      min = Math.min(min, point.net);
      max = Math.max(max, point.net);
    }
  }

  return {
    series,
    rows: [...rowsByWeek.values()].sort((a, b) => a.week - b.week),
    yDomain: [min, max]
  };
}
