/**
 * The wiring around the ESPN game planner: one read, one batched insert, one
 * update per changed row — and the right conflict target.
 *
 * The mapping decisions are covered in `services/__tests__/espnGameMapper.test.js`.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { upsertEspnGames } from '../games.js';

const SEASON_ID = 'season-2026';

const TEAMS = [
  { id: 'team-humza', owner: 'Humza Khalil', espn_team_id: 1 },
  { id: 'team-rohit', owner: 'Rohit Ramki', espn_team_id: 9 }
];

const MATCHUP = {
  matchupId: 101,
  week: 3,
  scoringPeriodId: 3,
  homeTeam: { teamId: 1, ownerName: 'Humza Khalil', score: 120.5 },
  awayTeam: { teamId: 9, ownerName: 'Rohit Ramki', score: 98.2 },
  espnWinner: 'HOME',
  playoffTierType: 'NONE'
};

const handlers = (overrides = {}) => ({
  'teams.select': () => TEAMS,
  'games.select': () => [],
  'games.upsert': ({ payload }) => payload,
  'games.update': ({ payload }) => payload,
  ...overrides
});

describe('upsertEspnGames', () => {
  it('reads once and writes the new rows in a single batch', async () => {
    const ctx = makeCtx(handlers());

    const result = await upsertEspnGames(ctx, SEASON_ID, [MATCHUP, { ...MATCHUP, matchupId: 102 }]);

    expect(result).toMatchObject({ inserted: 2, updated: 0, unchanged: 0 });
    expect(ctx.client.callsFor('games', 'select')).toHaveLength(1);
    expect(ctx.client.callsFor('games', 'upsert')).toHaveLength(1);
    expect(ctx.client.callsFor('games', 'upsert')[0].payload).toHaveLength(2);
  });

  it('conflicts on the ESPN matchup id, not the team pair', async () => {
    // Byes have a null team2_id and Postgres treats nulls as distinct, so
    // (season, week, team1, team2) cannot keep a bye from being written twice.
    const ctx = makeCtx(handlers());

    await upsertEspnGames(ctx, SEASON_ID, [MATCHUP]);

    expect(ctx.client.callsFor('games', 'upsert')[0].options).toEqual({
      onConflict: 'season_id,espn_matchup_id',
      ignoreDuplicates: false
    });
  });

  it('updates existing rows by id and writes no insert', async () => {
    const ctx = makeCtx(
      handlers({
        'games.select': () => [
          {
            id: 'game-1',
            week: 3,
            team1_id: 'team-humza',
            team2_id: 'team-rohit',
            team1_score: null,
            team2_score: null,
            type: 'regular',
            espn_matchup_id: null,
            espn_scoring_period_id: null
          }
        ]
      })
    );

    const result = await upsertEspnGames(ctx, SEASON_ID, [MATCHUP]);

    expect(result).toMatchObject({ inserted: 0, updated: 1 });
    expect(ctx.client.callsFor('games', 'upsert')).toHaveLength(0);

    const update = ctx.client.callsFor('games', 'update')[0];
    expect(update.filters.id).toBe('game-1');
    expect(update.payload).toMatchObject({
      team1_score: 120.5,
      team2_score: 98.2,
      espn_matchup_id: 101
    });
  });

  it('scopes the read to one week when asked', async () => {
    const ctx = makeCtx(handlers());

    await upsertEspnGames(ctx, SEASON_ID, [MATCHUP], { week: 3 });

    expect(ctx.client.callsFor('games', 'select')[0].filters).toEqual({
      season_id: SEASON_ID,
      week: 3
    });
  });

  it('uses the teams it is given rather than re-reading them', async () => {
    const ctx = makeCtx(handlers());

    await upsertEspnGames(ctx, SEASON_ID, [MATCHUP], { teams: TEAMS });

    expect(ctx.client.callsFor('teams')).toHaveLength(0);
  });

  it('plans but writes nothing on a dry run', async () => {
    const ctx = makeCtx(handlers());

    const result = await upsertEspnGames(ctx, SEASON_ID, [MATCHUP], { dryRun: true });

    // Counting the planned writes as zero would make an import that is about to
    // create 120 rows look exactly like a no-op.
    expect(result).toMatchObject({ inserted: 1, updated: 0, dryRun: true });
    expect(ctx.client.callsFor('games', 'upsert')).toHaveLength(0);
    expect(ctx.client.callsFor('games', 'update')).toHaveLength(0);
  });

  it('reports unresolvable matchups without failing the batch', async () => {
    const ctx = makeCtx(handlers());

    const result = await upsertEspnGames(ctx, SEASON_ID, [
      MATCHUP,
      { ...MATCHUP, matchupId: 102, awayTeam: { teamId: 77, ownerName: 'Ghost', score: 0 } }
    ]);

    expect(result.inserted).toBe(1);
    expect(result.unmatched).toHaveLength(1);
  });

  it('surfaces a write failure instead of returning a count', async () => {
    const ctx = makeCtx(
      handlers({
        'games.upsert': () => {
          throw new Error('permission denied for table games');
        }
      })
    );

    await expect(upsertEspnGames(ctx, SEASON_ID, [MATCHUP])).rejects.toThrow(/permission denied/);
  });
});
