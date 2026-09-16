import { useMemo } from 'react';

import { canViewFullData, getMaskedFranchiseName } from './privacyHelpers';

/**
 * How a franchise is named and drawn for this viewer, by id.
 *
 * `name` is the masked name for a viewer who may not see the league.
 * `avatar` is the object `TeamAvatar` takes: initials come from the owner, so
 * a masked viewer's avatar is keyed on the masked name instead, while the
 * colour — keyed on the franchise id — still tells franchises apart.
 *
 * @param {object[]} franchises - `useHistoryFranchises()` rows
 */
export function useFranchiseIdentity(franchises, user, isAdmin, teamOwnerNames) {
  return useMemo(() => {
    const byId = new Map(franchises.map((franchise) => [franchise.id, franchise]));
    const fullData = canViewFullData(user, isAdmin, teamOwnerNames);
    const name = (id) => getMaskedFranchiseName(byId.get(id) ?? { id }, user, isAdmin, teamOwnerNames);
    return {
      name,
      avatar: (id) => {
        const franchise = byId.get(id);
        return fullData && franchise
          ? { franchiseId: id, owner_name: franchise.owner_name }
          : { franchiseId: id, name: name(id) };
      }
    };
  }, [franchises, user, isAdmin, teamOwnerNames]);
}
