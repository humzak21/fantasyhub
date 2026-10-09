/**
 * Push notifications: the devices that asked for them, and what was sent.
 *
 * Two audiences. The browser (as the signed-in member) saves, reads and
 * removes its *own* device through `save_push_subscription()` and the
 * own-row policies; it can never see anybody else's. The sender script
 * (`scripts/send-notifications.js`, service role) reads every device, claims
 * a `notification_log` row before sending, and removes devices the push
 * service reports gone. See 20261002120000_push_notifications.sql, and
 * 20261007120000_take_notifications.sql for the per-take-event half.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache,
 * activeSeasonId }) as its first argument; see `./context.js`.
 */

import { DbErrorKind, throwDbError, toDbError, unwrap } from './errors.js';
import { createLogger } from './logger.js';
import { selectAll } from './paging.js';
import { getUserDisplayNames } from './users.js';
import { ownerKey } from '../../utils/ownerAliases.js';

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

// ---------------------------------------------------------------------------
// Takes (service role)
// ---------------------------------------------------------------------------

/** The take events that can be announced. Withdrawals, edits and grades are not. */
export const ANNOUNCED_TAKE_EVENTS = Object.freeze(['posted', 'faded', 'backed']);

/**
 * Everything `planTakeNotifications` needs, for events since `since`: the
 * events not yet in notification_log, their takes, those takes' current
 * participants, the names involved, and the accounts that may not read takes.
 *
 * "Not yet sent" is read from notification_log rather than marked on the
 * event, because `take_events` is append-only and no client can write it.
 */
export async function getTakeNotificationInputs(ctx, since) {
  const sinceIso = since.toISOString();

  const [eventRows, claimedRows] = await Promise.all([
    selectAll(() => ctx.client
      .from('take_events')
      .select('id, seq, take_id, season_id, event_type, subject_id, created_at')
      .in('event_type', ANNOUNCED_TAKE_EVENTS)
      .gte('created_at', sinceIso)
      .order('seq')).catch((error) => throwDbError(error, 'Get take events')),
    // Sent after the event, so anything claimed for these events was sent
    // since `since` too.
    selectAll(() => ctx.client
      .from('notification_log')
      .select('id, take_event_id')
      .not('take_event_id', 'is', null)
      .gte('sent_at', sinceIso)
      .order('id')).catch((error) => throwDbError(error, 'Get take notification log'))
  ]);

  const claimed = new Set(claimedRows.map((row) => row.take_event_id));
  const events = eventRows
    .filter((row) => !claimed.has(row.id))
    .map((row) => ({
      id: row.id,
      takeId: row.take_id,
      seasonId: row.season_id,
      eventType: row.event_type,
      subjectId: row.subject_id,
      createdAt: new Date(row.created_at)
    }));

  if (!events.length) {
    return { events, takes: new Map(), participants: [], displayNames: {}, excludedUserIds: new Set() };
  }

  const takeIds = [...new Set(events.map((event) => event.takeId))];
  const [takeRows, participantRows, unapprovedRows] = await Promise.all([
    ctx.client.from('takes').select('id, user_id, body, wager').in('id', takeIds)
      .then((result) => unwrap(result, 'Get takes for notifications') ?? []),
    ctx.client.from('take_participants').select('take_id, user_id, side, wager').in('take_id', takeIds)
      .then((result) => unwrap(result, 'Get take participants for notifications') ?? []),
    // The admin has no row and is approved; every other account has one.
    ctx.client.from('member_approvals').select('user_id').neq('status', 'approved')
      .then((result) => unwrap(result, 'Get unapproved members') ?? [])
  ]);

  const takes = new Map(takeRows.map((row) => [row.id, {
    id: row.id,
    authorId: row.user_id,
    body: row.body,
    wager: row.wager ?? null
  }]));
  const participants = participantRows.map((row) => ({
    takeId: row.take_id,
    userId: row.user_id,
    side: row.side ?? 'nah',
    wager: row.wager ?? null
  }));

  const nameIds = new Set();
  for (const take of takes.values()) nameIds.add(take.authorId);
  for (const event of events) if (event.subjectId) nameIds.add(event.subjectId);
  const displayNames = await getUserDisplayNames(ctx, [...nameIds]);

  return {
    events,
    takes,
    participants,
    displayNames,
    excludedUserIds: new Set(unapprovedRows.map((row) => row.user_id))
  };
}

