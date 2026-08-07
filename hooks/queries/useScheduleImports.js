/**
 * ESPN schedule-import hooks, for the admin settings screen.
 *
 * `ScheduleImportManager` was the last component reaching into the mega-hook
 * for a `dataManager` plus four passthrough callbacks and an `initialized`
 * flag, just to run two reads and two writes.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

export function usePendingScheduleImports() {
  return useQuery({
    queryKey: qk.schedule.pendingImports(),
    queryFn: () => db().schedule.getPendingScheduleImports()
  });
}

export function useScheduleImportDetails(importId) {
  return useQuery({
    queryKey: qk.schedule.importDetails(importId),
    queryFn: () => db().schedule.getScheduleImportDetails(importId),
    enabled: Boolean(importId)
  });
}

export function useScheduleImportMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.schedule.all });

  const assignToSeason = useMutation({
    mutationFn: ({ importId, seasonId, notes = null }) =>
      db().schedule.assignScheduleToSeason(importId, seasonId, notes),
    // Assigning a schedule writes games, so the season's games go stale too.
    onSuccess: (_result, { seasonId }) =>
      Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: qk.games.season(seasonId) })
      ])
  });

  const reject = useMutation({
    mutationFn: ({ importId, notes = null }) => db().schedule.rejectScheduleImport(importId, notes),
    onSuccess: invalidate
  });

  return { assignToSeason, reject };
}
