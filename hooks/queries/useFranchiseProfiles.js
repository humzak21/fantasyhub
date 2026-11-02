/**
 * Franchise profiles: what each franchise says about itself, and who may say
 * it. The first two are read by every team chip and the profile page; the rest
 * are writes and the admin's list.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useViewer } from '../../src/contexts/ViewerContext.jsx';
import { qk } from './keys.js';

const db = () => getDb();

const STABLE = { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false };

/**
 * `{ [franchiseId]: profile }`. Disabled for anyone but an approved member, so
 * a signed-out browser never issues the read, and RLS would answer nothing.
 * Stable reference when nothing has changed: every `TeamAvatar` reads it.
 */
export function useFranchiseProfiles() {
  const { isApproved } = useViewer();
  return useQuery({
    queryKey: qk.profiles.list(),
    queryFn: () => db().franchiseProfiles.getFranchiseProfiles(),
    enabled: Boolean(isApproved),
    ...STABLE
  });
}

/** The franchise this viewer may edit. `null` for an account with no link. */
export function useMyFranchiseId() {
  const { user, isApproved } = useViewer();
  return useQuery({
    queryKey: qk.viewer.franchise(user?.id ?? null),
    queryFn: () => db().franchiseProfiles.getMyFranchiseId(user.id),
    enabled: Boolean(user?.id && isApproved),
    ...STABLE
  });
}

/**
 * Save a profile, uploading a new avatar first if one was chosen. The replaced
 * file is removed only once the row no longer points at it, and that removal
 * is best effort.
 */
export function useSaveFranchiseProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ franchiseId, patch, avatarBlob = null, replacedAvatarPath = null }) => {
      const nextPatch = { ...patch };
      if (avatarBlob) {
        nextPatch.avatarPath = await db().franchiseProfiles.uploadAvatar(franchiseId, avatarBlob);
        nextPatch.avatarSource = 'upload';
      }
      const saved = await db().franchiseProfiles.saveFranchiseProfile(franchiseId, nextPatch);
      if (replacedAvatarPath && replacedAvatarPath !== nextPatch.avatarPath) {
        await db().franchiseProfiles.removeAvatarFile(replacedAvatarPath);
      }
      return saved;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.profiles.list() })
  });
}

/** Every account's link, for Settings -> Franchises. Admin only. */
export function useFranchiseAccounts() {
  const { isAdmin } = useViewer();
  return useQuery({
    queryKey: qk.profiles.accounts(),
    queryFn: () => db().franchiseProfiles.listFranchiseAccounts(),
    enabled: Boolean(isAdmin)
  });
}

/** Link or unlink. The linked person's own answer changes too, so that key goes as well. */
export function useSetFranchiseAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (link) => db().franchiseProfiles.setFranchiseAccount(link),
    onSuccess: (_result, { userId }) => {
      queryClient.invalidateQueries({ queryKey: qk.profiles.accounts() });
      queryClient.invalidateQueries({ queryKey: qk.viewer.franchise(userId) });
    }
  });
}
