#!/usr/bin/env node
/**
 * Send the league's push notifications that are due right now.
 *
 *   node scripts/send-notifications.js              # send what is due
 *   node scripts/send-notifications.js --dry-run    # say what would be sent
 *   node scripts/send-notifications.js --takes      # announce new takes, Hell Yeahs and Hell Nahs,
 *                                                   # and ask Hell Nahs to accept a staked Hell Yeah
 *   node scripts/send-notifications.js --matchups   # today's matchup fact to every member
 *   node scripts/send-notifications.js --matchups --at-noon
 *                                                   # the same, only during the noon hour (the cron)
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
 * `--takes` is the other half, run by .github/workflows/notify-takes.yml,
 * which a trigger on `take_events` dispatches the moment a take is posted,
 * faded or backed (20261007120000_take_notifications.sql). It never sends a
 * pick'em notification, and the default mode never sends a take one: the
 * pick'em slots were chosen for a civil hour, and a take posted at 5 AM must
 * not be the thing that sends "pick'ems are open".
 *
 * `--matchups` is the third, run by .github/workflows/notify-matchups.yml,
 * which pg_cron dispatches daily at 16:00 and 17:00 UTC; `--at-noon` lets
 * only the one that is noon in the season's zone send. Each member gets their
 * own fact about the franchise they play this week (services/matchupFacts.js),
 * one claim per day of the week. With `--test <email>` it sends that member
 * today's fact without claiming the day.
 *
 * Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY and VAPID_SUBJECT (a mailto: or https: URL Apple can
 * reach you at).
 */

import '../services/db/client.server.js';
import webpush from 'web-push';

import { getDb, getContext } from '../services/db/index.js';
import { MATCHUP_FACTS_TOPIC, indexLeague, matchupDay, planMatchupFactNotifications } from '../services/matchupFacts.js';
import {
  TAKE_EVENT_MAX_AGE_HOURS,
  isGoneStatus,
  planPickemNotifications,
  planTakeNotifications
} from '../services/notificationPlanner.js';

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
 * are gone. A recipient may carry its own `payload` (a matchup fact is
 * different for every member); otherwise the plan's is sent. Exported for the
 * test.
 */
