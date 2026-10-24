/**
 * Asking the league chat. A mutation, not a query: each question is a fresh
 * request whose answer joins the conversation once, so there is nothing to
 * cache or invalidate. `history` is the conversation so far, for follow-ups;
 * `unhinged` is the voice the chat window's switch chose.
 */

import { useMutation } from '@tanstack/react-query';

import { getDb } from '../../services/db/index.js';

export function useAskLeague() {
  return useMutation({
    mutationFn: ({ question, history = [], unhinged = false }) => getDb().leagueChat.askLeague(question, { history, unhinged })
  });
}
