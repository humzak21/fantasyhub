/**
 * The takes data layer.
 *
 * What is worth asserting here is the *shape of the request*, because the
 * database's guarantees hang off it. Two in particular:
 *
 *   * `removeFade` must filter on `user_id`. RLS narrows a member's delete to
 *     their own row, but the admin holds a `FOR ALL` policy — so without the
 *     filter, the admin taking back their own Hell Nah deletes everybody's.
 *   * `resolveTake` must move all three resolution columns together, or
 *     `takes_resolution_check` rejects the write.
 *
 * The rules themselves are tested by the database, not here; these tests only
 * prove the client asks the right question.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import {
  addFade,
  createTake,
  deleteTake,
  getTakesForSeason,
  removeFade,
  reopenTake,
  resolveTake,
  updateTake
} from '../takes.js';

const SEASON_ID = '11111111-1111-4111-8111-111111111111';
const TAKE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';

const session = { user: { id: USER_ID } };

const takeRow = {
  id: TAKE_ID,
  season_id: SEASON_ID,
  user_id: USER_ID,
  body: 'Nobody goes 14-0',
  target_type: 'week',
  target_week: 3,
  status: 'pending',
  resolved_at: null,
  resolved_by: null,
  edited_at: null,
  wager: null,
  created_at: '2026-09-01T12:00:00Z',
  updated_at: '2026-09-01T12:00:00Z',
  take_participants: [
    { id: 'p1', user_id: OTHER_ID, created_at: '2026-09-02T09:00:00Z' }
  ]
};

describe('getTakesForSeason', () => {
  it('embeds the fades and resolves every name in one pass', async () => {
    const ctx = makeCtx(
      {
        'takes.select': () => [takeRow],
        'rpc.get_user_display_names': () => [
          { id: USER_ID, display_name: 'Humza Khalil' },
          { id: OTHER_ID, display_name: 'Someone Else' }
        ]
      },
      { session }
    );

    const { takes, displayNames } = await getTakesForSeason(ctx, SEASON_ID);

    // Embedded, so the detail sheet is a cache read rather than a second query.
    expect(takes[0].takeParticipants).toHaveLength(1);
    expect(takes[0].takeParticipants[0].userId).toBe(OTHER_ID);

    // Authors *and* faders, deduped, in one RPC.
    const [call] = ctx.client.callsFor('rpc', 'get_user_display_names');
    expect(call.payload.user_ids.sort()).toEqual([USER_ID, OTHER_ID].sort());
    expect(displayNames[USER_ID]).toBe('Humza Khalil');
  });

  it('scopes the read to the season', async () => {
    const ctx = makeCtx(
      { 'takes.select': () => [], 'rpc.get_user_display_names': () => [] },
      { session }
    );

    await getTakesForSeason(ctx, SEASON_ID);

    const [call] = ctx.client.callsFor('takes', 'select');
    expect(call.filters.season_id).toBe(SEASON_ID);
  });

  it('raises rather than returning an empty board when the read fails', async () => {
    // An outage must not be indistinguishable from a league that has posted
    // nothing — that is the `return []` anti-pattern services/db exists to kill.
    const ctx = makeCtx({}, { session });
    await expect(getTakesForSeason(ctx, SEASON_ID)).rejects.toThrow();
  });
});

describe('createTake', () => {
  it('sends the milestone and never sends a user id', async () => {
    const ctx = makeCtx({ 'takes.insert': () => [takeRow] }, { session });

    await createTake(ctx, {
      seasonId: SEASON_ID,
      body: '  Nobody goes 14-0  ',
      targetType: 'week',
      targetWeek: 3
    });

    const [call] = ctx.client.callsFor('takes', 'insert');
    expect(call.payload).toEqual({
      season_id: SEASON_ID,
      body: 'Nobody goes 14-0',
      target_type: 'week',
      target_week: 3,
      // Optional, and "none" has one spelling. An empty string would be a
      // second way to say the same thing, and takes_wager_check refuses it.
      wager: null
    });
    // The column defaults to auth.uid() and set_takes_user_id backs that up, so
    // there is no value here for a client to get wrong or to forge.
    expect(Object.hasOwn(call.payload, 'user_id')).toBe(false);
  });

  it('sends an explicit null week for a terminal milestone', async () => {
    const ctx = makeCtx({ 'takes.insert': () => [takeRow] }, { session });

    await createTake(ctx, {
      seasonId: SEASON_ID,
      body: 'Somebody wins it from the 6 seed',
      targetType: 'end_of_season',
      targetWeek: 9
    });

    const [call] = ctx.client.callsFor('takes', 'insert');
    // A stray week on an end-of-season take violates takes_target_week_check;
    // dropping it here means the caller cannot pass one through by accident.
    expect(call.payload.target_week).toBeNull();
  });

  it('trims the stake, and stores a blank one as null', async () => {
    const ctx = makeCtx({ 'takes.insert': () => [takeRow] }, { session });

    await createTake(ctx, {
      seasonId: SEASON_ID,
      body: 'Nobody goes 14-0',
      targetType: 'week',
      targetWeek: 3,
      wager: '  40 FAAB  '
    });
    await createTake(ctx, {
      seasonId: SEASON_ID,
      body: 'Nobody goes 14-0',
      targetType: 'week',
      targetWeek: 3,
      wager: '   '
    });

    const [staked, blank] = ctx.client.callsFor('takes', 'insert');
    expect(staked.payload.wager).toBe('40 FAAB');
    expect(blank.payload.wager).toBeNull();
  });

  it('refuses an unknown milestone without a round trip', async () => {
    const ctx = makeCtx({}, { session });

    await expect(
      createTake(ctx, { seasonId: SEASON_ID, body: 'x', targetType: 'vibes' })
    ).rejects.toThrow(/milestone/i);
    expect(ctx.client.calls).toHaveLength(0);
  });

  it('refuses an empty take without a round trip', async () => {
    const ctx = makeCtx({}, { session });

    await expect(
      createTake(ctx, { seasonId: SEASON_ID, body: '   ', targetType: 'end_of_season' })
    ).rejects.toThrow();
    expect(ctx.client.calls).toHaveLength(0);
  });
});

describe('updateTake', () => {
  it('sends the body and the wager, and nothing else', async () => {
    const ctx = makeCtx({ 'takes.update': () => [takeRow] }, { session });

    await updateTake(ctx, { takeId: TAKE_ID, body: '  Reworded  ', wager: '  $20  ' });

    const [call] = ctx.client.callsFor('takes', 'update');
    // takes_guard_author_update rejects an UPDATE touching anything else, so
    // sending more here would fail at the database rather than silently apply.
    expect(call.payload).toEqual({ body: 'Reworded', wager: '$20' });
    expect(call.filters.id).toBe(TAKE_ID);
  });

  it('clears the stake when the author empties the box', async () => {
    const ctx = makeCtx({ 'takes.update': () => [takeRow] }, { session });

    // Not "leave it alone": the composer seeds the field from the row, so an
    // absent value is the author having removed the bet. Skipping the column
    // would make that impossible to express.
    await updateTake(ctx, { takeId: TAKE_ID, body: 'Reworded' });

    const [call] = ctx.client.callsFor('takes', 'update');
    expect(call.payload).toEqual({ body: 'Reworded', wager: null });
  });
});

describe('deleteTake', () => {
  it('deletes by id and lets RLS decide whether it may', async () => {
    const ctx = makeCtx({ 'takes.delete': () => [] }, { session });

    await deleteTake(ctx, TAKE_ID);

    const [call] = ctx.client.callsFor('takes', 'delete');
    expect(call.filters).toEqual({ id: TAKE_ID });
  });
});

describe('addFade', () => {
  it('sends the denormalized season, which the INSERT policy checks', async () => {
    const ctx = makeCtx(
      { 'take_participants.insert': () => [{ id: 'p2', take_id: TAKE_ID, user_id: USER_ID }] },
      { session }
    );

    await addFade(ctx, { takeId: TAKE_ID, seasonId: SEASON_ID });

    const [call] = ctx.client.callsFor('take_participants', 'insert');
    expect(call.payload).toEqual({ take_id: TAKE_ID, season_id: SEASON_ID });
    expect(Object.hasOwn(call.payload, 'user_id')).toBe(false);
  });
});

describe('removeFade', () => {
  it('filters on the caller as well as the take', async () => {
    const ctx = makeCtx({ 'take_participants.delete': () => [] }, { session });

    await removeFade(ctx, TAKE_ID);

    const [call] = ctx.client.callsFor('take_participants', 'delete');
    // Not redundant with RLS. The admin's `FOR ALL` policy matches every row on
    // the take, so without this filter their own withdrawal would delete
    // everybody else's Hell Nah too.
    expect(call.filters).toEqual({ take_id: TAKE_ID, user_id: USER_ID });
  });

  it('refuses a signed-out caller without a round trip', async () => {
    const ctx = makeCtx({});
    await expect(removeFade(ctx, TAKE_ID)).rejects.toThrow();
    expect(ctx.client.callsFor('take_participants', 'delete')).toHaveLength(0);
  });
});

describe('resolveTake', () => {
  it('moves status, resolved_at and resolved_by together', async () => {
    const ctx = makeCtx(
      { 'takes.update': () => [{ ...takeRow, status: 'correct' }] },
      { session }
    );

    await resolveTake(ctx, { takeId: TAKE_ID, status: 'correct' });

    const [call] = ctx.client.callsFor('takes', 'update');
    expect(call.payload.status).toBe('correct');
    // takes_resolution_check ties `status <> pending` to a non-null
    // resolved_at, so a partial write is rejected outright.
    expect(call.payload.resolved_at).toEqual(expect.any(String));
    expect(call.payload.resolved_by).toBe(USER_ID);
  });

  it('refuses a status the CHECK does not allow, without a round trip', async () => {
    const ctx = makeCtx({}, { session });

    await expect(resolveTake(ctx, { takeId: TAKE_ID, status: 'pending' })).rejects.toThrow();
    await expect(resolveTake(ctx, { takeId: TAKE_ID, status: 'maybe' })).rejects.toThrow();
    expect(ctx.client.calls).toHaveLength(0);
  });
});

describe('reopenTake', () => {
  it('nulls both resolution columns alongside the status', async () => {
    const ctx = makeCtx({ 'takes.update': () => [takeRow] }, { session });

    await reopenTake(ctx, TAKE_ID);

    const [call] = ctx.client.callsFor('takes', 'update');
    expect(call.payload).toEqual({ status: 'pending', resolved_at: null, resolved_by: null });
  });
});
