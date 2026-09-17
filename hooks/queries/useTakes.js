/**
 * Takes hooks.
 *
 * One query for the whole board, and one mutation factory beside it. The board
 * arrives with its fades embedded and its display names resolved, so the
 * detail sheet is a cache read rather than a second round trip — a take is
 * never fetched on its own, which is why there is no per-take key.
 *
 * There is deliberately **no optimistic update on the Hell Nah**. Nothing else
 * in this codebase does optimistic writes, the board is one small query to
 * refetch, and a fade can be legitimately refused by the database — the take
 * was graded a second ago, the author cleared their wager, or it turns out to
 * be your own. Showing the fade land and then yanking it back is a worse
 * answer than a button that is briefly disabled.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

const EMPTY_BOARD = { takes: [], displayNames: {} };
const EMPTY_ACTIVITY = { events: [], displayNames: {} };

/**
 * `enabled` is how the shell borrows this query for the nav badge without
 * issuing it for a viewer who may not read the board. It is the same cache
 * entry the tab uses, so a member who has the badge has already paid for the
 * tab's data and opening Takes fetches nothing — and an unapproved or
 * signed-out viewer, for whom RLS returns zero takes anyway, never asks.
 */
export function useTakesBoard(seasonId, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: qk.takes.board(seasonId),
    queryFn: async () => (await db().takes.getTakesForSeason(seasonId)) ?? EMPTY_BOARD,
    enabled: Boolean(seasonId) && enabled
  });

  return { ...query, board: query.data ?? EMPTY_BOARD };
}

/**
 * One take's activity log — the exception to "a take is never fetched on its
 * own", and for a specific reason: the log appears nowhere but the open detail
 * sheet, so `enabled` defers it until there is a reader. Passing `takeId` as
 * null while the sheet is shut is the normal state, not a missing argument.
 *
 * Its key lives under `['takes', seasonId, …]`, so the shared `invalidate()`
 * below reaches it: a Hell Nah changes both the board and the log of the take
 * it landed on, and refreshing one without the other would leave the sheet
 * showing a fade with no matching entry beneath it.
 */
export function useTakeActivity(seasonId, takeId) {
  const query = useQuery({
    queryKey: qk.takes.activity(seasonId, takeId),
    queryFn: async () => (await db().takes.getTakeActivity(takeId)) ?? EMPTY_ACTIVITY,
    enabled: Boolean(seasonId && takeId)
  });

  return { ...query, activity: query.data ?? EMPTY_ACTIVITY };
}

/**
 * Every write the board can make.
 *
 * Each `mutationFn` takes a single destructured object so a call site reads as
 * `fade.mutate({ takeId, seasonId })` rather than depending on argument
 * order, and each `onSuccess` invalidates the one domain it changed.
 */
export function useTakesMutations(seasonId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.takes.season(seasonId) });

  return {
    createTake: useMutation({
      mutationFn: ({ body, targetType, targetWeek, wager }) =>
        db().takes.createTake({ seasonId, body, targetType, targetWeek, wager }),
      onSuccess: invalidate
    }),
    updateTake: useMutation({
      mutationFn: ({ takeId, body, wager }) => db().takes.updateTake({ takeId, body, wager }),
      onSuccess: invalidate
    }),
    deleteTake: useMutation({
      mutationFn: ({ takeId }) => db().takes.deleteTake(takeId),
      onSuccess: invalidate
    }),
    fade: useMutation({
      mutationFn: ({ takeId }) => db().takes.addFade({ takeId, seasonId }),
      onSuccess: invalidate
    }),
    withdrawFade: useMutation({
      mutationFn: ({ takeId }) => db().takes.removeFade(takeId),
      onSuccess: invalidate
    }),
    resolveTake: useMutation({
      mutationFn: ({ takeId, status }) => db().takes.resolveTake({ takeId, status }),
      onSuccess: invalidate
    }),
    reopenTake: useMutation({
      mutationFn: ({ takeId }) => db().takes.reopenTake(takeId),
      onSuccess: invalidate
    }),
    // The admin's three. Same invalidation as every other write: each changes
    // the board and the open take's log, both under `['takes', seasonId]`.
    adminUpdateTake: useMutation({
      mutationFn: ({ takeId, patch }) => db().takes.adminUpdateTake({ takeId, patch }),
      onSuccess: invalidate
    }),
    addFadeFor: useMutation({
      mutationFn: ({ takeId, userId }) => db().takes.addFadeFor({ takeId, seasonId, userId }),
      onSuccess: invalidate
    }),
    removeFadeFor: useMutation({
      mutationFn: ({ takeId, userId }) => db().takes.removeFadeFor({ takeId, userId }),
      onSuccess: invalidate
    })
  };
}