export async function deliver(plan, { send = pushTo, ttlSeconds = 12 * HOUR_S } = {}) {
  const results = await Promise.all(plan.recipients.map((recipient) =>
    send(recipient, recipient.payload ?? plan.payload, { ttlSeconds })));

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

/**
 * Announce the take events nobody has been told about yet. Each event is
 * claimed in notification_log by its id before it is sent.
 */
export async function sendTakeNotifications({ db = getDb(getContext()), now = new Date(), dryRun = false, send } = {}) {
  const since = new Date(now.getTime() - TAKE_EVENT_MAX_AGE_HOURS * HOUR_S * 1000);
  const inputs = await db.notifications.getTakeNotificationInputs(since);
  if (!inputs.events.length) return { reason: 'no take events to announce', sent: [] };

  const subscriptions = await db.notifications.getPushSubscriptions();
  const plans = planTakeNotifications({ now, subscriptions, ...inputs });
  if (!plans.length) return { reason: 'nobody to tell', events: inputs.events.length, sent: [] };

  const report = [];
  const gone = new Set();
  for (const plan of plans) {
    // A device found gone by an earlier plan in this run is not tried again.
    const recipients = plan.recipients.filter((recipient) => !gone.has(recipient.endpoint));
    if (dryRun) {
      report.push({ kind: plan.kind, eventId: plan.eventId, recipients: recipients.length, payload: plan.payload, dryRun: true });
      continue;
    }

    const logId = await db.notifications.claimTakeNotification({
      kind: plan.kind,
      seasonId: plan.seasonId,
      takeEventId: plan.eventId,
      recipients: recipients.length
    });
    if (!logId) continue;

    const result = await deliver({ ...plan, recipients }, { send, ttlSeconds: TAKE_EVENT_MAX_AGE_HOURS * HOUR_S });
    result.gone.forEach((endpoint) => gone.add(endpoint));

    await db.notifications.deletePushSubscriptions(result.gone);
    await db.notifications.markPushSubscriptionsSent(result.delivered, now);
    await db.notifications.finishNotification(logId, {
      delivered: result.delivered.length,
      failed: result.failures.length,
      removed: result.gone.length
    });

    report.push({
      kind: plan.kind,
      eventId: plan.eventId,
      recipients: recipients.length,
      delivered: result.delivered.length,
      removed: result.gone.length,
      failures: result.failures
    });
  }

  return { sent: report };
}

/**
 * Today's matchup fact, one per member, each about the franchise they play
 * this week. One claim covers the day (`matchup_facts:<weekday>` for the
 * week), so a re-run or the other UTC slot sends nothing twice.
 *
 * `onlyUserId` sends just that member's fact and claims nothing — the test
 * path, which must not use up the league's day.
 */
export async function sendMatchupFacts({
  db = getDb(getContext()),
  now = new Date(),
  dryRun = false,
  atNoon = false,
  onlyUserId = null,
  send
} = {}) {
  const season = await db.notifications.getMatchupFactSeason();
  if (!season) return { reason: 'no active season', sent: [] };
  const day = matchupDay(season, now);
  if (!day) return { reason: 'outside the season', sent: [] };

  const allSubscriptions = await db.notifications.getPushSubscriptions();
  const subscriptions = allSubscriptions.filter((sub) =>
    (onlyUserId ? sub.userId === onlyUserId : sub.topics.includes(MATCHUP_FACTS_TOPIC)));
  if (!subscriptions.length) return { reason: 'no device wants matchup facts', week: day.week, sent: [] };

  const userIds = subscriptions.map((sub) => sub.userId);
  const [inputs, sent, history] = await Promise.all([
    db.notifications.getMatchupFactInputs({ season, week: day.week, userIds }),
    onlyUserId ? new Set() : db.notifications.getSentNotificationKinds(season.id, day.week),
    db.notifications.getMatchupFactHistory(userIds)
  ]);
  const index = indexLeague({ ...inputs, currentSeasonId: season.id });

  const plans = planMatchupFactNotifications({
    now,
    season,
    index,
    pairings: inputs.pairings,
    memberTeams: inputs.memberTeams,
    // The test sends regardless of the topic: it is asked for by name.
    subscriptions: onlyUserId ? subscriptions.map((sub) => ({ ...sub, topics: [MATCHUP_FACTS_TOPIC] })) : subscriptions,
    history,
    sent,
    excludedUserIds: inputs.excludedUserIds,
    atNoon
  });
  if (!plans.length) return { reason: 'nothing due', week: day.week, day: day.dayKey, sent: [] };

  const report = [];
  for (const plan of plans) {
    if (dryRun) {
      report.push({
        kind: plan.kind,
        week: plan.week,
        recipients: plan.recipients.length,
        messages: plan.recipients.map((r) => ({ userId: r.userId, subject: r.fact.subject, family: r.fact.family, ...r.payload })),
        dryRun: true
      });
      continue;
    }

    let logId = null;
    if (!onlyUserId) {
      logId = await db.notifications.claimNotification({
        kind: plan.kind,
        seasonId: season.id,
        week: plan.week,
        recipients: plan.recipients.length
      });
      if (!logId) continue;
    }

    const { delivered, gone, failures } = await deliver(plan, { send, ttlSeconds: 8 * HOUR_S });
    await db.notifications.deletePushSubscriptions(gone);
    await db.notifications.markPushSubscriptionsSent(delivered, now);
    if (logId) {
      // A member is recorded as told once any of their devices took it. A
      // test is not recorded: it must not use up the member's fact.
      const reached = new Set(delivered);
      const told = new Map();
      for (const recipient of plan.recipients) {
        if (reached.has(recipient.endpoint) && !told.has(recipient.userId)) told.set(recipient.userId, recipient.fact);
      }
      await db.notifications.recordMatchupFacts([...told].map(([userId, fact]) => ({
        userId,
        seasonId: season.id,
        week: plan.week,
        day: plan.kind.split(':')[1],
        subject: fact.subject,
        family: fact.family,
        fact: fact.text,
        sentAt: now
      })));
      await db.notifications.finishNotification(logId, {
        delivered: delivered.length,
        failed: failures.length,
        removed: gone.length
      });
    }

    report.push({
      kind: plan.kind,
      week: plan.week,
      recipients: plan.recipients.length,
      delivered: delivered.length,
      removed: gone.length,
      failures
    });
  }

  return { week: day.week, day: day.dayKey, sent: report };
}

/** The account with this sign-in email, or a thrown error. */
async function findUserByEmail(email) {
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
  return user;
}

/** A test notification to one member's devices, found by email. */
async function sendTest(email) {
  const user = await findUserByEmail(email);

  const devices = (await getDb(getContext()).notifications.getPushSubscriptions())
    .filter((sub) => sub.userId === user.id);
  if (!devices.length) {
    return { email, devices: 0, note: 'That account has no device with notifications turned on.' };
  }

  const { delivered, gone, failures } = await deliver({
    recipients: devices,
    payload: {
      title: 'OG Jits notifications are on',
      body: 'This is a test. Pick\'em reminders and take alerts will arrive like this.',
      url: '/settings',
      tag: 'test'
    }
  }, { ttlSeconds: HOUR_S });
  await getDb(getContext()).notifications.deletePushSubscriptions(gone);
  return { email, devices: devices.length, delivered: delivered.length, removed: gone.length, failures };
}

async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const takes = argv.includes('--takes');
  const matchups = argv.includes('--matchups');
  const testIndex = argv.indexOf('--test');
  const testEmail = testIndex >= 0 ? argv[testIndex + 1] ?? '' : null;

  if (!dryRun) configureVapid();

  let result;
  if (matchups) {
    const onlyUserId = testEmail != null ? (await findUserByEmail(testEmail)).id : null;
    result = await sendMatchupFacts({ dryRun, atNoon: argv.includes('--at-noon'), onlyUserId });
  } else if (testEmail != null) result = await sendTest(testEmail);
  else if (takes) result = await sendTakeNotifications({ dryRun });
  else result = await sendDueNotifications({ dryRun });

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
