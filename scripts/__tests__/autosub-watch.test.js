/**
 * The watcher, with ESPN and the push service stubbed out. The order of things
 * is what is under test: claim before acting, believe the read and not the
 * reply, and always tell somebody.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/db/client.server.js', () => ({}));
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

const { watchAutosubs } = await import('../autosub-watch.js');

const NOW = new Date('2026-11-08T16:30:00Z');
const KICKOFF = new Date('2026-11-08T18:00:00Z');

const baseRow = () => ({
  id: 'auto-1',
  status: 'armed',
  week: 10,
  slot: 'RB',
  teamId: 'team-1',
  starterPlayerId: 'p-starter',
  benchPlayerId: 'p-bench',
  starterKickoff: KICKOFF,
  benchKickoff: KICKOFF,
  notifiedAt: null,
  team: { owner: 'Harshil Pareek', espnTeamId: 3 },
  starter: { name: 'Bijan Robinson', espnPlayerId: 100 },
  bench: { name: 'Jaylen Warren', espnPlayerId: 200 }
});

const live = (starter, bench) =>
  new Map([[3, new Map([
    [100, { eligibleSlots: [2, 20], ...starter }],
    [200, { eligibleSlots: [2, 20], ...bench }]
  ])]]);

const before = live(
  { lineupSlotId: 2, injuryStatus: 'OUT' },
  { lineupSlotId: 20, injuryStatus: 'ACTIVE' }
);
const after = live(
  { lineupSlotId: 20, injuryStatus: 'OUT' },
  { lineupSlotId: 2, injuryStatus: 'ACTIVE' }
);

function setup({ rows = [baseRow()], season = {}, audience = {}, subscriptions, reads = [before, after], post } = {}) {
  const db = {
    autosubs: {
      getWatchInputs: vi.fn(async () => ({
        season: { year: 2026, autosubsEnabled: true, autosubEspnWrites: true, ...season },
        rows
      })),
      claimAutosub: vi.fn(async () => true),
      finishAutosub: vi.fn(async () => {}),
      markAutosubNotified: vi.fn(async () => {}),
      applySwapToRosters: vi.fn(async () => {}),
      getAlertAudience: vi.fn(async () => ({ roleHolderIds: ['commish', 'vice'], adminIds: ['admin'], ...audience }))
    },
    notifications: {
      getPushSubscriptions: vi.fn(async () => subscriptions ?? [
        { endpoint: 'e-commish', userId: 'commish', topics: [] },
        { endpoint: 'e-member', userId: 'member', topics: ['takes_new'] }
      ]),
      deletePushSubscriptions: vi.fn(async () => {}),
      markPushSubscriptionsSent: vi.fn(async () => {}),
      addToInbox: vi.fn(async (inboxRows) => inboxRows.length)
    }
  };
  const queue = [...reads];
  const espn = {
    fetchLiveRosters: vi.fn(async () => {
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    }),
    postLineupSwap: post ?? vi.fn(async () => ({ ok: true, detail: null }))
  };
  const send = vi.fn(async () => ({ ok: true, statusCode: 201 }));
  return { db, espn, send, run: (options = {}) => watchAutosubs({ db, espn, send, now: NOW, ...options }) };
}

describe('watchAutosubs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('swaps on ESPN, confirms it, and tells the commissioners', async () => {
    const { db, espn, send, run } = setup();

    const { fired } = await run();

    expect(fired).toEqual([{ id: 'auto-1', status: 'swapped' }]);
    expect(espn.postLineupSwap).toHaveBeenCalledTimes(1);
    expect(db.autosubs.applySwapToRosters).toHaveBeenCalledWith(expect.objectContaining({ slot: 'RB' }));
    expect(send.mock.calls[0][1].title).toBe('Autosub made');
    expect(db.autosubs.markAutosubNotified).toHaveBeenCalledWith('auto-1', NOW);
  });

  it('claims the row before it touches ESPN', async () => {
    const { db, espn, run } = setup();

    await run();

    expect(db.autosubs.claimAutosub.mock.invocationCallOrder[0])
      .toBeLessThan(espn.postLineupSwap.mock.invocationCallOrder[0]);
  });

  it('does nothing when another run holds the claim', async () => {
    const { db, espn, run } = setup();
    db.autosubs.claimAutosub.mockResolvedValue(false);

    await run();

    expect(espn.postLineupSwap).not.toHaveBeenCalled();
    expect(db.autosubs.finishAutosub).not.toHaveBeenCalled();
  });

  it('never writes to ESPN while automatic swaps are off', async () => {
    const { db, espn, send, run } = setup({ season: { autosubEspnWrites: false } });

    await run();

    expect(espn.postLineupSwap).not.toHaveBeenCalled();
    expect(db.autosubs.finishAutosub).toHaveBeenCalledWith('auto-1', { status: 'manual', reason: 'writes_off' });
    expect(send.mock.calls[0][1].title).toBe('Autosub needs you');
  });

  it('believes the read over a 200: a reply that did not land goes to a person', async () => {
    const { db, run } = setup({ reads: [before, before] });

    await run();

    expect(db.autosubs.finishAutosub).toHaveBeenCalledWith('auto-1', {
      status: 'manual', reason: 'unconfirmed', detail: null
    });
    expect(db.autosubs.applySwapToRosters).not.toHaveBeenCalled();
  });

  it('believes the read over a timeout: a reply that failed but landed is a swap', async () => {
    const { db, run } = setup({ post: vi.fn(async () => ({ ok: false, detail: 'timed out' })) });

    await run();

    expect(db.autosubs.finishAutosub).toHaveBeenCalledWith('auto-1', { status: 'swapped' });
  });

  it('records ESPN\'s refusal and asks the commissioners', async () => {
    const post = vi.fn(async () => ({ ok: false, detail: 'TRAN_LINEUP_LOCKED' }));
    const { db, send, run } = setup({ reads: [before, before], post });

    await run();

    expect(db.autosubs.finishAutosub).toHaveBeenCalledWith('auto-1', {
      status: 'manual', reason: 'espn_refused', detail: 'TRAN_LINEUP_LOCKED'
    });
    expect(send.mock.calls[0][1].body).toContain('TRAN_LINEUP_LOCKED');
  });

  it('still asks the commissioners when the read after the write fails', async () => {
    const { db, send, run } = setup({ reads: [before, new Error('espn is down')] });

    await run();

    expect(db.autosubs.finishAutosub).toHaveBeenCalledWith('auto-1', expect.objectContaining({
      status: 'manual', reason: 'unconfirmed'
    }));
    expect(send).toHaveBeenCalled();
  });

  it('leaves a healthy starter armed, and bothers nobody', async () => {
    const healthy = live({ lineupSlotId: 2, injuryStatus: 'QUESTIONABLE' }, { lineupSlotId: 20, injuryStatus: 'ACTIVE' });
    const { db, send, run } = setup({ reads: [healthy] });

    await run();

    expect(db.autosubs.claimAutosub).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('does not read ESPN for an autosub outside its window', async () => {
    const { espn, run } = setup({
      rows: [{ ...baseRow(), starterKickoff: new Date('2026-11-09T01:00:00Z') }]
    });

    await run();

    expect(espn.fetchLiveRosters).not.toHaveBeenCalled();
  });

  it('fires nothing while autosubs are off', async () => {
    const { espn, run } = setup({ season: { autosubsEnabled: false } });

    await run();

    expect(espn.fetchLiveRosters).not.toHaveBeenCalled();
  });

  it('turns a row a dead run left behind into a question for a person, and does not retry it', async () => {
    const { db, espn, send, run } = setup({ rows: [{ ...baseRow(), status: 'firing', injuryStatus: 'OUT' }] });

    await run();

    expect(db.autosubs.finishAutosub).toHaveBeenCalledWith('auto-1', { status: 'manual', reason: 'interrupted' });
    expect(espn.postLineupSwap).not.toHaveBeenCalled();
    expect(send.mock.calls[0][1].title).toBe('Autosub needs you');
  });

  it('tells a fired row nobody heard about, even once autosubs are off', async () => {
    const { send, run } = setup({
      rows: [{ ...baseRow(), status: 'swapped', injuryStatus: 'OUT' }],
      season: { autosubsEnabled: false }
    });

    await run();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reaches only the role holders, whatever their topics, and keeps it in Alerts for each', async () => {
    const { db, send, run } = setup();

    await run();

    expect(send.mock.calls.map(([recipient]) => recipient.endpoint)).toEqual(['e-commish']);
    expect(db.notifications.addToInbox.mock.calls[0][0].map((row) => row.userId)).toEqual(['commish', 'vice']);
  });

  it('falls back to the admins when nobody holds a role', async () => {
    const { db, run } = setup({ audience: { roleHolderIds: [] } });

    await run();

    expect(db.notifications.addToInbox.mock.calls[0][0].map((row) => row.userId)).toEqual(['admin']);
  });

  it('tries again next run when nobody could be reached', async () => {
    const { db, run } = setup({ subscriptions: [] });
    db.notifications.addToInbox.mockRejectedValue(new Error('inbox down'));

    await run();

    expect(db.autosubs.markAutosubNotified).not.toHaveBeenCalled();
  });

  it('changes nothing on a dry run', async () => {
    const { db, espn, send, run } = setup();

    const { fired } = await run({ dryRun: true });

    expect(fired[0]).toMatchObject({ action: 'swap', dryRun: true });
    expect(db.autosubs.claimAutosub).not.toHaveBeenCalled();
    expect(espn.postLineupSwap).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
