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
  signInWithOtp: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn()
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
  auth.signUp.mockReset();
  auth.resetPasswordForEmail.mockReset();
  auth.updateUser.mockReset();
  auth.signOut.mockReset();
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

  it('explains the per-address send limit, spam folder included', () => {
    expect(describeMagicLinkError({ code: 'over_email_send_rate_limit', message: 'x' }))
      .toMatch(/spam folder.*wait a minute/i);
    expect(describeMagicLinkError({ message: 'email rate limit exceeded' }))
      .toMatch(/wait a minute/i);
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

describe('the other email senders', () => {
  it('sign-up says whether a confirmation email went out', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null });
    let outcome;
    await act(async () => { outcome = await result.current.signUp('a@b.c', 'pw', 'A'); });
    expect(outcome).toMatchObject({ success: true, emailSent: true });

    auth.signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 't' } }, error: null });
    await act(async () => { outcome = await result.current.signUp('a@b.c', 'pw', 'A'); });
    expect(outcome).toMatchObject({ success: true, emailSent: false });
  });

  it('sign-up and reset map the mailer rate limit to advice', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const limited = { data: {}, error: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' } };

    auth.signUp.mockResolvedValue(limited);
    let outcome;
    await act(async () => { outcome = await result.current.signUp('a@b.c', 'pw', 'A'); });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/spam folder.*wait a minute/i);

    auth.resetPasswordForEmail.mockResolvedValue(limited);
    await act(async () => { outcome = await result.current.resetPassword('a@b.c'); });
    expect(outcome.success).toBe(false);
    expect(outcome.error).toMatch(/wait a minute/i);
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

describe('password recovery', () => {
  it('is pending from the moment the reset link lands, before any auth event', async () => {
    window.history.replaceState(null, '', '/reset-password');
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.passwordRecoveryPending).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.passwordRecoveryPending).toBe(true);
  });

  it('is not pending on any other page', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.passwordRecoveryPending).toBe(false);
  });

  it('becomes pending when Supabase announces PASSWORD_RECOVERY', async () => {
    let listener;
    auth.onAuthStateChange.mockImplementation((cb) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.passwordRecoveryPending).toBe(false);

    await act(async () => {
      await listener('PASSWORD_RECOVERY', { user: { id: 'u1', email: 'a@b.c' } });
    });
    expect(result.current.passwordRecoveryPending).toBe(true);
    expect(result.current.user).toMatchObject({ id: 'u1' });
  });

  it('updatePassword saves, signs out every other session, and ends the recovery', async () => {
    window.history.replaceState(null, '', '/reset-password');
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    auth.signOut.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => { outcome = await result.current.updatePassword('correct-horse-battery'); });

    expect(outcome).toEqual({ success: true, othersSignedOut: true });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'correct-horse-battery' });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(result.current.passwordRecoveryPending).toBe(false);
  });

  it('a saved password is a success even if the other sessions could not be revoked', async () => {
    auth.updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    auth.signOut.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => { outcome = await result.current.updatePassword('correct-horse-battery'); });
    expect(outcome).toEqual({ success: true, othersSignedOut: false });
  });

  it('a refused password stays pending and reports the reason', async () => {
    window.history.replaceState(null, '', '/reset-password');
    auth.updateUser.mockResolvedValue({ data: {}, error: { message: 'Password should be at least 6 characters.' } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => { outcome = await result.current.updatePassword('short'); });
    expect(outcome).toEqual({ success: false, error: 'Password should be at least 6 characters.' });
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(result.current.passwordRecoveryPending).toBe(true);
  });

  it('abandoning the recovery signs out and clears the flag', async () => {
    window.history.replaceState(null, '', '/reset-password');
    auth.signOut.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.abandonPasswordRecovery(); });
    expect(auth.signOut).toHaveBeenCalledWith();
    expect(result.current.passwordRecoveryPending).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('the reset email points at the reset page', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.resetPassword('a@b.c'); });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@b.c', {
      redirectTo: `${window.location.origin}/reset-password`
    });
  });
});
