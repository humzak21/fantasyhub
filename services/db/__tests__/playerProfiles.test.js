/**
 * A player's page source: which view and tables it reads, with which filters,
 * and the shapes the pure half (`utils/playerProfile/`) builds on.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { getPlayerProfileSource, getPlayerCareers, getPlayerByEspnId } from '../playerProfiles.js';

const PLAYER = {
  id: 'p-gibbs',
  espn_player_id: 4429795,
  name: 'Jahmyr Gibbs',
  position: 'RB',
  team_abbreviation: 'DET',
  pro_team_id: 8,
  injury_status: 'ACTIVE',
  projected_points: '18.40',
  is_active: true
};

const line = (overrides) => ({
  id: 'l-1',
  season_id: 's-2026',
  year: 2026,
  week: 1,
  player_id: 'p-gibbs',
  espn_player_id: 4429795,
  team_id: 't-2026-a',
  franchise_id: 'f-humza',
  position: 'RB',
  roster_slot: 'RB',
  started: true,
  actual_points: '41.40',
  projected_points: 17.2,
  pro_team_id: 8,
  injury_status: 'ACTIVE',
  stat_breakdown: { 23: 20, 24: 99, 210: 1 },
  appeared: true,
  overall_rank: 1,
  overall_of: 120,
  position_rank: 1,
  position_of: 30,
  game_id: 'g-1',
  game_type: 'regular',
  team_score: '140.12',
  opponent_score: 101,
  opponent_team_id: 't-2026-b',
  opponent_franchise_id: 'f-rohit',
  result: 'W',
  is_bye: false,
  ...overrides
});

const FRANCHISES = [
  { id: 'f-humza', owner_name: 'Humza Khalil', display_name: 'Humza Khalil', is_active: true },
  { id: 'f-rohit', owner_name: 'Rohit Ramki', display_name: 'Rohit Ramki', is_active: true }
];

const SEASONS = [
  { id: 's-2026', year: 2026, espn_season_year: 2026, regular_season_weeks: 14, playoff_weeks: 3, total_weeks: 17, is_active: true, is_completed: false },
  { id: 's-2025', year: 2025, espn_season_year: null, regular_season_weeks: 14, playoff_weeks: 3, total_weeks: 17, is_active: false, is_completed: true }
];

function handlers(overrides = {}) {
  return {
    'players.select': () => [PLAYER],
    'v_player_week_lines.select': () => [
      line({ id: 'l-3', week: 2 }),
      line({ id: 'l-2', season_id: 's-2025', year: 2025, week: 9, team_id: 't-2025-a' })
    ],
    'seasons.select': (state) =>
      state.filters.is_active ? [{ id: 's-2026' }] : SEASONS.filter((s) => state.filters['in:id'].includes(s.id)),
    'teams.select': (state) => [
      { id: 't-2026-a', season_id: 's-2026', franchise_id: 'f-humza', name: 'Empire', owner: 'Humza Khalil' },
      { id: 't-2025-a', season_id: 's-2025', franchise_id: 'f-humza', name: 'Old Empire', owner: 'Humza Khalil' }
    ].filter((t) => state.filters['in:id'].includes(t.id)),
    'league_franchises.select': () => FRANCHISES,
    'rosters.select': () => [{
      team_id: 't-2026-c',
      roster_slot: 'BE',
      team: { id: 't-2026-c', season_id: 's-2026', franchise_id: 'f-rohit', name: 'Rams', owner: 'Rohit Ramki' }
    }],
    'transaction_events.select': () => [{
      id: 'e-1',
      season_id: 's-2026',
      type: 'TRADE_ACCEPT',
      scoring_period: 5,
      processed_at: '2026-10-07T10:00:00Z',
      bid_amount: null,
      franchise_id: 'f-humza',
      franchise_ids: ['f-humza', 'f-rohit'],
      espn_player_ids: [4429795, 1],
      player_from_franchise_ids: ['f-humza', 'f-rohit'],
      player_to_franchise_ids: ['f-rohit', 'f-humza'],
      season: { year: 2026 }
    }],
    ...overrides
  };
}

describe('getPlayerProfileSource', () => {
  it('returns null for a player who does not exist, and reads nothing dependent', async () => {
    const ctx = makeCtx(handlers({ 'players.select': () => [], 'v_player_week_lines.select': () => [] }));

    expect(await getPlayerProfileSource(ctx, 'nobody')).toBeNull();
    expect(ctx.client.callsFor('teams')).toHaveLength(0);
    expect(ctx.client.callsFor('transaction_events')).toHaveLength(0);
  });

  it('reads the lines from the view by player, oldest first, camelCased and numeric', async () => {
    const ctx = makeCtx(handlers());
    const source = await getPlayerProfileSource(ctx, 'p-gibbs');

    const [lineCall] = ctx.client.callsFor('v_player_week_lines');
    expect(lineCall.filters.player_id).toBe('p-gibbs');
    expect(lineCall.range).toEqual([0, 999]); // through selectAll

    expect(source.lines.map((l) => [l.year, l.week])).toEqual([[2025, 9], [2026, 2]]);
    const newest = source.lines[1];
    expect(newest).toMatchObject({
      seasonId: 's-2026',
      teamId: 't-2026-a',
      actualPoints: 41.4,
      teamScore: 140.12,
      opponentScore: 101,
      positionRank: 1,
      positionOf: 30,
      isBye: false,
      result: 'W'
    });
    expect(newest.statBreakdown).toEqual({ 23: 20, 24: 99, 210: 1 });
  });

  it('shapes the player, the teams, the franchises and the seasons', async () => {
    const source = await getPlayerProfileSource(makeCtx(handlers()), 'p-gibbs');

    expect(source.player).toEqual({
      id: 'p-gibbs',
      espnPlayerId: 4429795,
      name: 'Jahmyr Gibbs',
      position: 'RB',
      teamAbbreviation: 'DET',
      proTeamId: 8,
      injuryStatus: 'ACTIVE',
      projectedPoints: 18.4,
      isActive: true
    });
    // Every team in the lines, plus the one that has him now.
    expect(source.teams.map((t) => t.id).sort()).toEqual(['t-2025-a', 't-2026-a', 't-2026-c']);
    expect(source.teams.find((t) => t.id === 't-2026-c')).toEqual({
      id: 't-2026-c', seasonId: 's-2026', franchiseId: 'f-rohit', name: 'Rams', owner: 'Rohit Ramki'
    });
    expect(source.franchises).toEqual([
      { id: 'f-humza', owner_name: 'Humza Khalil', display_name: 'Humza Khalil' },
      { id: 'f-rohit', owner_name: 'Rohit Ramki', display_name: 'Rohit Ramki' }
    ]);
    expect(source.seasons).toEqual([
      { id: 's-2025', year: 2025, nflSeasonYear: 2025, regularSeasonWeeks: 14, playoffWeeks: 3, totalWeeks: 17, isActive: false, isCompleted: true },
      { id: 's-2026', year: 2026, nflSeasonYear: 2026, regularSeasonWeeks: 14, playoffWeeks: 3, totalWeeks: 17, isActive: true, isCompleted: false }
    ]);
  });

  it('finds his current roster row on an active-season team', async () => {
    const ctx = makeCtx(handlers());
    const source = await getPlayerProfileSource(ctx, 'p-gibbs');

    const [rosterCall] = ctx.client.callsFor('rosters');
    expect(rosterCall.filters).toMatchObject({ player_id: 'p-gibbs', 'team.season_id': 's-2026' });
    expect(source.current).toEqual({ teamId: 't-2026-c', rosterSlot: 'BE', seasonId: 's-2026' });
  });

  it('uses the context active season without reading it', async () => {
    const ctx = makeCtx(handlers({ 'rosters.select': () => [] }));
    ctx.activeSeasonId = 's-2026';
    const source = await getPlayerProfileSource(ctx, 'p-gibbs');

    expect(ctx.client.callsFor('seasons').some((c) => c.filters.is_active)).toBe(false);
    expect(source.current).toBeNull();
  });

  it('reads the events containing his ESPN id, with the season year joined', async () => {
    const ctx = makeCtx(handlers());
    const source = await getPlayerProfileSource(ctx, 'p-gibbs');

    const [eventCall] = ctx.client.callsFor('transaction_events');
    expect(eventCall.filters['contains:espn_player_ids']).toEqual([4429795]);
    expect(source.events).toEqual([{
      id: 'e-1',
      seasonId: 's-2026',
      year: 2026,
      type: 'TRADE_ACCEPT',
      week: 5,
      processedAt: '2026-10-07T10:00:00Z',
      bidAmount: null,
      franchiseId: 'f-humza',
      franchiseIds: ['f-humza', 'f-rohit'],
      espnPlayerIds: [4429795, 1],
      playerFromFranchiseIds: ['f-humza', 'f-rohit'],
      playerToFranchiseIds: ['f-rohit', 'f-humza']
    }]);
  });

  it('skips the events read for a player with no ESPN id', async () => {
    const ctx = makeCtx(handlers({
      'players.select': () => [{ ...PLAYER, espn_player_id: null }],
      'v_player_week_lines.select': () => []
    }));
    const source = await getPlayerProfileSource(ctx, 'p-gibbs');

    expect(ctx.client.callsFor('transaction_events')).toHaveLength(0);
    expect(source.events).toEqual([]);
    expect(source.lines).toEqual([]);
    // No lines: only the team that has him now, and only the active season.
    expect(source.teams.map((t) => t.id)).toEqual(['t-2026-c']);
    expect(source.seasons.map((s) => s.id)).toEqual(['s-2026']);
  });

  it('throws a DbError rather than returning an empty page', async () => {
    const ctx = makeCtx(handlers({ 'v_player_week_lines.select': () => { throw new Error('boom'); } }));
    await expect(getPlayerProfileSource(ctx, 'p-gibbs')).rejects.toMatchObject({ name: 'DbError' });
  });
});

describe('getPlayerCareers', () => {
  it('pages the careers view and camelCases with numbers', async () => {
    const ctx = makeCtx({
      'v_player_careers.select': () => [{
        player_id: 'p-gibbs', espn_player_id: 4429795, name: 'Jahmyr Gibbs', position: 'RB',
        weeks_rostered: 30, weeks_started: 28, games_played: 29, started_games: 27,
        total_points: '612.40', points_per_game: '21.1172', points_stddev: '7.5',
        best_points: '41.40', worst_points: '3.10', started_points: '590', bench_points: '22.4',
        seasons_played: 2, first_year: 2025, last_year: 2026, franchises: 1, last_team_id: 't-2026-c'
      }]
    });

    const [row] = await getPlayerCareers(ctx);
    expect(ctx.client.callsFor('v_player_careers')[0].range).toEqual([0, 999]);
    expect(row).toMatchObject({
      playerId: 'p-gibbs',
      gamesPlayed: 29,
      totalPoints: 612.4,
      pointsPerGame: 21.1172,
      pointsStddev: 7.5,
      bestPoints: 41.4,
      lastTeamId: 't-2026-c'
    });
  });
});

describe('getPlayerByEspnId', () => {
  it('finds a player by ESPN id', async () => {
    const ctx = makeCtx({ 'players.select': () => [PLAYER] });
    expect(await getPlayerByEspnId(ctx, 4429795)).toEqual({
      id: 'p-gibbs', espnPlayerId: 4429795, name: 'Jahmyr Gibbs', position: 'RB', teamAbbreviation: 'DET', proTeamId: 8
    });
    expect(ctx.client.callsFor('players')[0].filters.espn_player_id).toBe(4429795);
  });

  it('is null for an unknown id, and reads nothing without one', async () => {
    const ctx = makeCtx({ 'players.select': () => [] });
    expect(await getPlayerByEspnId(ctx, 1)).toBeNull();
    expect(await getPlayerByEspnId(ctx, null)).toBeNull();
    expect(ctx.client.callsFor('players')).toHaveLength(1);
  });
});
