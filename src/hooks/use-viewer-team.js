import { useMemo } from 'react';

import { useViewer } from '../contexts/ViewerContext.jsx';
import { useActiveSeason, useSeasonTeams } from '../../hooks/queries/index.js';
import { resolveViewerTeam } from '../../utils/viewerTeam.js';

/**
 * The viewer's own team in the active season, or null.
 *
 * Reads the same cache entries the shell already holds (the active season and
 * its teams), so it costs no request. `isLoading` is true until both the
 * session and the teams are known — a null team while either is in flight is
 * "not yet", not "no team", and the home page must not draw the no-team
 * scoreboard for a member on a cold load and then flip to their matchup.
 *
 * @returns {{ team: Object|null, isLoading: boolean }}
 */
export function useViewerTeam() {
  const { user, teamOwnerNames, isAuthLoading, isApprovalLoading } = useViewer();
  const { data: season, isPending: seasonPending } = useActiveSeason();
  const seasonId = season?.id ?? null;
  const { data: teams, isPending: teamsPending } = useSeasonTeams(seasonId);

  const team = useMemo(
    () => resolveViewerTeam(teams ?? [], user, teamOwnerNames),
    [teams, user, teamOwnerNames]
  );

  return {
    team,
    isLoading: Boolean(
      isAuthLoading || isApprovalLoading || seasonPending || (seasonId && teamsPending)
    )
  };
}

export default useViewerTeam;
