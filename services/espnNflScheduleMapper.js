/**
 * ESPN `proTeams[]` → `nfl_schedule` rows, as pure functions.
 *
 * Nothing here touches the database or the network, the same split as
 * `services/espnGameMapper.js` and `services/espnPlayerStatsMapper.js`: this
 * returns a plan, `services/db/nflSchedule.js::upsertNflSchedule` executes it.
 *
 * Two properties of the output are the reason this file exists rather than the
 * writer doing the work inline:
 *
 *   - **Both perspectives come from one game object.** A game is emitted as a
 *     row for the home team and a row for the away team in the same iteration,
 *     from the same fields. ESPN lists each game twice — once under each team —
 *     and mapping them independently would let a payload where the two copies
 *     disagree produce a schedule where BUF plays KC but KC plays nobody.
 *     Emitting the pair here makes that asymmetry unrepresentable, and games
 *     are de-duplicated by `id` so the second listing is not a second pair.
 *
 *   - **A bye is a row.** `opponent_pro_team_id IS NULL` is an assertion that
 *     this team is off this week. The alternative — inferring a bye from a
 *     missing row — cannot be distinguished from a fetch that dropped half the
 *     league, which is precisely the failure a chip reading "BYE" must never
 *     invent.
 */

/** ESPN's free-agent pseudo-team. It has no games and is not a team. */
const FREE_AGENT_PRO_TEAM_ID = 0;

/**
 * The most weeks an NFL regular season has ever had, as a sanity bound.
 *
 * The week span is *derived* from the payload (see `deriveWeekSpan`) rather
 * than assumed, because it genuinely varies: 2020 ran to 17 scoring periods and
 * every season since has run to 18. This constant only catches a payload
 * claiming something absurd, which would otherwise mean thousands of fabricated
 * bye rows.
 */
const MAX_PLAUSIBLE_WEEK = 23;

/**
 * How many weeks this season has, from the games themselves.
 *
 * The highest scoring period anybody plays in is the season's length. That is
 * true by construction — a week nobody plays in is not a week — and it is what
 * makes the same mapper correct for 2020's 17 and 2026's 18 without a table of
 * seasons to look them up in.
 */
export function deriveWeekSpan(proTeams = []) {
  let max = 0;

  for (const team of proTeams) {
    if (team?.id === FREE_AGENT_PRO_TEAM_ID) continue;
    for (const week of Object.keys(team?.proGamesByScoringPeriod ?? {})) {
      const parsed = Number.parseInt(week, 10);
      if (Number.isFinite(parsed) && parsed > max) max = parsed;
    }
  }

  return Math.min(max, MAX_PLAUSIBLE_WEEK);
}

/** ESPN's unix-ms kickoff → an ISO string, or null when it has none. */
function toIsoTime(millis) {
  if (typeof millis !== 'number' || !Number.isFinite(millis)) return null;
  return new Date(millis).toISOString();
}

/** One game, from one team's side. */
function gameRow(game, seasonYear, week, proTeamId) {
  const isHome = game.homeProTeamId === proTeamId;

  return {
    season_year: seasonYear,
    week,
    pro_team_id: proTeamId,
    opponent_pro_team_id: isHome ? game.awayProTeamId : game.homeProTeamId,
    is_home: isHome,
    game_time: toIsoTime(game.date),
    espn_game_id: game.id ?? null,
    start_time_tbd: Boolean(game.startTimeTBD),
    stats_official: Boolean(game.statsOfficial)
  };
}

/** One team's week off. Every optional column is null, per the CHECK. */
function byeRow(seasonYear, week, proTeamId) {
  return {
    season_year: seasonYear,
    week,
    pro_team_id: proTeamId,
    opponent_pro_team_id: null,
    is_home: null,
    game_time: null,
    espn_game_id: null,
    start_time_tbd: false,
    stats_official: false
  };
}

/**
 * The whole season, as rows ready for `upsertNflSchedule`.
 *
 * @param {Array}  proTeams   raw `settings.proTeams` from the fetcher
 * @param {number} seasonYear the NFL season these belong to
 * @returns {{ rows: Array, warnings: Array<string>, weekSpan: number, teamCount: number }}
 */
export function mapProTeamSchedules(proTeams = [], seasonYear) {
  if (!seasonYear) throw new Error('A season year is required');

  const warnings = [];
  const teams = (proTeams ?? []).filter(
    (team) => team && team.id != null && team.id !== FREE_AGENT_PRO_TEAM_ID
  );

  if (teams.length === 0) {
    return { rows: [], warnings: ['ESPN returned no pro teams'], weekSpan: 0, teamCount: 0 };
  }

  if (teams.length !== 32) {
    warnings.push(`expected 32 pro teams, ESPN returned ${teams.length}`);
  }

  const weekSpan = deriveWeekSpan(teams);
  if (weekSpan === 0) {
    return {
      rows: [],
      warnings: [...warnings, `ESPN has published no games for ${seasonYear} yet`],
      weekSpan: 0,
      teamCount: teams.length
    };
  }

  // `(week, proTeamId)` → row. A map rather than an array because ESPN lists
  // every game twice, once under each team, and the second listing must land on
  // the same two rows the first one produced rather than beside them.
  const rows = new Map();
  const key = (week, proTeamId) => `${week}:${proTeamId}`;
  const played = new Set();

  for (const team of teams) {
    for (const [weekKey, games] of Object.entries(team.proGamesByScoringPeriod ?? {})) {
      const week = Number.parseInt(weekKey, 10);
      if (!Number.isFinite(week) || week < 1 || week > weekSpan) continue;

      for (const game of games ?? []) {
        if (game?.homeProTeamId == null || game?.awayProTeamId == null) {
          warnings.push(`week ${week}: game ${game?.id ?? '?'} has no team pair — skipped`);
          continue;
        }

        // Both sides, from this one object. See the note at the top.
        for (const side of [game.homeProTeamId, game.awayProTeamId]) {
          rows.set(key(week, side), gameRow(game, seasonYear, week, side));
          played.add(key(week, side));
        }
      }
    }
  }

  // Whatever is left is a bye — asserted, not inferred from the gap.
  for (const team of teams) {
    let byeWeeks = 0;

    for (let week = 1; week <= weekSpan; week += 1) {
      if (played.has(key(week, team.id))) continue;
      rows.set(key(week, team.id), byeRow(seasonYear, week, team.id));
      byeWeeks += 1;

      // ESPN states the bye separately from the schedule, so the two can be
      // compared. They have always agreed (checked across 2020-2026); a warning
      // rather than an error because the schedule is the stronger evidence and
      // a stale `byeWeek` field should not stop a season importing.
      if (team.byeWeek && team.byeWeek !== week) {
        warnings.push(
          `${team.abbrev ?? team.id}: no game in week ${week}, but ESPN says the bye is week ${team.byeWeek}`
        );
      }
    }

    if (byeWeeks !== 1) {
      warnings.push(`${team.abbrev ?? team.id}: ${byeWeeks} weeks without a game across 1-${weekSpan}`);
    }
  }

  return { rows: [...rows.values()], warnings, weekSpan, teamCount: teams.length };
}

export default mapProTeamSchedules;
