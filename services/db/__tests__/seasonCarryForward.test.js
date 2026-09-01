/**
 * Creating a season carries the previous season's teams forward.
 *
 * The league is the same fourteen owners every year; re-importing them by hand
 * was the step this replaces. What matters here is *what* crosses the boundary:
 * identity yes, last year's record no.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { createSeason, getPreviousSeason } from '../seasons.js';

const SOURCE_SEASON = {
  id: 'season-2025',
  year: 2025,
  name: '2025 Season',
  timezone: 'America/New_York',
  espn_league_id: '67674700',
  pickem_open_offset_days: 0,
  pickem_open_time: '04:00:00',
  pickem_close_offset_days: 2,
  pickem_close_time: '20:00:00',
  pickem_reveal_offset_days: 7,
  pickem_reveal_time: '12:00:00'
};

const SOURCE_TEAMS = [
  {
    name: 'Lightskin Empire',
    owner: 'Humza Khalil',
    espn_team_id: 1,
    franchise_id: 'franchise-humza',
    division_id: 3
  },
  {
    name: 'GrandPinto',
    owner: 'Rohit Ramki',
    espn_team_id: 9,
    franchise_id: 'franchise-rohit',
    division_id: 4
  }
];

/** Handlers for the happy path; individual tests override what they care about. */
function defaultHandlers(overrides = {}) {
  return {
    'seasons.insert': () => ({ id: 'season-2026', year: 2026, name: '2026 Season' }),
    'weeks.insert': () => [],
    'seasons.select': ({ filters }) =>
      // `lt:year` is the previous-season lookup; `id` is an explicit source.
      filters.id ? SOURCE_SEASON : [SOURCE_SEASON],
    'divisions.select': () => [
      { id: 3, name: 'Assholes', display_order: 1, division_identity_id: 'identity-1' },
      { id: 4, name: 'Ninjas', display_order: 2, division_identity_id: 'identity-2' }
    ],
    'divisions.upsert': () => [
      { id: 41, display_order: 1 },
      { id: 42, display_order: 2 }
    ],
    'divisions.delete': () => [],
    'teams.select': () => SOURCE_TEAMS,
    'teams.insert': ({ payload }) => payload.map((row, index) => ({ id: `team-${index}`, ...row })),
    ...overrides
  };
}

const insertedTeams = (ctx) =>
  ctx.client.calls.find((call) => call.table === 'teams' && call.op === 'insert')?.payload;

const insertedSeason = (ctx) =>
  ctx.client.calls.find((call) => call.table === 'seasons' && call.op === 'insert')?.payload;

