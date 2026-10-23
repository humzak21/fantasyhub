/**
 * Asking the league chat. A mutation, not a query: each question is a fresh
 * request whose answer joins the conversation once, so there is nothing to
 * cache or invalidate. `history` is the conversation so far, for follow-ups.
 */

import { useMutation } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';

export function useAskLeague() {
  return useMutation({
    mutationFn: ({ question, history = [] }) => getDb().leagueChat.askLeague(question, { history })
  });
}
