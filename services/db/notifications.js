/**
 * Push notifications: the devices that asked for them, and what was sent.
 *
 * Two audiences. The browser (as the signed-in member) saves, reads and
 * removes its *own* device through `save_push_subscription()` and the
 * own-row policies; it can never see anybody else's. The sender script
 * (`scripts/send-notifications.js`, service role) reads every device, claims
 * a `notification_log` row before sending, and removes devices the push
 * service reports gone. See 20261002120000_push_notifications.sql.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache,
 * activeSeasonId }) as its first argument; see `./context.js`.
 */

import { DbErrorKind, throwDbError, toDbError, unwrap } from './errors.js';
import { createLogger } from './logger.js';
import { selectAll } from './paging.js';

const log = createLogger('db:notifications');

// ---------------------------------------------------------------------------
// The member's own device
// ---------------------------------------------------------------------------

/**
 * Store this device's subscription with the topics it wants. `subscription` is
 * the browser's `PushSubscription` (or its `toJSON()`); returns the stored
 * topics.
 */
export async function saveMyPushSubscription(ctx, subscription, topics, userAgent = null) {
  const json = typeof subscription?.toJSON === 'function' ? subscription.toJSON() : subscription;
  const endpoint = json?.endpoint;
  const keys = json?.keys ?? {};

  if (!endpoint || !keys.p256dh || !keys.auth) {
    throwDbError(new Error('The browser returned an incomplete push subscription'), 'Save push subscription');
  }

  const result = await ctx.client.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_topics: topics,
    p_user_agent: userAgent
  });
  return unwrap(result, 'Save push subscription') ?? [];
}

/** This device's stored topics, or null when the server has no row for it. */
export async function getMyPushSubscription(ctx, endpoint) {
  if (!endpoint) return null;
  const result = await ctx.client
    .from('push_subscriptions')
    .select('topics')
    .eq('endpoint', endpoint)
    .maybeSingle();
  const row = unwrap(result, 'Get push subscription', { allowMissing: true });
  return row ? { topics: row.topics ?? [] } : null;
}

/** Forget this device. RLS limits the delete to the caller's own rows. */
export async function deleteMyPushSubscription(ctx, endpoint) {
  if (!endpoint) return;
  unwrap(
    await ctx.client.from('push_subscriptions').delete().eq('endpoint', endpoint),
    'Delete push subscription'
  );
}

// ---------------------------------------------------------------------------
// The sender (service role)
// ---------------------------------------------------------------------------

/** Every stored device, for the sender. */
export async function getPushSubscriptions(ctx) {
  try {
    const rows = await selectAll(() => ctx.client
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth, topics')
      .order('id'));
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
      topics: row.topics ?? []
    }));
  } catch (error) {
    throwDbError(error, 'Get push subscriptions');
  }
}

/** The kinds already sent for one week. */
export async function getSentNotificationKinds(ctx, seasonId, week) {
  const rows = unwrap(
    await ctx.client
      .from('notification_log')
      .select('kind')
      .eq('season_id', seasonId)
      .eq('week', week),
    'Get notification log'
  ) ?? [];
  return new Set(rows.map((row) => row.kind));
}

/**
 * Claim a (kind, season, week) before sending. Returns the log row's id, or
 * null when another run already claimed it — the unique key is what makes a
 * re-run or a race send nothing twice.
 */
export async function claimNotification(ctx, { kind, seasonId, week, recipients }) {
  const { data, error } = await ctx.client
    .from('notification_log')
    .insert({ kind, season_id: seasonId, week, recipients })
    .select('id')
    .single();

  if (error) {
    const dbError = toDbError(error, 'Claim notification');
    if (dbError.kind === DbErrorKind.DUPLICATE) {
      log.info(`${kind} for week ${week} was already sent; skipping`);
      return null;
    }
    throw dbError;
  }
  return data.id;
}

/** Record how a claimed send went. */
export async function finishNotification(ctx, id, { delivered, failed, removed }) {
  unwrap(
    await ctx.client.from('notification_log').update({ delivered, failed, removed }).eq('id', id),
    'Finish notification'
  );
}

/** Drop devices the push service says are gone (404/410). */
export async function deletePushSubscriptions(ctx, endpoints) {
  if (!endpoints?.length) return;
  unwrap(
    await ctx.client.from('push_subscriptions').delete().in('endpoint', endpoints),
    'Delete push subscriptions'
  );
}

/** Stamp the devices a send reached. */
export async function markPushSubscriptionsSent(ctx, endpoints, at = new Date()) {
  if (!endpoints?.length) return;
  unwrap(
    await ctx.client
      .from('push_subscriptions')
      .update({ last_sent_at: at.toISOString() })
      .in('endpoint', endpoints),
    'Mark push subscriptions sent'
  );
}

/** Members with at least one pick'em pick saved for a week. */
export async function getPickEmSubmitterIds(ctx, pickEmWeekId) {
  try {
    const rows = await selectAll(() => ctx.client
      .from('pick_em_submissions')
      .select('id, user_id')
      .eq('pick_em_week_id', pickEmWeekId)
      .order('id'));
    return new Set(rows.map((row) => row.user_id));
  } catch (error) {
    throwDbError(error, 'Get pick em submitters');
  }
}

/**
 * The active season and the pick'em week whose window contains `now`, or
 * nulls. Read by window rather than by derived week number, so a week the
 * admin opened early or a window the season's settings moved is still found.
 */
export async function getOpenPickEmWeek(ctx, now = new Date()) {
  const season = unwrap(
    await ctx.client.from('v_active_season').select('id, year, timezone').maybeSingle(),
    'Get active season',
    { allowMissing: true }
  );
  if (!season) return { season: null, week: null };

  const iso = now.toISOString();
  const row = unwrap(
    await ctx.client
      .from('pick_em_weeks')
      .select('id, season_id, week_number, submission_opens_at, submission_closes_at')
      .eq('season_id', season.id)
      .lte('submission_opens_at', iso)
      .gt('submission_closes_at', iso)
      .order('week_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'Get open pick em week',
    { allowMissing: true }
  );

  return {
    season: { id: season.id, year: season.year, timeZone: season.timezone || 'America/New_York' },
    week: row
      ? {
          id: row.id,
          seasonId: row.season_id,
          weekNumber: row.week_number,
          opensAt: new Date(row.submission_opens_at),
          closesAt: new Date(row.submission_closes_at)
        }
      : null
  };
}
