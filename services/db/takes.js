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

/** The grades the admin may apply. `pending` is not one: that is `reopenTake`,
 *  which has to null the resolution columns in the same statement to satisfy
 *  `takes_resolution_check`. */
const RESOLUTION_STATUSES = ['correct', 'incorrect', 'push'];

/**
 * The whole board for one season, with the display name of everyone on it.
 *
 * One query rather than one per take: the co-signs arrive embedded, so the
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
export async function createTake(ctx, { seasonId, body, targetType, targetWeek = null }) {
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
      targetWeek: targetType === 'week' ? targetWeek : null
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
 * Reword a take.
 *
 * Body only, and only that — not because this function is careful, but because
 * `takes_guard_author_update` rejects an UPDATE that changes anything else and
 * the `takes author edit` policy will not match a row outside the 72-hour
 * window. Sending more columns here would fail at the database, which is the
 * behaviour wanted.
 */
export async function updateTakeBody(ctx, { takeId, body }) {
  try {
    if (!takeId) throw new Error('A take id is required');
    if (!body?.trim()) throw new Error('A take needs something to say');

    const { data, error } = await ctx.client
      .from('takes')
      .update({ body: body.trim() })
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
 * Co-sign somebody else's take.
 *
 * `season_id` is sent because the table denormalizes it; the INSERT policy
 * checks it against the parent take, so a wrong value is rejected rather than
 * stored. A repeat +1 hits `take_participants_take_user_key` and comes back as
 * a duplicate — which is the correct answer to "join a take you have already
 * joined", so it is surfaced rather than swallowed.
 */
export async function addPlusOne(ctx, { takeId, seasonId }) {
  try {
    if (!takeId || !seasonId) throw new Error('A +1 needs a take and a season');

    const payload = formatForDatabase({ takeId, seasonId });

    const { data, error } = await ctx.client
      .from('take_participants')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    return formatFromDatabase(data);
  } catch (error) {
    throwDbError(error, 'Join take');
  }
}

/**
 * Withdraw your own +1.
 *
 * The `user_id` filter is load-bearing and is *not* a duplicate of RLS. For an
 * ordinary member the `take_participants withdraw own` policy already narrows
 * the delete to their own row — but the admin also holds a `FOR ALL` policy, so
 * for them an unfiltered delete on `take_id` would wipe every co-sign on that
 * take. The filter is what makes this function mean "mine" for everybody.
 */
export async function removePlusOne(ctx, takeId) {
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
    throwDbError(error, 'Withdraw from take');
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
