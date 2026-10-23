/**
 * The league chat's fact cards (`league_facts`) and the small record beside
 * them (`league_facts_meta`): which generation is current, the names a
 * question can use, and this week's pairings.
 *
 * Written only by `scripts/build-league-facts.js` (service role); read only by
 * the `league-chat` edge function. Members never read the table directly —
 * the cards carry every owner's name, and the function decides who may ask.
 */

import { unwrap, throwDbError } from './errors.js';
import { selectAll } from './paging.js';
import { toSeasonConfig, deriveCurrentWeek } from '../../utils/seasonConfig.js';

const BATCH = 500;

/**
 * Everything `buildLeagueFacts` reads: seasons, every team, every scored game
 * (one row per team per game, paged past 1,000) and this week's pairings.
 */
export async function getLeagueFactSources(ctx, { now = new Date() } = {}) {
  const [seasonRows, activeRow, teamRows, results] = await Promise.all([
    ctx.client.from('seasons').select('id, year, is_completed')
      .then((result) => unwrap(result, 'Get seasons for league facts') ?? []),
    ctx.client.from('v_active_season').select('id, year, start_date, timezone, week_count').maybeSingle()
      .then((result) => unwrap(result, 'Get active season for league facts', { allowMissing: true })),
    selectAll(() => ctx.client
      .from('teams')
      .select('id, season_id, franchise_id, owner, made_playoffs, playoff_finish, final_rank')
      .order('id')).catch((error) => throwDbError(error, 'Get teams for league facts')),
    selectAll(() => ctx.client
      .from('v_game_results')
      .select('game_id, season_id, week, type, is_playoff, is_consolation, team_id, opponent_id, points_for, points_against, result')
      .order('game_id')
      .order('team_id')).catch((error) => throwDbError(error, 'Get game results for league facts'))
  ]);

  const currentSeasonId = activeRow?.id ?? null;
  const currentWeek = activeRow ? deriveCurrentWeek(toSeasonConfig(activeRow), now) : null;
  const gameRows = currentSeasonId && currentWeek
    ? unwrap(
      await ctx.client.from('games').select('team1_id, team2_id')
        .eq('season_id', currentSeasonId).eq('week', currentWeek),
      'Get this week\'s games for league facts'
    ) ?? []
    : [];

  return {
    currentSeasonId,
    currentWeek,
    seasons: seasonRows.map((row) => ({ id: row.id, year: row.year, isCompleted: Boolean(row.is_completed) })),
    teams: teamRows.map((row) => ({
      id: row.id,
      seasonId: row.season_id,
      franchiseId: row.franchise_id,
      owner: row.owner ?? '',
      madePlayoffs: row.made_playoffs,
      playoffFinish: row.playoff_finish,
      finalRank: row.final_rank
    })),
    results: results.map((row) => ({
      seasonId: row.season_id,
      week: row.week,
      type: row.type,
      isPlayoff: row.is_playoff,
      isConsolation: row.is_consolation,
      teamId: row.team_id,
      opponentId: row.opponent_id,
      pointsFor: row.points_for == null ? null : Number(row.points_for),
      pointsAgainst: row.points_against == null ? null : Number(row.points_against),
      result: row.result
    })),
    pairings: gameRows.map((row) => ({ team1Id: row.team1_id, team2Id: row.team2_id }))
  };
}

/**
 * Store a full set of cards as a new generation, point the meta row at it,
 * then delete the older ones. A question in flight reads the generation the
 * meta row named when it started, so it never sees half a rebuild.
 *
 * @returns {Promise<{ generation: number, cards: number }>}
 */
export async function saveLeagueFacts(ctx, { cards, lexicon, thisWeek, currentYear, currentWeek, playedWeek }, { now = new Date() } = {}) {
  const generation = now.getTime();
  for (let i = 0; i < cards.length; i += BATCH) {
    unwrap(
      await ctx.client.from('league_facts').insert(cards.slice(i, i + BATCH).map((card) => ({
        generation,
        topic: card.topic,
        owners: card.owners,
        seasons: card.seasons,
        weeks: card.weeks,
        phase: card.phase,
        text: card.text,
        link: card.link
      }))),
      'Insert league facts'
    );
  }
  unwrap(
    await ctx.client.from('league_facts_meta').upsert({
      id: true,
      generation,
      lexicon,
      this_week: thisWeek,
      current_year: currentYear,
      current_week: currentWeek,
      played_week: playedWeek,
      card_count: cards.length,
      built_at: now.toISOString()
    }),
    'Point league facts at the new generation'
  );
  unwrap(
    await ctx.client.from('league_facts').delete().neq('generation', generation),
    'Delete old league facts'
  );
  return { generation, cards: cards.length };
}
