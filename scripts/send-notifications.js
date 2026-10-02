#!/usr/bin/env node
/**
 * Send the league's push notifications that are due right now.
 *
 *   node scripts/send-notifications.js              # send what is due
 *   node scripts/send-notifications.js --dry-run    # say what would be sent
 *   node scripts/send-notifications.js --test you@example.com
 *                                                   # one test notification to that member's devices
 *
 * Run by .github/workflows/notify-pickems.yml, which Supabase's pg_cron
 * dispatches Tuesdays 14:00 UTC and Thursdays 21:30 UTC (see
 * 20261002120000_push_notifications.sql). What is due is decided by
 * `services/notificationPlanner.js` from the pick'em week whose window is open
 * now; this file reads the inputs, claims a `notification_log` row, sends, and
 * cleans up devices the push service reports gone. Re-running is safe: a
 * claimed (kind, season, week) is never sent again.
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or https: URL Apple can
 * reach you at).
 */

import '../services/db/client.server.js';
import webpush from 'web-push';

import { getDb, getContext } from '../services/db/index.js';
import { isGoneStatus, planPickemNotifications } from '../services/notificationPlanner.js';

const HOUR_S = 60 * 60;

function configureVapid(env = process.env) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    throw new Error('VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set');
  }
  webpush.setVapidDetails(VAPID_SUBJECT || 'https://ogjits.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

/** One push to one device. Resolves to { ok, statusCode }; never throws. */
async function pushTo(subscription, payload, { ttlSeconds }) {
  try {
    const result = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      { TTL: Math.max(60, Math.floor(ttlSeconds)), urgency: 'normal' }
    );
    return { ok: true, statusCode: result.statusCode };
  } catch (error) {
    return { ok: false, statusCode: error.statusCode ?? null, message: error.body || error.message };
  }
}

/**
 * Send every recipient of one plan, then report the counts and which devices
 * are gone. Exported for the test.
 */
export async function deliver(plan, { send = pushTo, ttlSeconds = 12 * HOUR_S } = {}) {
  const results = await Promise.all(plan.recipients.map((recipient) => send(recipient, plan.payload, { ttlSeconds })));

  const delivered = [];
  const gone = [];
  const failures = [];
  results.forEach((result, i) => {
    const endpoint = plan.recipients[i].endpoint;
    if (result.ok) delivered.push(endpoint);
    else if (isGoneStatus(result.statusCode)) gone.push(endpoint);
    else failures.push({ endpoint, statusCode: result.statusCode, message: result.message });
  });
  return { delivered, gone, failures };
}

/**
 * Plan and send what is due. Exported so the decision can be exercised
 * without a network; `send` is the one seam.
 */
export async function sendDueNotifications({ db = getDb(getContext()), now = new Date(), dryRun = false, send } = {}) {
  const { season, week } = await db.notifications.getOpenPickEmWeek(now);
  if (!season) return { reason: 'no active season', sent: [] };
  if (!week) return { reason: 'no pick\'em window is open', sent: [] };

  const [sent, subscriptions, submittedUserIds] = await Promise.all([
    db.notifications.getSentNotificationKinds(season.id, week.weekNumber),
    db.notifications.getPushSubscriptions(),
    db.notifications.getPickEmSubmitterIds(week.id)
  ]);

  const plans = planPickemNotifications({ now, week, timeZone: season.timeZone, sent, subscriptions, submittedUserIds });
  if (!plans.length) return { reason: 'nothing due', week: week.weekNumber, sent: [] };

  const report = [];
  for (const plan of plans) {
    if (dryRun) {
      report.push({ kind: plan.kind, week: plan.week, recipients: plan.recipients.length, payload: plan.payload, dryRun: true });
      continue;
    }

    const logId = await db.notifications.claimNotification({
      kind: plan.kind,
      seasonId: season.id,
      week: plan.week,
      recipients: plan.recipients.length
    });
    if (!logId) continue; // another run got there first

    // Not worth delivering after the deadline it is about.
    const ttlSeconds = (week.closesAt.getTime() - now.getTime()) / 1000;
    const { delivered, gone, failures } = await deliver(plan, { send, ttlSeconds });

    await db.notifications.deletePushSubscriptions(gone);
    await db.notifications.markPushSubscriptionsSent(delivered, now);
    await db.notifications.finishNotification(logId, {
      delivered: delivered.length,
      failed: failures.length,
      removed: gone.length
    });

    report.push({
      kind: plan.kind,
      week: plan.week,
      recipients: plan.recipients.length,
      delivered: delivered.length,
      removed: gone.length,
      failures
    });
  }

  return { week: week.weekNumber, sent: report };
}

/** A test notification to one member's devices, found by email. */
async function sendTest(email) {
  const client = getContext().client;
  const target = email.trim().toLowerCase();

  let user = null;
  for (let page = 1; !user; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    user = data.users.find((u) => (u.email ?? '').toLowerCase() === target) ?? null;
    if (data.users.length < 200) break;
  }
  if (!user) throw new Error(`No account uses ${email}`);

  const devices = (await getDb(getContext()).notifications.getPushSubscriptions())
    .filter((sub) => sub.userId === user.id);
  if (!devices.length) {
    return { email, devices: 0, note: 'That account has no device with notifications turned on.' };
  }

  const { delivered, gone, failures } = await deliver({
    recipients: devices,
    payload: {
      title: 'OG Jits notifications are on',
      body: 'This is a test. Pick\'em reminders will arrive like this.',
      url: '/settings',
      tag: 'test'
    }
  }, { ttlSeconds: HOUR_S });
  await getDb(getContext()).notifications.deletePushSubscriptions(gone);
  return { email, devices: devices.length, delivered: delivered.length, removed: gone.length, failures };
}

async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const testIndex = argv.indexOf('--test');

  if (!dryRun) configureVapid();

  const result = testIndex >= 0
    ? await sendTest(argv[testIndex + 1] ?? '')
    : await sendDueNotifications({ dryRun });

  console.log(JSON.stringify(result, null, 2));

  // A send that reached nobody it tried is worth a red run.
  const failed = (result.sent ?? []).some((entry) => entry.recipients > 0 && entry.delivered === 0 && entry.failures?.length);
  if (failed || (result.failures?.length && !result.delivered)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
