/**
 * The parlay data layer.
 *
 * What is worth asserting here is the *shape of the request*, because that is
 * what the database's guarantees hang off: a free-text pick has to reach the
 * RPC as an explicit `p_player_id: null` (not an omitted key, which would take
 * the function's default and read the same, but only by luck), and the reads
 * must not add a privacy filter of their own — RLS owns that, and a client-side
 * `.eq('user_id', …)` duplicating it is a second rule that can drift.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import {
  submitParlayPick,
  getMyParlayPick,
  getParlayPicksForWeek,
  getSeasonParlayPicks,
  getUngradedMatchedPicks,
  applyParlayGrades
} from '../parlay.js';
import { searchPlayers } from '../players.js';
import {
  listLeagueMembers,
  getParlayCommissioners,
  setParlayCommissioners
} from '../users.js';
import { getPlayerWeekStatsForWeek } from '../playerWeekStats.js';

const WEEK_ID = '11111111-1111-4111-8111-111111111111';
const SEASON_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PLAYER_ID = '44444444-4444-4444-8444-444444444444';

const session = { user: { id: USER_ID } };

const storedRow = {
  id: '55555555-5555-4555-8555-555555555555',
  pick_em_week_id: WEEK_ID,
  season_id: SEASON_ID,
  week: 3,
  user_id: USER_ID,
  player_id: PLAYER_ID,
  player_name_raw: 'Justin Jefferson',
  scored_td: null,
  submitted_at: '2026-09-08T12:00:00Z'
};

describe('submitParlayPick', () => {
  it('sends the player id and lets the RPC resolve the canonical name', async () => {
    const ctx = makeCtx({ 'rpc.submit_td_parlay_pick': () => storedRow }, { session });

    const result = await submitParlayPick(ctx, WEEK_ID, {
      playerId: PLAYER_ID,
      playerName: 'justin jefferson'
    });

    expect(ctx.client.calls).toContainEqual(
      expect.objectContaining({
        table: 'rpc',
        op: 'submit_td_parlay_pick',
        payload: {
          p_pick_em_week_id: WEEK_ID,
          p_player_id: PLAYER_ID,
          p_player_name: 'justin jefferson'
        }
      })
    );
    expect(result.playerNameRaw).toBe('Justin Jefferson');
    expect(result.scoredTd).toBeNull();
  });

  it('sends an explicit null player id for a free-text pick', async () => {
    const ctx = makeCtx(
      { 'rpc.submit_td_parlay_pick': () => ({ ...storedRow, player_id: null, player_name_raw: 'Some Rookie' }) },
      { session }
    );

    await submitParlayPick(ctx, WEEK_ID, { playerName: '  Some Rookie  ' });

    const [call] = ctx.client.callsFor('rpc', 'submit_td_parlay_pick');
    // Present and null, not absent: the argument is doing the work, not the
    // function's default.
    expect(Object.hasOwn(call.payload, 'p_player_id')).toBe(true);
    expect(call.payload.p_player_id).toBeNull();
    expect(call.payload.p_player_name).toBe('Some Rookie');
  });

  it('refuses a pick with neither an id nor a name, without a round trip', async () => {
    const ctx = makeCtx({}, { session });

    await expect(submitParlayPick(ctx, WEEK_ID, { playerName: '   ' })).rejects.toThrow();
    expect(ctx.client.calls).toHaveLength(0);
  });
});

describe('getMyParlayPick', () => {
  it('returns null for a signed-out viewer without querying', async () => {
    const ctx = makeCtx({});

    expect(await getMyParlayPick(ctx, WEEK_ID)).toBeNull();
    expect(ctx.client.calls).toHaveLength(0);
  });

  it('scopes to the week and the caller, and camelCases the row', async () => {
    const ctx = makeCtx({ 'td_parlay_picks.select': () => [storedRow] }, { session });

    const pick = await getMyParlayPick(ctx, WEEK_ID);

    const [call] = ctx.client.callsFor('td_parlay_picks', 'select');
    expect(call.filters).toEqual({ pick_em_week_id: WEEK_ID, user_id: USER_ID });
    expect(pick.playerNameRaw).toBe('Justin Jefferson');
    expect(pick.pickEmWeekId).toBe(WEEK_ID);
  });
});

describe('getParlayPicksForWeek', () => {
  it('filters on the week alone — RLS decides who is visible', async () => {
    const ctx = makeCtx({ 'td_parlay_picks.select': () => [storedRow] }, { session });

    await getParlayPicksForWeek(ctx, WEEK_ID);

    const [call] = ctx.client.callsFor('td_parlay_picks', 'select');
    expect(call.filters).toEqual({ pick_em_week_id: WEEK_ID });
  });

  it('returns [] when the deadline has hidden everything', async () => {
    const ctx = makeCtx({ 'td_parlay_picks.select': () => [] }, { session });

    expect(await getParlayPicksForWeek(ctx, WEEK_ID)).toEqual([]);
  });
});

describe('getSeasonParlayPicks', () => {
  it('reads the denormalized season_id rather than joining pick_em_weeks', async () => {
    const ctx = makeCtx({ 'td_parlay_picks.select': () => [storedRow] }, { session });

    await getSeasonParlayPicks(ctx, SEASON_ID);

    const [call] = ctx.client.callsFor('td_parlay_picks', 'select');
    expect(call.filters).toEqual({ season_id: SEASON_ID });
    expect(call.columns).not.toContain('pick_em_weeks');
  });
});

describe('searchPlayers', () => {
  it('short-circuits under two characters, with no network call', async () => {
    const ctx = makeCtx({});

    expect(await searchPlayers(ctx, 'j')).toEqual([]);
    expect(await searchPlayers(ctx, '  ')).toEqual([]);
    expect(await searchPlayers(ctx, '')).toEqual([]);
    expect(ctx.client.calls).toHaveLength(0);
  });

  it('wraps the term in wildcards and bounds the result', async () => {
    const ctx = makeCtx({
      'players.select': () => [
        { id: PLAYER_ID, name: 'Justin Jefferson', position: 'WR', percent_owned: 99.9 }
      ]
    });

    const results = await searchPlayers(ctx, ' jeff ', { limit: 5 });

    const [call] = ctx.client.callsFor('players', 'select');
    expect(call.filters['ilike:name']).toBe('%jeff%');
    expect(call.filters.is_active).toBe(true);
    expect(call.limit).toBe(5);
    expect(results[0].percentOwned).toBe(99.9);
  });

  it('escapes ILIKE wildcards so a name is not read as a pattern', async () => {
    const ctx = makeCtx({ 'players.select': () => [] });

    await searchPlayers(ctx, '100%_pure');

    const [call] = ctx.client.callsFor('players', 'select');
    expect(call.filters['ilike:name']).toBe('%100\\%\\_pure%');
  });
});

describe('getPlayerWeekStatsForWeek', () => {
  it('reads exactly one week, flat, with the player joined', async () => {
    const ctx = makeCtx({
      'player_week_stats.select': () => [
        {
          id: 'a',
          season_id: SEASON_ID,
          week: 4,
          team_id: 't1',
          player_id: PLAYER_ID,
          pro_team_id: 16,
          roster_slot: 'WR',
          started: true,
          projected_points: 14.2,
          actual_points: null,
          player: { id: PLAYER_ID, name: 'Justin Jefferson', position: 'WR' }
        }
      ]
    });

    const rows = await getPlayerWeekStatsForWeek(ctx, SEASON_ID, 4);

    const [call] = ctx.client.callsFor('player_week_stats', 'select');
    // `.eq('week', 4)` — not the calculator's exclusive `.lt`, which would
    // return weeks 1-3 and none of the week actually asked for.
    expect(call.filters).toEqual({ season_id: SEASON_ID, week: 4 });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0].projectedPoints).toBe(14.2);
    expect(rows[0].proTeamId).toBe(16);
    expect(rows[0].player.name).toBe('Justin Jefferson');
  });
});

describe('league roles', () => {
  const COMMISH_A = '66666666-6666-4666-8666-666666666666';
  const COMMISH_B = '77777777-7777-4777-8777-777777777777';

  it('maps the member list into the app\'s casing', async () => {
    const ctx = makeCtx({
      'rpc.list_league_members': () => [
        {
          id: USER_ID,
          display_name: 'Arya Shah',
          email: 'aryas1387@example.com',
          created_at: '2025-09-11T00:00:00Z'
        }
      ]
    });

    const members = await listLeagueMembers(ctx);

    expect(members).toEqual([
      {
        id: USER_ID,
        displayName: 'Arya Shah',
        email: 'aryas1387@example.com',
        createdAt: '2025-09-11T00:00:00Z'
      }
    ]);
  });

  it('grants and revokes only the difference', async () => {
    const ctx = makeCtx({
      'league_roles.select': () => [
        { id: 'role-a', user_id: COMMISH_A, role: 'parlay_commissioner' },
        { id: 'role-b', user_id: COMMISH_B, role: 'parlay_commissioner' }
      ],
      'league_roles.delete': () => [],
      'league_roles.insert': () => []
    });

    // Keep A, drop B, add USER_ID.
    const result = await setParlayCommissioners(ctx, [COMMISH_A, USER_ID]);

    const [remove] = ctx.client.callsFor('league_roles', 'delete');
    expect(remove.filters['in:id']).toEqual(['role-b']);

    const [add] = ctx.client.callsFor('league_roles', 'insert');
    // A is untouched: re-inserting an unchanged grant would rewrite its
    // created_at, losing the only record of when it was made.
    expect(add.payload).toEqual([{ user_id: USER_ID, role: 'parlay_commissioner' }]);

    expect(result).toEqual({ granted: 1, revoked: 1 });
  });

  it('writes nothing when the selection has not changed', async () => {
    const ctx = makeCtx({
      'league_roles.select': () => [
        { id: 'role-a', user_id: COMMISH_A, role: 'parlay_commissioner' }
      ]
    });

    const result = await setParlayCommissioners(ctx, [COMMISH_A]);

    expect(ctx.client.callsFor('league_roles', 'delete')).toHaveLength(0);
    expect(ctx.client.callsFor('league_roles', 'insert')).toHaveLength(0);
    expect(result).toEqual({ granted: 0, revoked: 0 });
  });

  it('revokes everyone when the list is emptied', async () => {
    const ctx = makeCtx({
      'league_roles.select': () => [
        { id: 'role-a', user_id: COMMISH_A, role: 'parlay_commissioner' }
      ],
      'league_roles.delete': () => []
    });

    const result = await setParlayCommissioners(ctx, []);

    expect(ctx.client.callsFor('league_roles', 'delete')[0].filters['in:id']).toEqual(['role-a']);
    expect(result).toEqual({ granted: 0, revoked: 1 });
  });

  it('reads only the parlay role, not every grant', async () => {
    const ctx = makeCtx({ 'league_roles.select': () => [] });

    await getParlayCommissioners(ctx);

    expect(ctx.client.callsFor('league_roles', 'select')[0].filters).toEqual({
      role: 'parlay_commissioner'
    });
  });
});

describe('getUngradedMatchedPicks', () => {
  it('asks only for ungraded, player-matched picks in elapsed weeks', async () => {
    const ctx = makeCtx({ 'td_parlay_picks.select': () => [storedRow] });

    await getUngradedMatchedPicks(ctx, SEASON_ID, 5);

    const [call] = ctx.client.callsFor('td_parlay_picks', 'select');
    expect(call.filters).toMatchObject({
      season_id: SEASON_ID,
      // Only NULL rows: this is what makes a re-run idempotent and a manual
      // grade permanent.
      'is:scored_td': null,
      'not:player_id:is': null,
      // Exclusive — grading the week in progress would grade Sunday's picks on
      // Sunday morning.
      'lt:week': 5
    });
  });

  it('carries the ESPN player id, which the board projection deliberately does not', async () => {
    const ctx = makeCtx({
      'td_parlay_picks.select': () => [
        { ...storedRow, player: { id: PLAYER_ID, espn_player_id: 3117251, pro_team_id: 2 } }
      ]
    });

    const [pick] = await getUngradedMatchedPicks(ctx, SEASON_ID, 5);

    expect(pick.player).toEqual({ id: PLAYER_ID, espnPlayerId: 3117251, proTeamId: 2 });
  });
});

describe('applyParlayGrades', () => {
  it('writes each grade, and only over a row that is still ungraded', async () => {
    const ctx = makeCtx({ 'td_parlay_picks.update': () => [{}] });

    const result = await applyParlayGrades(ctx, [
      { pickId: 'a', scoredTd: true },
      { pickId: 'b', scoredTd: false }
    ]);

    expect(result).toEqual({ updated: 2, errors: [] });

    const calls = ctx.client.callsFor('td_parlay_picks', 'update');
    expect(calls.map((call) => call.payload)).toEqual([
      { scored_td: true },
      { scored_td: false }
    ]);
    // The `is:scored_td` guard is what stops a second writer — another run, or
    // a human grading between the read and the write — from winning silently.
    expect(calls.every((call) => call.filters['is:scored_td'] === null)).toBe(true);
  });

  it('collects a failure rather than losing the rest of the batch', async () => {
    const ctx = makeCtx({
      'td_parlay_picks.update': (state) => {
        if (state.filters.id === 'b') throw new Error('nope');
        return [{}];
      }
    });

    const result = await applyParlayGrades(ctx, [
      { pickId: 'a', scoredTd: true },
      { pickId: 'b', scoredTd: true },
      { pickId: 'c', scoredTd: false }
    ]);

    expect(result.updated).toBe(2);
    expect(result.errors).toEqual([{ pickId: 'b', error: 'nope' }]);
  });

  it('writes nothing for an empty batch', async () => {
    const ctx = makeCtx({});

    await expect(applyParlayGrades(ctx, [])).resolves.toEqual({ updated: 0, errors: [] });
    expect(ctx.client.callsFor('td_parlay_picks')).toEqual([]);
  });
});
