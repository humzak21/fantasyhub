/**
 * ESPN refreshes a team's name; it does not get to rename its owner.
 *
 * `teams.owner` is this league's cross-season identity key — it decides whether
 * a viewer sees the league unmasked, and which division a member's TD parlay
 * pick is seated in. The annual import used to patch it whenever ESPN's
 * spelling differed, which made a hand-made correction last exactly until the
 * next start-of-season run. These tests pin the rule that replaced it: written
 * on insert, filled when blank, reported but never overwritten otherwise.
 */

import { describe, it, expect } from 'vitest';

import { makeCtx } from './fakeClient.js';
import { upsertTeamsFromESPN } from '../teams.js';

const SEASON_ID = 'season-2026';

/** As stored: the league's spelling, corrected by hand. */
const STORED = {
  id: 'team-1',
  name: 'INOVA',
  owner: 'Aashish Gatamaneni',
  espn_team_id: 10,
  abbreviation: 'INV'
};

/** As ESPN sends it: still misspelled, and a new team name for the year. */
const FROM_ESPN = {
  teamId: 10,
  teamName: 'INOVA',
  ownerName: 'Aashish Gatmaneni',
  abbreviation: 'INV'
};

const handlers = (teams = [STORED], overrides = {}) => ({
  'teams.select': () => teams,
  'teams.insert': ({ payload }) => payload,
  'teams.update': ({ payload }) => payload,
  ...overrides
});

describe('upsertTeamsFromESPN · owner', () => {
  it('never patches an owner ESPN disagrees with', async () => {
    const ctx = makeCtx(handlers());

    const result = await upsertTeamsFromESPN(ctx, SEASON_ID, [FROM_ESPN]);

    expect(result).toMatchObject({ inserted: 0, updated: 0, unchanged: 1 });
    expect(ctx.client.callsFor('teams', 'update')).toHaveLength(0);
  });

  it('reports the disagreement instead, with both spellings', async () => {
    const ctx = makeCtx(handlers());

    const { ownerConflicts } = await upsertTeamsFromESPN(ctx, SEASON_ID, [FROM_ESPN]);

    // Both sides, because "the owner changed" is not information — which
    // spelling is which is the whole of what a person needs to decide.
    expect(ownerConflicts).toEqual([
      {
        teamId: 'team-1',
        team: 'INOVA',
        espnTeamId: 10,
        stored: 'Aashish Gatamaneni',
        espn: 'Aashish Gatmaneni'
      }
    ]);
  });

  it('still refreshes the team name and abbreviation around it', async () => {
    const ctx = makeCtx(handlers());

    const result = await upsertTeamsFromESPN(ctx, SEASON_ID, [
      { ...FROM_ESPN, teamName: 'Tityland Quadzillas', abbreviation: 'TQ' }
    ]);

    expect(result.updated).toBe(1);
    expect(ctx.client.callsFor('teams', 'update')[0].payload).toEqual({
      name: 'Tityland Quadzillas',
      abbreviation: 'TQ'
    });
  });

  it('writes the owner on insert — a new team has no league spelling to protect', async () => {
    const ctx = makeCtx(handlers([]));

    const result = await upsertTeamsFromESPN(ctx, SEASON_ID, [FROM_ESPN]);

    expect(result.inserted).toBe(1);
    expect(ctx.client.callsFor('teams', 'insert')[0].payload).toMatchObject({
      owner: 'Aashish Gatmaneni'
    });
  });

  it('fills a blank owner — that is a gap, not a disagreement', async () => {
    const ctx = makeCtx(handlers([{ ...STORED, owner: '' }]));

    const result = await upsertTeamsFromESPN(ctx, SEASON_ID, [FROM_ESPN]);

    expect(result.updated).toBe(1);
    expect(result.ownerConflicts).toEqual([]);
    expect(ctx.client.callsFor('teams', 'update')[0].payload).toEqual({
      owner: 'Aashish Gatmaneni'
    });
  });

  it('does not report a difference of case or whitespace', async () => {
    const ctx = makeCtx(handlers());

    // `buildTeamIndex` keys on the trimmed, folded name, so a difference it
    // cannot see is not one to put in front of a person every September.
    const result = await upsertTeamsFromESPN(ctx, SEASON_ID, [
      { ...FROM_ESPN, ownerName: '  aashish GATAMANENI ' }
    ]);

    expect(result.ownerConflicts).toEqual([]);
    expect(result.unchanged).toBe(1);
  });

  it('leaves the ESPN id backfill alone', async () => {
    const ctx = makeCtx(handlers([{ ...STORED, espn_team_id: null }]));

    // Matched by the owner fallback, so the stored spelling has to be the one
    // ESPN sends for this path to fire at all — which is exactly why the
    // divergence above must stay rare enough to notice.
    const result = await upsertTeamsFromESPN(ctx, SEASON_ID, [
      { ...FROM_ESPN, ownerName: 'Aashish Gatamaneni' }
    ]);

    expect(result.updated).toBe(1);
    expect(ctx.client.callsFor('teams', 'update')[0].payload).toEqual({ espn_team_id: 10 });
  });
});
