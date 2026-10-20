/**
 * Taunts in the data layer: one offer per member per day, a sent offer left as
 * it went, delivery claimed once, and the member's press asked of the
 * database.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { claimTaunt, getMyTaunts, getPendingTaunts, saveTauntOffers, sendTaunt } from '../notifications.js';

const offer = (userId, over = {}) => ({
  userId, seasonId: 's26', week: 7, day: 'tue', toTeamId: `team-of-${userId}-opponent`,
  senderName: 'Harshil', opponentName: 'Arya', fact: `fact for ${userId}`, taunt: `taunt for ${userId}`, ...over
});

describe('saveTauntOffers', () => {
  it('inserts a new offer for a member who has none today', async () => {
    const ctx = makeCtx({
      'matchup_taunts.select': () => [],
      'matchup_taunts.insert': (state) => state.payload.map((row, i) => ({ id: `new-${i}`, from_user_id: row.from_user_id }))
    });

    const ids = await saveTauntOffers(ctx, [offer('harshil')]);

    expect(ids).toEqual(new Map([['harshil', 'new-0']]));
    expect(ctx.client.callsFor('matchup_taunts', 'select')[0].filters).toMatchObject({ season_id: 's26', week: 7, day: 'tue' });
    expect(ctx.client.callsFor('matchup_taunts', 'insert')[0].payload[0]).toEqual({
      from_user_id: 'harshil', season_id: 's26', week: 7, day: 'tue', to_team_id: 'team-of-harshil-opponent',
      sender_name: 'Harshil', opponent_name: 'Arya', fact: 'fact for harshil', taunt: 'taunt for harshil'
    });
  });

  it("refreshes today's unsent offer and leaves a sent one as it went", async () => {
    const ctx = makeCtx({
      'matchup_taunts.select': () => [
        { id: 'unsent', from_user_id: 'harshil', sent_at: null },
        { id: 'sent', from_user_id: 'humza', sent_at: '2026-10-20T16:01:00Z' }
      ],
      'matchup_taunts.update': () => null
    });

    const ids = await saveTauntOffers(ctx, [offer('harshil'), offer('humza')]);

    expect(ids).toEqual(new Map([['harshil', 'unsent'], ['humza', 'sent']]));
    const updates = ctx.client.callsFor('matchup_taunts', 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].filters).toMatchObject({ id: 'unsent', 'is:sent_at': null });
    expect(updates[0].payload.fact).toBe('fact for harshil');
    expect(ctx.client.callsFor('matchup_taunts', 'insert')).toEqual([]);
  });

  it('does nothing with no offers', async () => {
    const ctx = makeCtx({});
    expect(await saveTauntOffers(ctx, [])).toEqual(new Map());
    expect(ctx.client.calls).toEqual([]);
  });
});

describe('delivering taunts', () => {
  it('reads what was sent since a time and not yet delivered', async () => {
    const ctx = makeCtx({
      'matchup_taunts.select': () => [{
        id: 't1', from_user_id: 'harshil', to_team_id: 'team-arya', sender_name: 'Harshil', opponent_name: 'Arya',
        taunt: 'Harshil is 8-2 all-time against you.', sent_at: '2026-10-20T16:04:00Z'
      }]
    });
    const since = new Date('2026-10-20T10:00:00Z');

    const [taunt] = await getPendingTaunts(ctx, since);

    expect(taunt).toEqual({
      id: 't1', fromUserId: 'harshil', toTeamId: 'team-arya', senderName: 'Harshil', opponentName: 'Arya',
      taunt: 'Harshil is 8-2 all-time against you.', sentAt: new Date('2026-10-20T16:04:00Z')
    });
    expect(ctx.client.callsFor('matchup_taunts', 'select')[0].filters).toEqual({
      'gte:sent_at': since.toISOString(), 'is:delivered_at': null
    });
  });

  it('claims a delivery once', async () => {
    let claimed = false;
    const ctx = makeCtx({
      'matchup_taunts.update': () => {
        if (claimed) return [];
        claimed = true;
        return [{ id: 't1' }];
      }
    });
    expect(await claimTaunt(ctx, 't1')).toBe(true);
    expect(await claimTaunt(ctx, 't1')).toBe(false);
    expect(ctx.client.callsFor('matchup_taunts', 'update')[0].filters).toEqual({ id: 't1', 'is:delivered_at': null });
  });
});

describe("the member's taunts", () => {
  it('reads their offers and asks the database to send one', async () => {
    const ctx = makeCtx({
      'matchup_taunts.select': () => [{
        id: 't1', opponent_name: 'Arya', fact: "You're 8-2 all-time against Arya.", taunt: 'Harshil is 8-2 all-time against you.',
        created_at: '2026-10-20T16:00:00Z', sent_at: null
      }],
      'rpc.send_taunt': () => 'sent'
    });

    expect(await getMyTaunts(ctx)).toEqual([{
      id: 't1', opponentName: 'Arya', fact: "You're 8-2 all-time against Arya.", taunt: 'Harshil is 8-2 all-time against you.',
      createdAt: new Date('2026-10-20T16:00:00Z'), sentAt: null
    }]);
    expect(await sendTaunt(ctx, 't1')).toBe('sent');
    expect(ctx.client.callsFor('rpc')[0].payload).toEqual({ p_id: 't1' });
  });
});
