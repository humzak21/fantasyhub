import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '../../../test/renderWithProviders.jsx';
import { LoginDropdown } from '../LoginDropdown.jsx';

/**
 * Same arrangement as DisplayNamePrompt.test.jsx: the auth context is stubbed
 * so the real provider never calls `supabase.auth.getSession()` over a
 * network jsdom does not have, and the providers stay in the tree as
 * passthroughs so the component still renders through renderWithProviders.
 */
let authValue;

vi.mock('../../../contexts/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authValue
}));

vi.mock('../../../contexts/ViewerContext.jsx', () => ({
  ViewerProvider: ({ children }) => children,
  useViewer: () => ({ user: null, isAuthenticated: false, isAdmin: false, teamOwnerNames: [] })
}));

const signedOut = (overrides = {}) => ({
  user: null,
  signIn: vi.fn().mockResolvedValue({ success: true }),
  signUp: vi.fn().mockResolvedValue({ success: true }),
  signOut: vi.fn(),
  resetPassword: vi.fn().mockResolvedValue({ success: true }),
  signInWithMagicLink: vi.fn().mockResolvedValue({ success: true }),
  authLinkError: null,
  clearAuthLinkError: vi.fn(),
  ...overrides
});

beforeEach(() => {
  localStorage.clear();
  authValue = signedOut();
});

const openLogin = async (user) => {
  await user.click(screen.getByRole('button', { name: /login/i }));
  await screen.findByLabelText('Email');
};

const magicButton = () => screen.queryByRole('button', { name: /email me a login link/i });

describe('LoginDropdown magic link', () => {
  it('offers a link beneath the password form, in sign-in mode only', async () => {
    const user = userEvent.setup();
    render(<LoginDropdown />);
    await openLogin(user);

    expect(magicButton()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /don't have an account/i }));
    expect(magicButton()).not.toBeInTheDocument();
  });

  it('carries the typed email across and sends the link', async () => {
    const user = userEvent.setup();
    render(<LoginDropdown />);
    await openLogin(user);

    await user.type(screen.getByLabelText('Email'), 'humza@example.com');
    await user.click(magicButton());

    const field = await screen.findByLabelText('Email');
    expect(field).toHaveValue('humza@example.com');
    expect(screen.getByText('Email Me a Login Link')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /send login link/i }));

    expect(authValue.signInWithMagicLink).toHaveBeenCalledWith('humza@example.com');
    await screen.findByText('Check your email');
    expect(screen.getByText('humza@example.com')).toBeInTheDocument();
    expect(screen.getByTestId('email-sent-note')).toHaveTextContent(/spam folder/i);
  });

  it('warns about spam and rate limits after a password reset is sent', async () => {
    const user = userEvent.setup();
    render(<LoginDropdown />);
    await openLogin(user);
    await user.click(screen.getByRole('button', { name: /forgot password/i }));
    await user.type(screen.getByLabelText('Email'), 'humza@example.com');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await screen.findByText('Email Sent!');
    expect(screen.getByTestId('email-sent-note')).toHaveTextContent(/wait a minute/i);
  });

  const signUpThrough = async (user) => {
    await openLogin(user);
    await user.click(screen.getByRole('button', { name: /don't have an account/i }));
    // The popover moves focus to Name 100ms after the mode flips. Typing
    // before that lands means the jump can fall mid-email under load, splitting
    // the address across two fields and failing the form's own validation.
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());
    await user.type(screen.getByLabelText('Name'), 'Humza');
    await user.type(screen.getByLabelText('Email'), 'humza@example.com');
    await user.type(screen.getByLabelText('Password'), 'hunter22');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await screen.findByText('Account Created!');
  };

  // Three typed fields make sign-up the slowest path in the file: alone it
  // runs in about a second, but under a full-suite load it blows through
  // vitest's 5s default and reads as a hang rather than as slow typing.
  const SIGN_UP_TIMEOUT = 20000;

  it('mentions the inbox after sign-up when a confirmation email went out', async () => {
    authValue = signedOut({
      signUp: vi.fn().mockResolvedValue({ success: true, emailSent: true, message: 'Please check your email' })
    });
    render(<LoginDropdown />);
    await signUpThrough(userEvent.setup());
    expect(screen.getByTestId('email-sent-note')).toBeInTheDocument();
  }, SIGN_UP_TIMEOUT);

  it('says nothing about the inbox when sign-up sent no email', async () => {
    authValue = signedOut({
      signUp: vi.fn().mockResolvedValue({ success: true, emailSent: false })
    });
    render(<LoginDropdown />);
    await signUpThrough(userEvent.setup());
    expect(screen.queryByTestId('email-sent-note')).not.toBeInTheDocument();
  }, SIGN_UP_TIMEOUT);

  it('shows the sender\'s error inline', async () => {
    authValue = signedOut({
      signInWithMagicLink: vi.fn().mockResolvedValue({ success: false, error: 'No account uses that email.' })
    });
    const user = userEvent.setup();
    render(<LoginDropdown />);
    await openLogin(user);
    await user.click(magicButton());
    await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
    await user.click(screen.getByRole('button', { name: /send login link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No account uses that email.');
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument();
  });

  it('opens on the magic-link face when a link failed on the URL', async () => {
    authValue = signedOut({ authLinkError: 'That login link has expired. Request a new one.' });
    render(<LoginDropdown />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/i);
    expect(screen.getByRole('button', { name: /send login link/i })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'h');
    await waitFor(() => expect(authValue.clearAuthLinkError).toHaveBeenCalled());
  });

  it('returns to sign-in from the magic-link face', async () => {
    const user = userEvent.setup();
    render(<LoginDropdown />);
    await openLogin(user);
    await user.click(magicButton());
    await user.click(screen.getByRole('button', { name: /back to sign in/i }));

    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(magicButton()).toBeInTheDocument();
  });
});
