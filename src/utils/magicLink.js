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
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
    return 'A link was sent to that address recently. Check your inbox, or try again in a minute.'
  }
  return message || 'Could not send a login link'
}
