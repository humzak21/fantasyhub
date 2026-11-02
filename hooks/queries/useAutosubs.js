/**
 * Autosubs: the viewer's own, and whether they get any at all.
 *
 * The gate is here rather than on each roster so that every surface asks the
 * same question. It is only an affordance: `set_autosub()` refuses anything
 * this would have hidden, and RLS returns no row of anybody else's.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useViewer } from '../../src/contexts/ViewerContext.jsx';
import { useMyFranchiseId } from './useFranchiseProfiles.js';
import { useActiveSeason } from './useLeague.js';
import { useActualWeek, useSeasonConfig } from './useWeek.jsx';
import { qk } from './keys.js';

const db = () => getDb();

/**
 * The viewer's team this season, and the week an autosub would be for.
 * `teamId` is null for a viewer with no linked franchise, and `enabled` is false
 * while autosubs are off, so a caller needs nothing else to decide. `week` is
 * null until the season has a start date, for the reason `actualWeek` is on the
 * Schedule tab: a defaulted 1 would be read as a real week.
 */
export function useAutosubAccess() {
  const { isApproved } = useViewer();
  const { data: season } = useActiveSeason();
  const { data: franchiseId } = useMyFranchiseId();
  const config = useSeasonConfig();
  const actualWeek = useActualWeek();

  const team = franchiseId
    ? season?.teams?.find((row) => row.franchiseId === franchiseId) ?? null
    : null;

  return {
    enabled: Boolean(isApproved) && season?.autosubsEnabled === true,
    teamId: team?.id ?? null,
    seasonId: season?.id ?? null,
    nflSeasonYear: season?.espnSeasonYear ?? season?.year ?? null,
    weeklyLimit: season?.autosubWeeklyLimit ?? null,
    week: config?.startDate ? actualWeek : null
  };
}

export function useMyAutosubs(seasonId, week, { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.autosubs.forWeek(seasonId, week),
    queryFn: () => db().autosubs.getMyAutosubs(seasonId, week),
    enabled: enabled && Boolean(seasonId) && Boolean(week)
  });
}

export function useAutosubMutations(seasonId, week) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.autosubs.forWeek(seasonId, week) });

  const setAutosub = useMutation({
    mutationFn: (autosub) => db().autosubs.setAutosub({ ...autosub, week }),
    onSuccess: invalidate
  });

  const removeAutosub = useMutation({
    mutationFn: (id) => db().autosubs.removeAutosub(id),
    onSuccess: invalidate
  });

  return { setAutosub, removeAutosub };
}
