/**
 * Asking the league chat. A mutation, not a query: each question is a fresh
 * request whose answer is shown once, so there is nothing to cache or
 * invalidate.
 */

import { useMutation } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';

export function useAskLeague() {
  return useMutation({
    mutationFn: (question) => getDb().leagueChat.askLeague(question)
  });
}
