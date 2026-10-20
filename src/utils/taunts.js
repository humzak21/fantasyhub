/**
 * Taunts: a member can send today's matchup fact to the opponent it is about,
 * written to them. The rules here mirror the database's
 * (20261020120000_matchup_taunts.sql), so the app never offers a button whose
 * only outcome is a refusal.
 */

/** How long an offer can be used. `send_taunt()` holds the same window. */
export const TAUNT_WINDOW_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;

/** 'sent', 'expired' or 'open' — what the Taunt button should be. */
export function tauntState(taunt, now = new Date()) {
  if (!taunt) return 'unknown';
  if (taunt.sentAt) return 'sent';
  if (now.getTime() - new Date(taunt.createdAt).getTime() >= TAUNT_WINDOW_HOURS * HOUR_MS) return 'expired';
  return 'open';
}

/** The taunt an alert links to (`/alerts?taunt=<id>`), or null. */
export function tauntIdFromUrl(url) {
  if (!url) return null;
  try {
    return new URL(url, 'https://ogjits.com').searchParams.get('taunt');
  } catch {
    return null;
  }
}

/** What to tell the member after `send_taunt()` answers. */
export function describeTauntResult(result, opponentName = 'your opponent') {
  switch (result) {
    case 'sent':
      return `Taunt sent. ${opponentName} will get it in a minute.`;
    case 'already_sent':
      return `You already taunted ${opponentName} with this one.`;
    case 'expired':
      return 'This taunt has expired. Each fact can be sent for two days.';
    default:
      return 'That taunt could not be found.';
  }
}
