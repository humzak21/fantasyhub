/**
 * Taunts: the viewer's offers (one per daily matchup fact) and the press that
 * sends one. Sending writes the answer straight into the cache, so the button
 * turns to "Taunted" the moment the database says so.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { useAuth } from '../../src/contexts/AuthContext.jsx';
import { qk } from './keys.js';

const db = () => getDb();

export function useMyTaunts({ enabled = true } = {}) {
  const { user } = useAuth();
  return useQuery({
    queryKey: qk.viewer.taunts(user?.id ?? null),
    queryFn: () => db().notifications.getMyTaunts(),
    enabled: Boolean(user?.id) && enabled,
    refetchOnWindowFocus: true,
    staleTime: 30_000
  });
}

export function useSendTaunt() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = qk.viewer.taunts(user?.id ?? null);

  return useMutation({
    mutationFn: (id) => db().notifications.sendTaunt(id),
    onSuccess: (result, id) => {
      if (result !== 'sent' && result !== 'already_sent') return;
      queryClient.setQueryData(key, (rows) =>
        rows?.map((row) => (row.id === id && !row.sentAt ? { ...row, sentAt: new Date() } : row)));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key })
  });
}