/**
 * Claim one take event before sending it. Returns the log row's id, or null
 * when another run already claimed it.
 */
export async function claimTakeNotification(ctx, { kind, seasonId, takeEventId, recipients }) {
  const { data, error } = await ctx.client
    .from('notification_log')
    .insert({ kind, season_id: seasonId, take_event_id: takeEventId, recipients })
    .select('id')
    .single();

  if (error) {
    const dbError = toDbError(error, 'Claim take notification');
    if (dbError.kind === DbErrorKind.DUPLICATE) {
      log.info(`take event ${takeEventId} was already sent; skipping`);
      return null;
    }
    throw dbError;
  }
  return data.id;
}

// ---------------------------------------------------------------------------
// Matchup facts (service role)
// ---------------------------------------------------------------------------

/** The active season, as `matchupDay` reads it, or null. */
export async function getMatchupFactSeason(ctx) {
  const row = unwrap(
    await ctx.client
      .from('v_active_season')
      .select('id, year, start_date, timezone, week_count')
      .maybeSingle(),
    'Get active season',
    { allowMissing: true }
  );
  if (!row) return null;
  return {
    id: row.id,
    year: row.year,
    startDate: row.start_date,
    weekCount: row.week_count,
    timeZone: row.timezone || 'America/New_York'
  };
}

/**
 * Everything `planMatchupFactNotifications` needs besides the devices: the
 * league's whole history (seasons, teams, every scored game), this week's
 * pairings, which team each member owns, and the accounts that are not
 * approved members.
 *
 * A member's team is `teams.user_id` for the season, falling back to their
 * display name against `teams.owner` — the same comparison that unmasks the
 * league for them (`ownerKey`).
 */
