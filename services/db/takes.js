/**
 * Takes: the league's predictions board.
 *
 * Every function takes the shared `ctx` ({ client, seasonsCache, activeSeasonId })
 * as its first argument; see `./context.js`.
 *
 * Almost nothing here is a rule. The 72-hour edit window, "no +1 on your own
 * take", "nothing changes after the admin grades it" and "the body is the only
 * column an author may touch" all live in RLS policies and triggers, so the
 * client is free to be naive about them — the anon key reaches PostgREST
 * directly, and a rule that only exists in a component is not a rule. What is
 * here is request shape: which columns go up, and which filter has to be
 * present for a write to mean what it says.
 */

import { formatForDatabase, formatFromDatabase } from './caseMap.js';
import { throwDbError } from './errors.js';
import { createLogger } from './logger.js';
import { getUserDisplayNames } from './users.js';

const log = createLogger('db:takes');

/** The columns a caller may set when posting. Everything else is defaulted or
 *  stamped by a trigger — `user_id` in particular, which `set_user_id()` fills
 *  from `auth.uid()` so a client cannot post as somebody else. */
const TARGET_TYPES = ['week', 'end_of_regular_season', 'end_of_season'];

/**
 * A stake is optional, and "not set" has exactly one spelling: NULL.
 *
 * An empty box and no box are the same fact, so an empty string never reaches
 * the database — `takes_wager_check` would reject it anyway, but a caller
 * should not have to learn that from a constraint violation.
 */
