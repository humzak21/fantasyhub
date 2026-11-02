import { createContext, useContext, useMemo } from 'react';

import { useFranchiseProfiles } from '../../hooks/queries/index.js';
import { canViewFullData } from '../components/history/utils/privacyHelpers.js';
import { ownerKey } from '../../utils/ownerAliases.js';
import { useViewer } from './ViewerContext.jsx';

/**
 * What the viewer may see of franchises, for the two primitives that draw them:
 * each one's avatar for `TeamAvatar`, and whether a name can link to a profile
 * for `TeamLink`.
 *
 * A context rather than hooks inside them, because those are the most widely
 * drawn things on the site: rendered with no provider (a test, a page outside
 * the shell) a chip keeps its initials, a name stays plain, and nothing is
 * asked for.
 *
 * The provider hands out nothing to a viewer who sees masked names. A face on a
 * masked row would unmask it, and initials are already keyed on the masked name
 * for the same reason.
 */
const NO_AVATARS = { byFranchise: new Map(), byOwner: new Map() };

export const FranchiseAvatarsContext = createContext({ ...NO_AVATARS, canOpenProfiles: false });

export function FranchiseAvatarsProvider({ children }) {
  const { user, isAdmin, isApproved, teamOwnerNames } = useViewer();
  const { data: profiles } = useFranchiseProfiles();
  const fullData = canViewFullData(user, isAdmin, teamOwnerNames);

  const value = useMemo(() => {
    const canOpenProfiles = Boolean(isApproved);
    if (!fullData || !profiles) return { ...NO_AVATARS, canOpenProfiles };
    const withAvatars = Object.values(profiles).filter((profile) => profile.avatarUrl);
    return {
      canOpenProfiles,
      byFranchise: new Map(withAvatars.map((profile) => [profile.franchiseId, profile.avatarUrl])),
      byOwner: new Map(
        withAvatars
          .filter((profile) => profile.ownerName)
          .map((profile) => [ownerKey(profile.ownerName), profile.avatarUrl])
      )
    };
  }, [fullData, isApproved, profiles]);

  return <FranchiseAvatarsContext.Provider value={value}>{children}</FranchiseAvatarsContext.Provider>;
}

/**
 * A team's avatar, or null for its initials. Franchise first; the owner covers
 * the rows that carry no franchise id, as it does for `getTeamColorKey`.
 */
export function useTeamAvatarUrl(team) {
  const { byFranchise, byOwner } = useContext(FranchiseAvatarsContext);
  if (!team || byFranchise.size === 0) return null;
  const franchiseId = team.franchiseId ?? team.franchise_id;
  if (franchiseId) return byFranchise.get(franchiseId) ?? null;
  const owner = team.ownerName ?? team.owner_name ?? team.owner;
  return owner ? byOwner.get(ownerKey(owner)) ?? null : null;
}

/** Can this viewer open a profile? Profiles are for approved members. */
export function useCanOpenProfiles() {
  return useContext(FranchiseAvatarsContext).canOpenProfiles;
}
