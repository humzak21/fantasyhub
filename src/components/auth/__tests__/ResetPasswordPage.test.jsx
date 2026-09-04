import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '../../../test/renderWithProviders.jsx';
import ResetPasswordPage from '../ResetPasswordPage.jsx';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '../../../utils/passwordReset.js';

/**
 * Same arrangement as LoginDropdown.test.jsx: the auth context is a stub so
 * nothing here opens a GoTrue session, and the providers stay in the tree as
 * passthroughs.
 */
let authValue;
const navigate = vi.fn();

vi.mock('../../../contexts/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authValue
}));

vi.mock('../../../contexts/ViewerContext.jsx', () => ({
  ViewerProvider: ({ children }) => children,
  useViewer: () => ({ user: null, isAuthenticated: false, isAdmin: false, teamOwnerNames: [] })
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => navigate };
});

const signedIn = (overrides = {}) => ({
  user: { id: 'u1', email: 'member@example.com' },
  authLinkError: null,
  clearAuthLinkError: vi.fn(),
  updatePassword: vi.fn().mockResolvedValue({ success: true, othersSignedOut: true }),
  abandonPasswordRecovery: vi.fn().mockResolvedValue({ success: true }),
  ...overrides
});

const fill = async (user, password, confirm = password) => {
  await user.type(screen.getByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm new password'), confirm);
};

const GOOD = 'correct-horse-battery';

beforeEach(() => {
  navigate.mockReset();
  authValue = signedIn();
});

describe('validateNewPassword', () => {
  it('asks for a floor length and a matching confirmation', () => {
    expect(validateNewPassword('', '')).toMatch(/enter a new password/i);
    expect(validateNewPassword('a'.repeat(MIN_PASSWORD_LENGTH - 1), 'a'.repeat(MIN_PASSWORD_LENGTH - 1)))
      .toMatch(new RegExp(`at least ${MIN_PASSWORD_LENGTH}`));
    expect(validateNewPassword(GOOD, `${GOOD}x`)).toMatch(/do not match/i);
    expect(validateNewPassword(GOOD, GOOD)).toBeNull();
  });
});

describe('ResetPasswordPage', () => {
  it('names the account the link signed in and offers only a new password or sign out', () => {
    render(<ResetPasswordPage />);

    expect(screen.getByText(/choose a new password/i)).toBeInTheDocument();
    expect(screen.getByText('member@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save new password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out instead/i })).toBeInTheDocument();
    // No "skip" — a recovery session that keeps the old password is the bug.
    expect(screen.queryByRole('button', { name: /skip/i })).not.toBeInTheDocument();
  });

  it('refuses a mismatched confirmation without calling the API', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await fill(user, GOOD, `${GOOD}!`);
    await user.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(authValue.updatePassword).not.toHaveBeenCalled();
  });

  it('saves the password, reports the other sessions signed out, and goes home', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await fill(user, GOOD);
    await user.click(screen.getByRole('button', { name: /save new password/i }));

    await waitFor(() => expect(authValue.updatePassword).toHaveBeenCalledWith(GOOD));
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
    expect(screen.getByText(/every other device has been signed out/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to the league/i }));
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('says so when the other sessions could not be revoked', async () => {
    const user = userEvent.setup();
    authValue = signedIn({
      updatePassword: vi.fn().mockResolvedValue({ success: true, othersSignedOut: false })
    });
    render(<ResetPasswordPage />);

    await fill(user, GOOD);
    await user.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByText(/could not be signed out/i)).toBeInTheDocument();
  });

  it('shows the server error when the password is refused', async () => {
    const user = userEvent.setup();
    authValue = signedIn({
      updatePassword: vi.fn().mockResolvedValue({ success: false, error: 'Password should be at least 12 characters.' })
    });
    render(<ResetPasswordPage />);

    await fill(user, GOOD);
    await user.click(screen.getByRole('button', { name: /save new password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 12 characters/i);
  });

  it('"sign out instead" drops the recovery session and goes home', async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.click(screen.getByRole('button', { name: /sign out instead/i }));

    await waitFor(() => expect(authValue.abandonPasswordRecovery).toHaveBeenCalled());
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('explains a failed link and leaves the error for the login popover', async () => {
    const user = userEvent.setup();
    authValue = signedIn({
      user: null,
      authLinkError: 'That login link has expired or was already used. Request a new one.'
    });
    render(<ResetPasswordPage />);

    expect(screen.getByText(/did not work/i)).toBeInTheDocument();
    expect(screen.getByText(/already used/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to the league/i }));
    expect(authValue.clearAuthLinkError).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('has nothing to reset for a signed-out visitor with no link', () => {
    authValue = signedIn({ user: null });
    render(<ResetPasswordPage />);

    expect(screen.getByText(/nothing to reset/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });
});
