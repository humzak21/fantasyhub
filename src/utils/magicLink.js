/**
 * Pure helpers for the magic-link sign-in path. They live apart from
 * AuthContext so the context file exports only React things (fast refresh)
 * and so a test can exercise them without a provider.
 */

/**
 * Read the error a magic link comes back with.
 *
 * An expired or already-used link redirects here with
 * `#error=access_denied&error_code=otp_expired&error_description=...`.
 * supabase-js parses that fragment during `initialize()` and returns the error
 * from it — but `getSession()` discards that result, so without this the
 * member would land on the page signed out with nothing to say why. Reads the
 * fragment once and hands back a message; the caller strips the fragment.
 * Returns null for any hash that is not an auth error (including the
 * `#access_token=` of a successful link, which the client consumes itself).
 */
export function readAuthLinkError(hash) {
  if (!hash || hash.length < 2) return null
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const description = params.get('error_description')
  const code = params.get('error_code')
  if (!description && !code && !params.get('error')) return null
  if (code === 'otp_expired') {
    return 'That login link has expired or was already used. Request a new one.'
  }
  return description || 'That login link could not be used. Request a new one.'
}

/**
 * Supabase's built-in mailer refuses a second email to one address inside
 * sixty seconds and caps project-wide sends per hour. Every email path here —
 * sign-up confirmation, password reset, login link — can hit it, and the raw
 * message ("email rate limit exceeded") does not say what to do.
 */
export const EMAIL_RATE_LIMIT_MESSAGE =
  'An email was sent to that address recently. Check your inbox and spam folder, then wait a minute before trying again.'

/** The rate-limit message when `error` is one, otherwise null. */
export function describeEmailRateLimit(error) {
  const code = error?.code
  const message = error?.message || ''
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
    return EMAIL_RATE_LIMIT_MESSAGE
  }
  return null
}

/**
 * Turn a `signInWithOtp` failure into something a member can act on. The two
 * cases that are not the member's fault get a specific sentence; anything
 * else keeps Supabase's wording.
 */
export function describeMagicLinkError(error) {
  const code = error?.code
  const message = error?.message || ''
  if (code === 'otp_disabled' || /signups not allowed/i.test(message)) {
    return 'No account uses that email. Sign up with a password first.'
  }
  return describeEmailRateLimit(error) || message || 'Could not send a login link'
}
