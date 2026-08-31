/**
 * Takes hooks.
 *
 * One query for the whole board, and one mutation factory beside it. The board
 * arrives with its co-signs embedded and its display names resolved, so the
 * detail sheet is a cache read rather than a second round trip — a take is
 * never fetched on its own, which is why there is no per-take key.
 *
 * There is deliberately **no optimistic update on the +1**. Nothing else in
 * this codebase does optimistic writes, the board is one small query to
 * refetch, and a +1 can be legitimately refused by the database — the take was
 * graded a second ago, or it turns out to be your own. Showing the co-sign
 * land and then yanking it back is a worse answer than a button that is
 * briefly disabled.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

const EMPTY_BOARD = { takes: [], displayNames: {} };

export function useTakesBoard(seasonId) {
  const query = useQuery({
    queryKey: qk.takes.board(seasonId),
    queryFn: async () => (await db().takes.getTakesForSeason(seasonId)) ?? EMPTY_BOARD,
    enabled: Boolean(seasonId)
  });

  return { ...query, board: query.data ?? EMPTY_BOARD };
}

/**
 * Every write the board can make.
 *
 * Each `mutationFn` takes a single destructured object so a call site reads as
 * `plusOne.mutate({ takeId, seasonId })` rather than depending on argument
 * order, and each `onSuccess` invalidates the one domain it changed.
 */
export function useTakesMutations(seasonId) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.takes.season(seasonId) });

  return {
    createTake: useMutation({
      mutationFn: ({ body, targetType, targetWeek }) =>
        db().takes.createTake({ seasonId, body, targetType, targetWeek }),
      onSuccess: invalidate
    }),
    updateTake: useMutation({
      mutationFn: ({ takeId, body }) => db().takes.updateTakeBody({ takeId, body }),
      onSuccess: invalidate
    }),
    deleteTake: useMutation({
      mutationFn: ({ takeId }) => db().takes.deleteTake(takeId),
      onSuccess: invalidate
    }),
    plusOne: useMutation({
      mutationFn: ({ takeId }) => db().takes.addPlusOne({ takeId, seasonId }),
      onSuccess: invalidate
    }),
    withdrawPlusOne: useMutation({
      mutationFn: ({ takeId }) => db().takes.removePlusOne(takeId),
      onSuccess: invalidate
    }),
    resolveTake: useMutation({
      mutationFn: ({ takeId, status }) => db().takes.resolveTake({ takeId, status }),
      onSuccess: invalidate
    }),
    reopenTake: useMutation({
      mutationFn: ({ takeId }) => db().takes.reopenTake(takeId),
      onSuccess: invalidate
    })
  };
}
