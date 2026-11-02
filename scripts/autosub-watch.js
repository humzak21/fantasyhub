#!/usr/bin/env node
/**
 * Fire the autosubs that are due.
 *
 *   node scripts/autosub-watch.js              # act on what is due
 *   node scripts/autosub-watch.js --dry-run    # say what would be done
 *
 * Run by .github/workflows/autosub-watch.yml, which pg_cron dispatches only
 * when an autosub is inside its watch window (20261103120000_autosubs.sql).
 *
 * A member has named a bench player to take over from a starter. For each
 * autosub whose game is close, this reads ESPN's live lineup, and if the
 * starter has been ruled out it either makes the swap on ESPN or leaves it to
 * the commissioners (`decideAutosub` in services/autosubPlanner.js says which).
 * The commissioner and vice commissioner are told either way, by push and in
 * Alerts, regardless of their notification topics: this is a job for them to
 * do, not a preference. If nobody holds either role the admins are told, so
 * that a fired autosub can never go unheard.
 *
 * Claim, then act. A row is stamped `firing` before anything happens to it, so
 * it cannot fire twice. A row left `firing` means a run died partway, and the
 * next run asks the commissioners to check ESPN rather than trying again.
 * Telling them is at-least-once: a row with no `notified_at` is told by the next
 * run, because a repeated alert costs less than a missing one.
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ESPN_S2, ESPN_SWID,
 * VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
 */

import '../services/db/client.server.js';

import { ESPN_CONFIG } from '../config/espn-config.js';
import { alertUserIds, decideAutosub, describeAutosub, isInWatchWindow, swapLanded } from '../services/autosubPlanner.js';
import { mapESPNRosterSlot } from '../services/db/espnMapping.js';
import { getDb, getContext } from '../services/db/index.js';
import { buildLineupSwap, fetchLiveRosters, postLineupSwap } from '../services/espnLineupWriter.js';
import { configureVapid, deliver, keepInInbox } from './send-notifications.js';

const HOUR_S = 60 * 60;

/** Worth seeing for the rest of the game day, and not after. */
const ALERT_TTL_SECONDS = 6 * HOUR_S;

/** The ESPN half, as one seam for the tests. */
const liveEspn = { fetchLiveRosters, postLineupSwap };

function espnConfigFor(season) {
  return {
    leagueId: season.espnLeagueId || ESPN_CONFIG.leagueId,
    seasonYear: season.espnSeasonYear || season.year || ESPN_CONFIG.seasonYear,
    espnS2: ESPN_CONFIG.espnS2,
    swid: ESPN_CONFIG.swid
  };
}

/** Post the swap, then read the lineup back. Only the read decides. */
async function makeSwap({ db, espn, config, row, slotId, liveTeamId }) {
  const swap = buildLineupSwap({
    teamId: liveTeamId,
    week: row.week,
    starterEspnId: row.starter.espnPlayerId,
    benchEspnId: row.bench.espnPlayerId,
    slotId
  });

  const posted = await espn.postLineupSwap({ ...config, swap });

  let rosters;
  try {
    rosters = await espn.fetchLiveRosters({ ...config, week: row.week });
  } catch {
    return { status: 'manual', reason: posted.ok ? 'unconfirmed' : 'espn_refused', detail: posted.detail };
  }

  const roster = rosters.get(liveTeamId);
  const landed = swapLanded({
    starter: roster?.get(row.starter.espnPlayerId),
    bench: roster?.get(row.bench.espnPlayerId),
    slotId
  });
  if (!landed) return { status: 'manual', reason: posted.ok ? 'unconfirmed' : 'espn_refused', detail: posted.detail };

  await db.autosubs.applySwapToRosters({
    teamId: row.teamId,
    starterPlayerId: row.starterPlayerId,
    benchPlayerId: row.benchPlayerId,
    slot: mapESPNRosterSlot(slotId)
  });
  return { status: 'swapped' };
}

