/**
 * The app's QueryClient.
 *
 * Defaults are tuned for a league that changes a handful of times a week, not
 * a trading terminal: data stays fresh for a minute, refetch-on-focus is off
 * (it was one of the sources of the full-screen reload flicker), and failed
 * reads retry once rather than the default three times, so a genuine
 * permissions error surfaces quickly instead of after three round trips.
 */

import { QueryClient } from '@tanstack/react-query';
import { DbError, DbErrorKind } from '../../services/db/index.js';

/** Retrying these just delays an error the caller already has its answer for. */
const TERMINAL_KINDS = [
  DbErrorKind.NOT_FOUND,
  DbErrorKind.AUTH,
  DbErrorKind.PERMISSION,
  DbErrorKind.MISSING_TABLE,
  DbErrorKind.CONFIG,
  DbErrorKind.DUPLICATE,
  DbErrorKind.FOREIGN_KEY
];

const isTerminal = (error) => error instanceof DbError && TERMINAL_KINDS.includes(error.kind);

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => !isTerminal(error) && failureCount < 1
      },
      mutations: {
        retry: false
      }
    }
  });
}

export default createQueryClient;