export async function getMatchupFactInputs(ctx, { season, week, userIds = [] }) {
  const [seasonRows, teamRows, results, gameRows, unapprovedRows, lineupRows, playerRows, eventRows] = await Promise.all([
    ctx.client.from('seasons').select('id, year, is_completed')
      .then((result) => unwrap(result, 'Get seasons') ?? []),
    selectAll(() => ctx.client
      .from('teams')
      .select('id, season_id, franchise_id, owner, user_id, made_playoffs, playoff_finish, final_rank')
      .order('id')).catch((error) => throwDbError(error, 'Get teams for matchup facts')),
    // One row per team per scored game; passes 1,000 rows, so paged.
    selectAll(() => ctx.client
      .from('v_game_results')
      .select('game_id, season_id, week, type, is_regular, is_playoff, is_consolation, team_id, opponent_id, points_for, points_against, result')
      .order('game_id')
      .order('team_id')).catch((error) => throwDbError(error, 'Get game results for matchup facts')),
    // This week's games, scored or not; v_game_results holds scored games only.
    ctx.client.from('games').select('team1_id, team2_id').eq('season_id', season.id).eq('week', week)
      .then((result) => unwrap(result, 'Get this week\'s games') ?? []),
    ctx.client.from('member_approvals').select('user_id').neq('status', 'approved')
      .then((result) => unwrap(result, 'Get unapproved members') ?? []),
    // Every settled team-week since 2020.
    selectAll(() => ctx.client
      .from('team_week_lineups')
      .select('id, season_id, week, team_id, starter_points, optimal_points, bench_points')
      .order('id')).catch((error) => throwDbError(error, 'Get lineups for matchup facts')),
    // This season's player weeks, for the player facts.
    selectAll(() => ctx.client
      .from('player_week_stats')
      .select('id, week, team_id, player_id, espn_player_id, started, actual_points')
      .eq('season_id', season.id)
      .order('id')).catch((error) => throwDbError(error, 'Get player weeks for matchup facts')),
    // This season's adds, for the pickup facts.
    selectAll(() => ctx.client
      .from('transaction_events')
      .select('id, type, scoring_period, espn_player_ids, player_from_franchise_ids, player_to_franchise_ids')
      .eq('season_id', season.id)
      .in('type', ['WAIVER', 'FREEAGENT'])
      .order('id')).catch((error) => throwDbError(error, 'Get pickups for matchup facts'))
  ]);

  const playerIds = [...new Set(playerRows.map((row) => row.player_id).filter(Boolean))];
  const playerNames = new Map();
  for (let i = 0; i < playerIds.length; i += 150) {
    const rows = unwrap(
      await ctx.client.from('players').select('id, name').in('id', playerIds.slice(i, i + 150)),
      'Get player names for matchup facts'
    ) ?? [];
    for (const row of rows) playerNames.set(row.id, row.name);
  }

  const teams = teamRows.map((row) => ({
    id: row.id,
    seasonId: row.season_id,
    franchiseId: row.franchise_id,
    owner: row.owner ?? '',
    userId: row.user_id,
    madePlayoffs: row.made_playoffs,
    playoffFinish: row.playoff_finish,
    finalRank: row.final_rank
  }));

  const pairings = gameRows
    .filter((row) => row.team1_id && row.team2_id && row.team1_id !== row.team2_id)
    .flatMap((row) => [
      { teamId: row.team1_id, opponentId: row.team2_id },
      { teamId: row.team2_id, opponentId: row.team1_id }
    ]);

  const thisSeason = teams.filter((team) => team.seasonId === season.id);
  const memberTeams = new Map();
  const unmatched = [];
  for (const userId of new Set(userIds)) {
    const team = thisSeason.find((t) => t.userId === userId);
    if (team) memberTeams.set(userId, team.id);
    else unmatched.push(userId);
  }
  if (unmatched.length) {
    const names = await getUserDisplayNames(ctx, unmatched);
    for (const userId of unmatched) {
      const key = ownerKey(names[userId]);
      const team = key && thisSeason.find((t) => ownerKey(t.owner) === key);
      if (team) memberTeams.set(userId, team.id);
    }
  }

  return {
    seasons: seasonRows.map((row) => ({ id: row.id, year: row.year, isCompleted: Boolean(row.is_completed) })),
    teams,
    results: results.map((row) => ({
      seasonId: row.season_id,
      week: row.week,
      type: row.type,
      isRegular: Boolean(row.is_regular),
      isPlayoff: Boolean(row.is_playoff),
      isConsolation: Boolean(row.is_consolation),
      teamId: row.team_id,
      opponentId: row.opponent_id,
      pointsFor: row.points_for == null ? null : Number(row.points_for),
      pointsAgainst: row.points_against == null ? null : Number(row.points_against),
      result: row.result
    })),
    lineups: lineupRows.map((row) => ({
      seasonId: row.season_id,
      week: row.week,
      teamId: row.team_id,
      starterPoints: Number(row.starter_points),
      optimalPoints: Number(row.optimal_points),
      benchPoints: Number(row.bench_points)
    })),
    playerWeeks: playerRows.map((row) => ({
      week: row.week,
      teamId: row.team_id,
      espnPlayerId: row.espn_player_id,
      name: playerNames.get(row.player_id) ?? null,
      started: Boolean(row.started),
      points: row.actual_points == null ? null : Number(row.actual_points)
    })),
    pickups: eventRows.map((row) => ({
      type: row.type,
      week: row.scoring_period,
      espnPlayerIds: row.espn_player_ids ?? [],
      from: row.player_from_franchise_ids ?? [],
      to: row.player_to_franchise_ids ?? []
    })),
    pairings,
    memberTeams,
    excludedUserIds: new Set(unapprovedRows.map((row) => row.user_id))
  };
}

/**
 * Every matchup fact these members have been sent, by user id, for
 * `pickFact`'s never-repeat rule.
 */
export async function getMatchupFactHistory(ctx, userIds) {
  const history = new Map();
  if (!userIds?.length) return history;
  const rows = await selectAll(() => ctx.client
    .from('matchup_fact_log')
    .select('id, user_id, fact, family, subject, sent_at')
    .in('user_id', [...new Set(userIds)])
    .order('id')).catch((error) => throwDbError(error, 'Get matchup fact history'));
  for (const row of rows) {
    if (!history.has(row.user_id)) history.set(row.user_id, []);
    history.get(row.user_id).push({
      factKey: row.fact,
      family: row.family,
      subject: row.subject,
      sentAt: new Date(row.sent_at)
    });
  }
  return history;
}

/** Record the facts sent today, one row per member. A day already recorded is left alone. */
export async function recordMatchupFacts(ctx, rows) {
  if (!rows?.length) return;
  unwrap(
    await ctx.client.from('matchup_fact_log').upsert(
      rows.map((row) => ({
        user_id: row.userId,
        season_id: row.seasonId,
        week: row.week,
        day: row.day,
        subject: row.subject,
        family: row.family,
        fact: row.fact,
        sent_at: row.sentAt.toISOString()
      })),
      { onConflict: 'user_id,season_id,week,day', ignoreDuplicates: true }
    ),
    'Record matchup facts'
  );
}
