/**
 * The one-time "get OG Jits on your phone?" prompt: whether to offer it, and
 * which step it opens on. Pure; `NotificationsPrompt` renders it.
 *
 * On an iPhone a site cannot add itself to the Home Screen — only the person
 * can, through Safari's Share menu — so the prompt walks them through that
 * and then, inside the installed app, turns notifications on in one tap.
 * Everywhere push works in the browser itself, the one tap is the whole flow.
 */

/** "Not now" quiets the prompt on this device for this long. */
export const PROMPT_SNOOZE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether to offer the prompt.
 *
 * Never to a visitor (the topics are members-only), never once this device
 * is set up, never where push cannot work, and never after a refusal — only
 * iOS Settings can undo that, and asking again would be nagging about
 * something the site cannot fix.
 *
 * @param {object} input
 * @param {boolean} input.isApproved
 * @param {'install'|'unsupported'|'denied'|'off'|'on'|undefined} input.state from `resolvePushState`
 * @param {number|null} [input.snoozedAt] when "Not now" was last pressed on this device (ms)
 * @param {Date} [input.now]
 */
export function shouldOfferPushPrompt({ isApproved, state, snoozedAt = null, now = new Date() }) {
  if (!isApproved) return false;
  if (state !== 'install' && state !== 'off') return false;
  if (Number.isFinite(snoozedAt) && now.getTime() - snoozedAt < PROMPT_SNOOZE_DAYS * DAY_MS) return false;
  return true;
}

/**
 * Which face the prompt opens on.
 *
 *   ask    — an iPhone in Safari: "get it on your phone?", then the guide
 *   finish — the installed Home Screen app: "one last step", one tap
 *   enable — a browser that can receive push as it is: one tap
 */
export function promptStep({ state, isStandalone }) {
  if (state === 'install') return 'ask';
  return isStandalone ? 'finish' : 'enable';
}

/**
 * The snooze lives in localStorage, per member within a browser. It is a
 * preference, not a rule: losing it (private mode, cleared site data) only
 * means the prompt is offered once more. Every access is guarded, because
 * storage can throw.
 */
export const snoozeKey = (userId) => `ogjits:push-prompt-snoozed:${userId}`;

export function readSnooze(storage, userId) {
  try {
    const value = Number(storage?.getItem(snoozeKey(userId)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeSnooze(storage, userId, now = new Date()) {
  try {
    storage?.setItem(snoozeKey(userId), String(now.getTime()));
  } catch {
    // Nothing to do: the prompt will simply be offered again next time.
  }
}
