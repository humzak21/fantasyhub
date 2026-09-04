/**
 * Pure helpers for the password-reset path. Apart from AuthContext for the
 * reason magicLink.js is: the context file exports only React things (fast
 * refresh), and a test can pin these without a provider.
 */

/** Where `resetPassword` sends the link, and the page that finishes the reset. */
export const RESET_PASSWORD_PATH = '/reset-password';

/**
 * Is this the page a password-reset link lands on?
 *
 * The recovery link redirects to `/reset-password#access_token=…`. supabase-js
 * consumes the fragment at client construction — before React mounts, and so
 * before AuthProvider has subscribed to auth events — and announces it as
 * `PASSWORD_RECOVERY` on a `setTimeout(0)`. In practice the subscriber is
 * registered by then, because the client first round-trips to `/user`, but a
 * cold cache on a fast connection is not a guarantee. The path is: the link
 * is the only thing that sends anyone here, so landing here *is* the event.
 *
 * @param {string} [pathname] defaults to the current location
 */
export const isRecoveryLanding = (pathname) => {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '');
  return path === RESET_PASSWORD_PATH;
};

/** The floor this app asks for, whatever the Supabase dashboard is set to. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * The client-side rule for a new password. Supabase enforces its own minimum
 * (dashboard → Authentication → Providers → Email) and its error is shown
 * as-is, so a stricter server setting still reads correctly; this is the
 * floor regardless. Six characters — the dashboard default — is shorter than
 * this league's team names.
 *
 * @param {string} password
 * @param {string} confirm
 * @returns {string|null} an error message, or null if the pair is acceptable
 */
export function validateNewPassword(password, confirm) {
  if (!password) return 'Enter a new password.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}
