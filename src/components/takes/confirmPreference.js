/**
 * "Don't show this again" for the Hell Nah confirmation.
 *
 * Its own module rather than an export beside the dialog: a file that exports
 * both a component and a function is a file Fast Refresh cannot hot-reload,
 * and these two are read by `TakesManager` — which decides whether to open the
 * dialog at all — as much as by the dialog itself.
 *
 * **This is a preference, not a rule**, and the distinction is the whole of why
 * it may live in `localStorage`. It suppresses an explanation; it changes
 * nothing about what a Hell Nah costs, when the window closes, or what the
 * database will accept. Per browser is therefore fine, and per user within a
 * browser is the point — a league where people check the board on whoever's
 * laptop is open should not have one member's choice silence another's warning.
 */

import { storage } from '../../lib/utils';

const SKIP_PREFIX = 'takes:skipHellNahConfirm:';

const skipKey = (userId) => `${SKIP_PREFIX}${userId}`;

/**
 * Should the dialog be shown? True for a signed-out viewer, who cannot fade
 * anything anyway, and true whenever storage is unreadable — the failure that
 * shows the dialog is better than the one that skips it.
 */
export function shouldConfirmHellNah(userId) {
  if (!userId) return true;
  return storage.get(skipKey(userId), false) !== true;
}

/**
 * Remember the ticked box. Only ever called with it ticked: there is no path
 * that un-suppresses, because the only way to ask for the dialog back would be
 * a setting nobody would go looking for.
 */
export function suppressHellNahConfirm(userId) {
  if (!userId) return;
  storage.set(skipKey(userId), true);
}