describe('createSeason carrying teams forward', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeCtx(defaultHandlers());
  });

  it('copies the previous season\'s teams when no source is named', async () => {
    const season = await createSeason(ctx, 2026);

    expect(season.teamsCopiedFrom).toEqual({
      id: SOURCE_SEASON.id,
      year: 2025,
      name: '2025 Season'
    });
    expect(season.teams).toHaveLength(2);
    expect(season.teams.map((team) => team.owner)).toEqual(['Humza Khalil', 'Rohit Ramki']);
    expect(season.teamCopyError).toBeNull();
  });

  it('carries identity but not last season\'s record', async () => {
    await createSeason(ctx, 2026);

    expect(insertedTeams(ctx)[0]).toEqual({
      season_id: 'season-2026',
      name: 'Lightskin Empire',
      owner: 'Humza Khalil',
      espn_team_id: 1,
      franchise_id: 'franchise-humza',
      division_id: 41
    });
  });

  it('recreates the divisions and points each team at its new row', async () => {
    await createSeason(ctx, 2026);

    const divisionWrite = ctx.client.calls.find(
      (call) => call.table === 'divisions' && call.op === 'upsert'
    );
    expect(divisionWrite.payload).toEqual([
      {
        season_id: 'season-2026',
        name: 'Assholes',
        display_order: 1,
        division_identity_id: 'identity-1'
      },
      {
        season_id: 'season-2026',
        name: 'Ninjas',
        display_order: 2,
        division_identity_id: 'identity-2'
      }
    ]);

    // `trigger_create_default_divisions` has already seeded 'Division 1' and
    // 'Division 2' on the new season, and (season_id, display_order) is unique:
    // this has to rename those rows, not insert alongside them.
    expect(divisionWrite.options).toEqual({ onConflict: 'season_id,display_order' });

    // 3 → 41 and 4 → 42: the same divisions, not last season's rows.
    expect(insertedTeams(ctx).map((team) => team.division_id)).toEqual([41, 42]);
  });

  it('carries the division lineage across, so a rename does not orphan it', async () => {
    await createSeason(ctx, 2026);

    const divisionWrite = ctx.client.calls.find(
      (call) => call.table === 'divisions' && call.op === 'upsert'
    );

    // `league_divisions` is what makes 2026's 'Assholes' and 2020's 'East' the
    // same division. The upsert has to thread it through, or every new season
    // starts a fresh lineage and the continuity is lost for good.
    expect(divisionWrite.payload.map((row) => row.division_identity_id)).toEqual([
      'identity-1',
      'identity-2'
    ]);
  });

  it('prunes placeholder divisions the source season has no counterpart for', async () => {
    ctx = makeCtx(
      defaultHandlers({
        'divisions.select': () => [
          { id: 3, name: 'Assholes', display_order: 1, division_identity_id: 'identity-1' }
        ],
        'divisions.upsert': () => [{ id: 41, display_order: 1 }]
      })
    );

    await createSeason(ctx, 2026);

    const prune = ctx.client.calls.find(
      (call) => call.table === 'divisions' && call.op === 'delete'
    );
    expect(prune.filters.season_id).toBe('season-2026');
    expect(prune.filters['not:display_order:in']).toBe('(1)');
  });

  it('leaves a team unassigned when its division has no counterpart', async () => {
    ctx = makeCtx(defaultHandlers({ 'divisions.select': () => [] }));

    await createSeason(ctx, 2026);

    expect(insertedTeams(ctx).map((team) => team.division_id)).toEqual([null, null]);
  });

  it('creates an empty season when the copy is explicitly declined', async () => {
    const season = await createSeason(ctx, 2026, '', 14, 14, 3, { copyTeamsFromSeasonId: null });

    expect(season.teams).toEqual([]);
    expect(season.teamsCopiedFrom).toBeNull();
    expect(ctx.client.calls.some((call) => call.table === 'teams')).toBe(false);
    expect(ctx.client.calls.some((call) => call.table === 'divisions')).toBe(false);
  });

  it('copies from a named season instead of the previous one', async () => {
    await createSeason(ctx, 2026, '', 14, 14, 3, { copyTeamsFromSeasonId: 'season-2023' });

    const sourceRead = ctx.client.calls.find(
      (call) => call.table === 'teams' && call.op === 'select'
    );
    expect(sourceRead.filters.season_id).toBe(SOURCE_SEASON.id);
    expect(
      ctx.client.calls.find((call) => call.table === 'seasons' && call.op === 'select').filters.id
    ).toBe('season-2023');
  });

  it('creates the league\'s first season with no teams and no error', async () => {
    ctx = makeCtx(defaultHandlers({ 'seasons.select': () => [] }));

    const season = await createSeason(ctx, 2026);

    expect(season.teams).toEqual([]);
    expect(season.teamsCopiedFrom).toBeNull();
    expect(season.teamCopyError).toBeNull();
  });

  it('keeps the season when the copy fails, and reports why', async () => {
    ctx = makeCtx(
      defaultHandlers({
        'teams.insert': () => {
          throw new Error('permission denied for table teams');
        }
      })
    );

    const season = await createSeason(ctx, 2026);

    // `seasons.year` is unique: a thrown error here would leave a season the
    // admin can neither use nor recreate.
    expect(season.id).toBe('season-2026');
    expect(season.teams).toEqual([]);
    expect(season.teamCopyError).toMatch(/permission denied/);
  });

  it('still fails loudly when the season row itself cannot be written', async () => {
    ctx = makeCtx(
      defaultHandlers({
        'seasons.insert': () => {
          throw new Error('duplicate key value violates unique constraint "seasons_year_key"');
        }
      })
    );

    await expect(createSeason(ctx, 2026)).rejects.toThrow(/duplicate key/);
  });
});

describe('createSeason carrying configuration forward', () => {
  let ctx;

  beforeEach(() => {
    ctx = makeCtx(defaultHandlers());
  });

  it('inherits the ESPN league, time zone and pick\'em windows', async () => {
    await createSeason(ctx, 2026);

    expect(insertedSeason(ctx)).toMatchObject({
      timezone: 'America/New_York',
      espn_league_id: '67674700',
      pickem_open_offset_days: 0,
      pickem_open_time: '04:00:00',
      pickem_close_offset_days: 2,
      pickem_close_time: '20:00:00',
      pickem_reveal_offset_days: 7,
      pickem_reveal_time: '12:00:00'
    });
  });

  it('numbers the ESPN season by year, with or without a source', async () => {
    await createSeason(ctx, 2026, '', 14, 14, 3, { copyTeamsFromSeasonId: null });

    expect(insertedSeason(ctx).espn_season_year).toBe(2026);
  });

  // Last season's Tuesday is not this season's, and releasing the awards is an
  // act rather than a setting: neither is safe to inherit.
  it('never inherits the start date or the awards release', async () => {
    await createSeason(ctx, 2026);

    expect(insertedSeason(ctx)).not.toHaveProperty('start_date');
    expect(insertedSeason(ctx)).not.toHaveProperty('awards_release_at');
  });

  it('writes the start date it was given', async () => {
    await createSeason(ctx, 2026, '', 14, 14, 3, { startDate: '2026-09-08' });

    expect(insertedSeason(ctx).start_date).toBe('2026-09-08');
  });
});

describe('getPreviousSeason', () => {
  it('returns the most recent season before the given year', async () => {
    const ctx = makeCtx(defaultHandlers());

    await expect(getPreviousSeason(ctx, 2026)).resolves.toEqual(SOURCE_SEASON);
  });

  it('returns null when there is none', async () => {
    const ctx = makeCtx(defaultHandlers({ 'seasons.select': () => [] }));

    await expect(getPreviousSeason(ctx, 2020)).resolves.toBeNull();
  });
});
