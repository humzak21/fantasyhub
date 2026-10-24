import { canViewFullData, getMaskedFranchiseName } from '../utils/privacyHelpers';

/**
 * How the record book names and draws the rows' owners, for this viewer.
 *
 * `franchiseName` and `avatar` mask through `getMaskedFranchiseName` /
 * `canViewFullData`; `teamName` reads the book's own team index. Shared by the
 * Records tab and the home page's record cards, so a row is never named one
 * way on one page and another way on the other.
 *
 * @param {object} args
 * @param {object[]} args.franchises - `useHistoryFranchises()` rows
 * @param {object|null} args.book - from `buildRecordBook`
 */
export function buildRecordIdentity({ franchises = [], book = null, user = null, isAdmin = false, teamOwnerNames = [] }) {
  const byId = new Map(franchises.map((franchise) => [franchise.id, franchise]));
  const fullData = canViewFullData(user, isAdmin, teamOwnerNames);
  const franchiseName = (id) =>
    getMaskedFranchiseName(byId.get(id) ?? (id ? { id } : null), user, isAdmin, teamOwnerNames);

  return {
    franchiseName,
    teamName: (teamId) => {
      const team = book?.teams?.[teamId];
      if (!team) return null;
      return fullData ? team.name : `Team ${String(team.id).substring(0, 8)}`;
    },
    // Initials come from the owner, so a masked viewer's avatar is keyed on
    // the masked name instead: the colour still tells franchises apart.
    avatar: (id) => {
      const franchise = byId.get(id);
      return fullData && franchise
        ? { franchiseId: id, owner_name: franchise.owner_name }
        : { franchiseId: id, name: franchiseName(id) };
    }
  };
}

export default buildRecordIdentity;
