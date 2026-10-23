/**
 * Asking the league chat (supabase/functions/league-chat) a question.
 *
 * The function holds the model key and the fact cards; the browser sends the
 * question with the member's session and gets back an answer and the cards it
 * came from. Approved members only — the function checks, not this file.
 */

import { createLogger } from './logger.js';

const log = createLogger('db:leagueChat');

/**
 * @param {string} question
 * @returns {Promise<{ kind: 'answer'|'facts'|'none'|'limit', text: string,
 *   sources: Array<{ text: string, link: string|null }>, asOf: string|null }>}
 */
export async function askLeague(ctx, question) {
  const { data, error } = await ctx.client.functions.invoke('league-chat', { body: { question } });
  if (error) {
    // A non-2xx carries the function's own message in its body.
    let message = error.message;
    try {
      const body = await error.context?.json?.();
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    log.warn(`league chat failed: ${message}`);
    throw new Error(message);
  }
  return {
    kind: data?.kind ?? 'none',
    text: String(data?.text ?? ''),
    sources: Array.isArray(data?.sources) ? data.sources : [],
    asOf: data?.asOf ?? null
  };
}