/** Tell the commissioners about one fired row, then stamp it told. */
async function tellCommissioners({ db, row, userIds, subscriptions, now, send }) {
  const wanted = new Set(userIds);
  const recipients = subscriptions.filter((sub) => wanted.has(sub.userId));
  const plan = {
    kind: 'autosub',
    recipients,
    payload: { ...describeAutosub(row), url: '/alerts', tag: `autosub-${row.id}` }
  };

  const { delivered, gone, failures } = await deliver(plan, { send, ttlSeconds: ALERT_TTL_SECONDS });
  await db.notifications.deletePushSubscriptions(gone);
  await db.notifications.markPushSubscriptionsSent(delivered, now);

  // Everyone gets the Alerts row, with or without a device that took the push.
  const inboxed = await keepInInbox(db, plan, userIds.map((userId) => ({ userId })));
  const reached = delivered.length > 0 || (typeof inboxed === 'number' && inboxed > 0);
  if (reached) await db.autosubs.markAutosubNotified(row.id, now);

  return { id: row.id, status: row.status, delivered: delivered.length, inboxed, failures };
}

/**
 * Exported so the decision can be exercised without a network; `espn` and
 * `send` are the seams.
 */
export async function watchAutosubs({
  db = getDb(getContext()),
  espn = liveEspn,
  now = new Date(),
  dryRun = false,
  send
} = {}) {
  const { season, rows } = await db.autosubs.getWatchInputs();
  if (!season) return { reason: 'no active season', fired: [], told: [] };

  const fired = [];

  // A run died between the claim and the result, so nobody knows what ESPN did.
  for (const row of rows.filter((candidate) => candidate.status === 'firing')) {
    if (dryRun) continue;
    await db.autosubs.finishAutosub(row.id, { status: 'manual', reason: 'interrupted' });
    Object.assign(row, { status: 'manual', reason: 'interrupted' });
  }

  const armed = season.autosubsEnabled
    ? rows.filter((row) => row.status === 'armed' && isInWatchWindow(row.starterKickoff, now))
    : [];

  const config = espnConfigFor(season);
  for (const week of new Set(armed.map((row) => row.week))) {
    const rosters = await espn.fetchLiveRosters({ ...config, week });

    for (const row of armed.filter((candidate) => candidate.week === week)) {
      const roster = rosters.get(row.team?.espnTeamId);
      const decision = decideAutosub({
        row,
        starter: roster?.get(row.starter?.espnPlayerId),
        bench: roster?.get(row.bench?.espnPlayerId),
        now,
        espnWrites: season.autosubEspnWrites
      });
      if (decision.action === 'wait') continue;

      if (dryRun) {
        fired.push({ id: row.id, ...decision, dryRun: true });
        continue;
      }

      const claimed = await db.autosubs.claimAutosub(row.id, { injuryStatus: decision.injuryStatus, now });
      if (!claimed) continue;

      const outcome = decision.action === 'swap'
        ? await makeSwap({ db, espn, config, row, slotId: decision.slotId, liveTeamId: row.team.espnTeamId })
        : { status: 'manual', reason: decision.reason };

      await db.autosubs.finishAutosub(row.id, outcome);
      Object.assign(row, { reason: null, detail: null }, outcome, { injuryStatus: decision.injuryStatus });
      fired.push({ id: row.id, ...outcome });
    }
  }

  const unsent = rows.filter((row) => (row.status === 'swapped' || row.status === 'manual') && !row.notifiedAt);
  if (dryRun || !unsent.length) return { fired, told: [] };

  const userIds = alertUserIds(await db.autosubs.getAlertAudience());
  const subscriptions = await db.notifications.getPushSubscriptions();

  const told = [];
  for (const row of unsent) {
    told.push(await tellCommissioners({ db, row, userIds, subscriptions, now, send }));
  }

  return { fired, told };
}

async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  if (!dryRun) configureVapid();

  const result = await watchAutosubs({ dryRun });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
