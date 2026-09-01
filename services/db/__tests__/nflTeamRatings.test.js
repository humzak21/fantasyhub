/**
 * The FPI snapshot's reader and writer.
 *
 * The two behaviours worth pinning: the conflict target, which is what makes a
 * re-run rewrite a week instead of doubling it, and "latest" meaning only the
 * max-week rows — the reader must never blend two snapshots, because a stale
 * row for one team would rate it with last week's FPI while the league moved.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { getLatestNflTeamRatings, upsertNflTeamRatings } from '../nflTeamRatings.js';
import { DbError } from '../errors.js';

const ratingRow = (week, proTeamId, fpi) => ({
  season_year: 2026,
  week,
  pro_team_id: proTeamId,
  fpi,
  epa_offense: 1.2,
  epa_defense: -0.4,
  epa_special_teams: 0.1,
  fpi_rank: 5,
  sos_remaining_rank: 12,
  projected_wins: 10.5,
  projected_losses: 6.5,
  playoff_probability: 71.2,
  fetched_at: '2026-09-01T12:00:00.000Z'
});

describe('upsertNflTeamRatings', () => {
  it('upserts on (season_year, week, pro_team_id)', async () => {
    const ctx = makeCtx({ 'nfl_team_ratings.upsert': () => null });

    await upsertNflTeamRatings(ctx, 2026, 1, [ratingRow(1, 2, 4.1)]);

    const [call] = ctx.client.callsFor('nfl_team_ratings', 'upsert');
    expect(call.options).toEqual({
      onConflict: 'season_year,week,pro_team_id',
      ignoreDuplicates: false
    });
  });

  it('stamps fetched_at and updated_at without mutating the mapper’s rows', async () => {
    const ctx = makeCtx({ 'nfl_team_ratings.upsert': () => null });
    const input = ratingRow(1, 2, 4.1);
    const original = { ...input };

    await upsertNflTeamRatings(ctx, 2026, 1, [input]);

    const [call] = ctx.client.callsFor('nfl_team_ratings', 'upsert');
    expect(call.payload[0].updated_at).toEqual(expect.any(String));
    expect(input).toEqual(original);
  });

  it('writes nothing for an empty plan', async () => {
    const ctx = makeCtx({});

    const result = await upsertNflTeamRatings(ctx, 2026, 1, []);

    expect(result).toEqual({ upserted: 0, seasonYear: 2026, week: 1 });
    expect(ctx.client.callsFor('nfl_team_ratings')).toHaveLength(0);
  });

  it('requires a season year and a week', async () => {
    const ctx = makeCtx({});

    await expect(upsertNflTeamRatings(ctx, null, 1, [ratingRow(1, 2, 4.1)]))
      .rejects.toThrow(/season year is required/);
    await expect(upsertNflTeamRatings(ctx, 2026, null, [ratingRow(1, 2, 4.1)]))
      .rejects.toThrow(/week is required/);
  });

  it('throws a DbError when the write fails', async () => {
    const ctx = makeCtx({
      'nfl_team_ratings.upsert': () => {
        throw new Error('permission denied');
      }
    });

    await expect(upsertNflTeamRatings(ctx, 2026, 1, [ratingRow(1, 2, 4.1)]))
      .rejects.toBeInstanceOf(DbError);
  });
});

describe('getLatestNflTeamRatings', () => {
  it('keeps only the max-week rows, keyed by proTeamId and camelCased', async () => {
    // Rows arrive week-descending, as the query orders them.
    const ctx = makeCtx({
      'nfl_team_ratings.select': () => [
        ratingRow(3, 2, 6.0),
        ratingRow(3, 12, 5.5),
        ratingRow(2, 2, 4.0),
        ratingRow(1, 2, 3.0)
      ]
    });

    const result = await getLatestNflTeamRatings(ctx, 2026);

    expect(result.week).toBe(3);
    expect(Object.keys(result.byProTeamId).sort()).toEqual(['12', '2']);
    expect(result.byProTeamId[2]).toMatchObject({
      proTeamId: 2,
      fpi: 6.0,
      fpiRank: 5,
      projectedWins: 10.5
    });
  });

  it('filters to the season year', async () => {
    const ctx = makeCtx({ 'nfl_team_ratings.select': () => [] });

    await getLatestNflTeamRatings(ctx, 2026);

    expect(ctx.client.callsFor('nfl_team_ratings', 'select')[0].filters).toEqual({
      season_year: 2026
    });
  });

  it('answers an unimported year with an empty map, not an error', async () => {
    const ctx = makeCtx({ 'nfl_team_ratings.select': () => [] });

    expect(await getLatestNflTeamRatings(ctx, 2026)).toEqual({
      week: null,
      byProTeamId: {}
    });
  });

  it('returns the empty answer without querying when no year is given', async () => {
    const ctx = makeCtx({});

    expect(await getLatestNflTeamRatings(ctx, null)).toEqual({ week: null, byProTeamId: {} });
    expect(ctx.client.callsFor('nfl_team_ratings')).toHaveLength(0);
  });

  it('never sends `*`', async () => {
    const ctx = makeCtx({ 'nfl_team_ratings.select': () => [] });

    await getLatestNflTeamRatings(ctx, 2026);

    expect(ctx.client.callsFor('nfl_team_ratings', 'select')[0].columns).not.toBe('*');
  });

  it('throws rather than returning empty when the read fails', async () => {
    const ctx = makeCtx({
      'nfl_team_ratings.select': () => {
        throw new Error('connection reset');
      }
    });

    // An outage that came back `{}` would silently drop the component with no
    // trace; the caller catches the throw and logs it instead.
    await expect(getLatestNflTeamRatings(ctx, 2026)).rejects.toBeInstanceOf(DbError);
  });
});