function normalizeWager(wager) {
  const trimmed = typeof wager === 'string' ? wager.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/** The grades the admin may apply. `pending` is not one: that is `reopenTake`,
 *  which has to null the resolution columns in the same statement to satisfy
 *  `takes_resolution_check`. */
const RESOLUTION_STATUSES = ['correct', 'incorrect', 'push'];

/**
 * The whole board for one season, with the display name of everyone on it.
 *
 * One query rather than one per take: the fades arrive embedded, so the
 * detail sheet reads its take straight out of this cache by id and needs no
 * fetch of its own. Names come back in the same call because a board of takes
 * whose authors all read "User 4f2a1b03" is not a board anybody can use, and
 * `get_user_display_names` is one RPC for the whole set.
 */
export async function getTakesForSeason(ctx, seasonId) {
  try {
    const { data, error } = await ctx.client
      .from('takes')
      .select('*, take_participants(id, user_id, created_at)')
      .eq('season_id', seasonId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const takes = formatFromDatabase(data || []);

    const userIds = [
      ...new Set(
        takes.flatMap((take) => [
          take.userId,
          ...(take.takeParticipants || []).map((participant) => participant.userId)
        ])
      )
    ].filter(Boolean);

    const displayNames = await getUserDisplayNames(ctx, userIds);

    return { takes, displayNames };
  } catch (error) {
    throwDbError(error, 'Get takes');
  }
}

/**
 * Post a take.
 *
 * `user_id` is deliberately absent from the payload: the column defaults to
 * `auth.uid()` and `set_takes_user_id` fills it if that default is bypassed, so
 * there is no value here for a caller to get wrong. `targetWeek` is sent as an
 * explicit null for the two terminal milestones rather than omitted — the
 * biconditional CHECK reads the same either way, but an explicit null says the
 * absence is meant.
 */
export async function createTake(ctx, {
  seasonId,
  body,
  targetType,
  targetWeek = null,
  wager = null
}) {
  try {
    if (!seasonId) throw new Error('A take needs a season');
    if (!body?.trim()) throw new Error('A take needs something to say');
    if (!TARGET_TYPES.includes(targetType)) {
      throw new Error(`Unknown take milestone: ${targetType}`);
    }

    const payload = formatForDatabase({
      seasonId,
      body: body.trim(),
      targetType,
      targetWeek: targetType === 'week' ? targetWeek : null,
      wager: normalizeWager(wager)
    });

    const { data, error } = await ctx.client.from('takes').insert(payload).select().single();

    if (error) throw error;

    log.info(`take posted for season ${seasonId} (${targetType})`);

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Create take');
  }
}

/**
 * Reword a take, and restate what is riding on it.
 *
 * Those two columns and no others — not because this function is careful, but
 * because `takes_guard_author_update` rejects an UPDATE that changes anything
 * else and the `takes author edit` policy will not match a row outside the
 * 72-hour window. Sending more columns here would fail at the database, which
 * is the behaviour wanted.
 *
 * `wager` is written on every call, not only when it is present: the caller is
 * the composer, which seeds the field from the row it is editing, so an absent
 * value means the author cleared the box. Treating it as "leave it alone"
 * would make removing a stake impossible.
 */
export async function updateTake(ctx, { takeId, body, wager = null }) {
  try {
    if (!takeId) throw new Error('A take id is required');
    if (!body?.trim()) throw new Error('A take needs something to say');

    const { data, error } = await ctx.client
      .from('takes')
      .update({ body: body.trim(), wager: normalizeWager(wager) })
      .eq('id', takeId)
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Update take');
  }
}

export async function deleteTake(ctx, takeId) {
  try {
    const { error } = await ctx.client.from('takes').delete().eq('id', takeId);

    if (error) throw error;
    return true;
  } catch (error) {
    throwDbError(error, 'Delete take');
  }
}

/**
 * Say Hell Nah to somebody else's take — fade it, and take on their wager.
 *
 * `season_id` is sent because the table denormalizes it; the INSERT policy
 * checks it against the parent take, so a wrong value is rejected rather than
 * stored. A repeat hits `take_participants_take_user_key` and comes back as a
 * duplicate — which is the correct answer to "fade a take you have already
 * faded", so it is surfaced rather than swallowed.
 *
 * Nothing here checks that the take carries a wager. That clause lives in the
 * `take_participants insert own` policy, where a hand-rolled POST meets it too;
 * `canFade` in the component mirrors it so the button is simply absent.
 */
export async function addFade(ctx, { takeId, seasonId }) {
  try {
    if (!takeId || !seasonId) throw new Error('A Hell Nah needs a take and a season');

    const payload = formatForDatabase({ takeId, seasonId });

    const { data, error } = await ctx.client
      .from('take_participants')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Hell Nah');
  }
}

/**
 * Take back your own Hell Nah.
 *
 * The `user_id` filter is load-bearing and is *not* a duplicate of RLS. For an
 * ordinary member the `take_participants withdraw own` policy already narrows
 * the delete to their own row — but the admin also holds a `FOR ALL` policy, so
 * for them an unfiltered delete on `take_id` would wipe every fade on that
 * take. The filter is what makes this function mean "mine" for everybody.
 */
export async function removeFade(ctx, takeId) {
  try {
    if (!takeId) throw new Error('A take id is required');

    const userId = (await ctx.client.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('User not authenticated');

    const { error } = await ctx.client
      .from('take_participants')
      .delete()
      .eq('take_id', takeId)
      .eq('user_id', userId);

    if (error) throw error;
    return true;
  } catch (error) {
    throwDbError(error, 'Take back Hell Nah');
  }
}

/**
 * Grade a take. Admin-only, enforced by the `takes admin write` policy.
 *
 * All three resolution columns move together: `takes_resolution_check` ties
 * `status <> 'pending'` to a non-null `resolved_at`, so a partial write is
 * rejected rather than leaving a take that reads as graded to one query and
 * ungraded to another.
 */
export async function resolveTake(ctx, { takeId, status }) {
  try {
    if (!takeId) throw new Error('A take id is required');
    if (!RESOLUTION_STATUSES.includes(status)) {
      throw new Error(`Unknown take resolution: ${status}`);
    }

    const resolvedBy = (await ctx.client.auth.getUser()).data.user?.id ?? null;

    const { data, error } = await ctx.client
      .from('takes')
      .update({
        status,
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy
      })
      .eq('id', takeId)
      .select()
      .single();

    if (error) throw error;

    log.info(`take ${takeId} resolved ${status}`);

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Resolve take');
  }
}

/** Ungrade a take. Nulls both resolution columns alongside the status, which
 *  the check constraint requires. */
export async function reopenTake(ctx, takeId) {
  try {
    if (!takeId) throw new Error('A take id is required');

    const { data, error } = await ctx.client
      .from('takes')
      .update({ status: 'pending', resolved_at: null, resolved_by: null })
      .eq('id', takeId)
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Reopen take');
  }
}

/**
 * Everything that has happened to one take, newest first.
 *
 * Its own request rather than an embed on `getTakesForSeason`. The board is
 * read on every visit to the tab and the log only when somebody opens a take,
 * so embedding it would make every reader pay for the history of takes they
 * never looked at — and unlike the fades, which are a number the card shows,
 * the log has no presence anywhere but the sheet.
 *
 * `(created_at DESC, seq DESC)` and not `created_at` alone: `now()` is
 * transaction time, so an edit that also graded the take stamps both events
 * identically. `seq` is the identity column that breaks that tie in write
 * order; the ids are random uuids and order nothing.
 *
 * Names arrive with it for the same reason they do on the board — an actor
 * column reading "User 4f2a1b03" is not a log anybody can use.
 */
export async function getTakeActivity(ctx, takeId) {
  try {
    if (!takeId) throw new Error('A take id is required');

    const { data, error } = await ctx.client
      .from('take_events')
      .select('*')
      .eq('take_id', takeId)
      .order('created_at', { ascending: false })
      .order('seq', { ascending: false });

    if (error) throw error;

    const events = formatFromDatabase(data || []);

    const userIds = [
      ...new Set(events.flatMap((event) => [event.actorId, event.subjectId]))
    ].filter(Boolean);

    const displayNames = await getUserDisplayNames(ctx, userIds);

    return { events, displayNames };
  } catch (error) {
    throwDbError(error, 'Get take activity');
  }
}
