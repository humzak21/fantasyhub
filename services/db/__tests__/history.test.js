/**
 * League history, shaped from the unified views.
 *
 * What is worth pinning down here is the translation: the components speak
 * `historical_teams`' vocabulary (`regular_season_wins`, `playoff_results`,
 * `award_name`) and the views speak the live schema's. Everything below is a
 * claim about that boundary, or about a bug the old manager had.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import {
  getSeasonsTimeline,
  getSeasonDetail,
  getMatchupHistory,
  getHeadToHeadMatrix,
  getFranchisesWithCareerStats
} from '../history.js';

const FRANCHISES = [
  { id: 'f-humza', owner_name: 'Humza Khalil', display_name: 'Humza Khalil', is_active: true },
  { id: 'f-rohit', owner_name: 'Rohit Ramki', display_name: 'Rohit Ramki', is_active: true }
];

const standing = (overrides) => ({
  team_id: 'team-1',
  season_id: 'season-2025',
  season_year: 2025,
  franchise_id: 'f-humza',
  team_name: 'Lightskin Empire',
  owner_name: 'Humza Khalil',
  games_played: 14,
  wins: 9,
  losses: 5,
  ties: 0,
  points_for: '1546.14',
  points_against: '1400.00',
  playoff_finish: null,
  final_rank: null,
  ...overrides
});

describe('getSeasonsTimeline', () => {
  it('shapes the podium the way the timeline renders it', async () => {
    const ctx = makeCtx({
      'seasons.select': () => [{ id: 'season-2025', year: 2025 }],
      'v_team_standings.select': () => [
        standing({ playoff_finish: 'champion', franchise_id: 'f-rohit', owner_name: 'Rohit Ramki', wins: 6, losses: 8 }),
        standing({ playoff_finish: '2nd' })
      ],
      'league_franchises.select': () => FRANCHISES
    });

    const [season] = await getSeasonsTimeline(ctx);

    expect(season.playoff_results.champion).toEqual({
      franchise_id: 'f-rohit',
      franchise: { id: 'f-rohit', owner_name: 'Rohit Ramki', display_name: 'Rohit Ramki' },
      team_name: 'Lightskin Empire',
      record: '6-8'
    });
    expect(season.playoff_results.runner_up.franchise.owner_name).toBe('Humza Khalil');
    // A season with no third-place game still has the key; the component
    // renders a dash rather than crashing on an absent one.
    expect(season.playoff_results.third_place).toBeNull();
  });

  // A season becomes history when it is finalized, not when it is created:
  // 2026 has fourteen teams, no games and no champion.
  it('asks only for completed seasons', async () => {
    const ctx = makeCtx({
      'seasons.select': () => [],
      'v_team_standings.select': () => [],
      'league_franchises.select': () => FRANCHISES
    });

    await getSeasonsTimeline(ctx);

    const read = ctx.client.callsFor('seasons', 'select')[0];
    expect(read.filters.is_completed).toBe(true);
  });
});

describe('getSeasonDetail', () => {
  it('translates standings into the columns the season table reads', async () => {
    const ctx = makeCtx({
      'v_team_standings.select': () => [standing({ playoff_finish: 'champion', final_rank: 1 })],
      'awards.select': () => [],
      'league_franchises.select': () => FRANCHISES
    });

    const { teams } = await getSeasonDetail(ctx, 'season-2025');

    expect(teams[0]).toMatchObject({
      id: 'team-1',
      team_name: 'Lightskin Empire',
      regular_season_wins: 9,
      regular_season_losses: 5,
      points_for: 1546.14,
      playoff_finish: 'champion',
      final_rank: 1
    });
    // Just the identity the masking helper needs, not the whole row.
    expect(teams[0].franchise).toEqual({
      id: 'f-humza',
      owner_name: 'Humza Khalil',
      display_name: 'Humza Khalil'
    });
  });

  it('resolves a ballot award by owner name, which is all it stores', async () => {
    const ctx = makeCtx({
      'v_team_standings.select': () => [],
      'awards.select': () => [
        {
          id: 'award-1',
          title: 'Punishee',
          category: 'non-voted',
          source: 'ballot',
          winner_id: 'Rohit Ramki',
          winner_franchise_id: null
        }
      ],
      'league_franchises.select': () => FRANCHISES
    });

    const { awards } = await getSeasonDetail(ctx, 'season-2025');

    expect(awards[0]).toMatchObject({
      award_name: 'Punishee',
      award_category: 'ballot',
      franchise_id: 'f-rohit'
    });
  });

  it('drops a ballot award nobody has won yet', async () => {
    const ctx = makeCtx({
      'v_team_standings.select': () => [],
      'awards.select': () => [
        { id: 'award-2', title: 'Best Trade', source: 'ballot', winner_id: null, winner_franchise_id: null }
      ],
      'league_franchises.select': () => FRANCHISES
    });

    const { awards } = await getSeasonDetail(ctx, 'season-2025');

    expect(awards).toEqual([]);
  });
});

describe('getMatchupHistory', () => {
  const ctx = () =>
    makeCtx({
      'teams.select': () => [
        { id: 'team-humza-2025', name: 'Lightskin Empire', season_id: 'season-2025', franchise_id: 'f-humza' },
        { id: 'team-rohit-2025', name: 'GrandPinto', season_id: 'season-2025', franchise_id: 'f-rohit' }
      ],
      // The view holds both directions of every game.
      'v_game_results.select': () => [
        {
          game_id: 'game-1',
          season_id: 'season-2025',
          week: 1,
          type: 'regular',
          is_playoff: false,
          team_id: 'team-humza-2025',
          opponent_id: 'team-rohit-2025',
          points_for: '120.36',
          points_against: '75.82',
          result: 'W'
        }
      ],
      'v_team_standings.select': () => [
        { team_id: 'team-humza-2025', wins: 9, losses: 5 },
        { team_id: 'team-rohit-2025', wins: 6, losses: 8 }
      ],
      'seasons.select': () => [{ id: 'season-2025', year: 2025, name: '2025' }]
    });

  // The old version read `historical_games` *and* `games`, which since the
  // refactor hold the same rows, so every 2020-24 meeting appeared twice.
  it('returns one row per meeting, not one per side', async () => {
    const client = ctx();

    const games = await getMatchupHistory(client, 'f-humza', 'f-rohit');

    expect(games).toHaveLength(1);
    const read = client.client.callsFor('v_game_results', 'select')[0];
    expect(read.filters['in:team_id']).toEqual(['team-humza-2025']);
    expect(read.filters['in:opponent_id']).toEqual(['team-rohit-2025']);
  });

  it('orients every row so franchise 1 is always team 1', async () => {
    const games = await getMatchupHistory(ctx(), 'f-humza', 'f-rohit');

    expect(games[0]).toMatchObject({
      year: 2025,
      week: 1,
      team1Name: 'Lightskin Empire',
      team2Name: 'GrandPinto',
      team1Score: 120.36,
      team2Score: 75.82,
      team1FranchiseId: 'f-humza',
      team2FranchiseId: 'f-rohit',
      team1Record: '9-5',
      team2Record: '6-8',
      winnerId: 'team-humza-2025'
    });
  });

  it('returns nothing when one of the franchises never fielded a team', async () => {
    const client = makeCtx({
      'teams.select': () => [
        { id: 'team-humza-2025', name: 'Lightskin Empire', season_id: 'season-2025', franchise_id: 'f-humza' }
      ]
    });

    await expect(getMatchupHistory(client, 'f-humza', 'f-rohit')).resolves.toEqual([]);
  });
});

describe('getHeadToHeadMatrix', () => {
  it('reads each direction straight off the view, with no perspective to flip', async () => {
    const ctx = makeCtx({
      'v_head_to_head.select': () => [
        {
          franchise_id: 'f-humza',
          opponent_franchise_id: 'f-rohit',
          total_matchups: 7,
          wins: 4,
          losses: 3,
          total_points_for: '848.70',
          total_points_against: '775.40'
        }
      ],
      'league_franchises.select': () => FRANCHISES
    });

    const { matrix } = await getHeadToHeadMatrix(ctx);
    const humza = matrix.find((row) => row.franchiseId === 'f-humza');

    expect(humza.opponents['f-rohit']).toEqual({
      opponentName: 'Rohit Ramki',
      wins: 4,
      losses: 3,
      totalGames: 7,
      winPct: '57.1',
      pointsFor: 848.7,
      pointsAgainst: 775.4
    });
    // A franchise with no rows still gets a cell, so the grid stays square.
    expect(matrix.find((row) => row.franchiseId === 'f-rohit').opponents).toEqual({});
  });
});

describe('getFranchisesWithCareerStats', () => {
  // `league_franchises.total_seasons` is a denormalised column last written in
  // November 2025. The view counts the seasons that actually exist.
  it('takes the season count from the view, not the stale column', async () => {
    const ctx = makeCtx({
      'league_franchises.select': () => [{ ...FRANCHISES[0], total_seasons: 5 }],
      'v_franchise_career.select': () => [
        {
          franchise_id: 'f-humza',
          seasons_played: 6,
          total_wins: '42',
          total_losses: '41',
          championships: 1,
          career_win_percentage: '0.5060'
        }
      ]
    });

    const [franchise] = await getFranchisesWithCareerStats(ctx);

    expect(franchise.total_seasons).toBe(6);
    expect(franchise.seasons_played).toBe(6);
    // One row serves both the franchise prop and the career-stats prop.
    expect(franchise.id).toBe('f-humza');
    expect(franchise.franchise_id).toBe('f-humza');
    expect(franchise.total_wins).toBe(42);
    expect(franchise.championships).toBe(1);
  });
});
