import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * The client module is replaced outright: the real `getAnonClient()` would
 * either be null (no env) or open a GoTrue session over a network jsdom does
 * not have. Every `supabase.auth.*` call the provider makes is a spy here.
 */
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn()
}));

vi.mock('../../../services/supabaseClient.js', () => ({
  supabase: { auth }
}));

vi.mock('../../utils/adminUtils', () => ({
  useIsAdmin: () => false
}));

import { AuthProvider, useAuth } from '../AuthContext.jsx';
import { readAuthLinkError, describeMagicLinkError } from '../../utils/magicLink.js';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

beforeEach(() => {
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  auth.signInWithOtp.mockReset();
  window.history.replaceState(null, '', '/pickems');
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('readAuthLinkError', () => {
  it('ignores an empty or successful fragment', () => {
    expect(readAuthLinkError('')).toBeNull();
    expect(readAuthLinkError('#')).toBeNull();
    expect(readAuthLinkError('#access_token=abc&refresh_token=def&type=magiclink')).toBeNull();
  });

  it('names an expired link in plain words', () => {
    const hash = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    expect(readAuthLinkError(hash)).toMatch(/expired/i);
    expect(readAuthLinkError(hash)).toMatch(/request a new one/i);
  });

  it('falls back to the description Supabase sent', () => {
    expect(readAuthLinkError('#error=server_error&error_description=Something+odd')).toBe('Something odd');
  });
});

describe('describeMagicLinkError', () => {
  it('explains an unknown address as "no account"', () => {
    expect(describeMagicLinkError({ code: 'otp_disabled', message: 'Signups not allowed for otp' }))
      .toMatch(/no account uses that email/i);
    expect(describeMagicLinkError({ message: 'Signups not allowed for otp' }))
      .toMatch(/no account uses that email/i);
  });

  it('explains the per-address send limit', () => {
    expect(describeMagicLinkError({ code: 'over_email_send_rate_limit', message: 'x' }))
      .toMatch(/try again in a minute/i);
  });

  it('passes anything else through', () => {
    expect(describeMagicLinkError({ message: 'Network down' })).toBe('Network down');
  });
});

describe('signInWithMagicLink', () => {
  it('asks Supabase for a link to an existing account, back to the current page', async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithMagicLink('  Someone@Example.com ');
    });

    expect(outcome).toEqual({ success: true });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'Someone@Example.com',
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/pickems`
      }
    });
  });

  it('never flips the provider-wide loading flag', async () => {
    let resolve;
    auth.signInWithOtp.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let pending;
    act(() => { pending = result.current.signInWithMagicLink('a@b.c'); });
    expect(result.current.loading).toBe(false);

    await act(async () => { resolve({ data: {}, error: null }); await pending; });
  });

  it('reports a mapped error instead of throwing', async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: 'otp_disabled', message: 'Signups not allowed for otp' }
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => { outcome = await result.current.signInWithMagicLink('nobody@x.y'); });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/no account uses that email/i);
  });
});

describe('a failed magic link on the URL', () => {
  it('surfaces the reason and strips the fragment', async () => {
    window.history.replaceState(
      null, '', '/pickems#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authLinkError).toMatch(/expired/i);
    expect(window.location.hash).toBe('');
    expect(window.location.pathname).toBe('/pickems');

    act(() => result.current.clearAuthLinkError());
    expect(result.current.authLinkError).toBeNull();
  });

  it('is null when the URL carries nothing', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.authLinkError).toBeNull();
  });
});
