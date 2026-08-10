/**
 * The ESPN import log, for the admin settings screen.
 *
 * There used to be mutations here — assign an import to a season, reject it —
 * because a fetched schedule sat in staging tables until an admin approved it
 * in the browser. `scripts/sync-schedule.js` now writes teams and games
 * directly, so the browser has nothing to approve and nothing to write: ESPN
 * needs credentials that only the scripts hold. What is left is one read.
 */

import { useQuery } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';
import { qk } from './keys.js';

const db = () => getDb();

export function useScheduleImports({ limit = 25 } = {}) {
  return useQuery({
    queryKey: qk.schedule.history(limit),
    queryFn: () => db().schedule.getScheduleImports({ limit })
  });
}
