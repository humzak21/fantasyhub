/**
 * Settings renders as a tab, not as a page of its own.
 *
 * It used to mount outside the shell with its own header row and a Back
 * button that called `navigate(-1)` — the shell's nav and week control were
 * gone while you were here, and leaving meant the browser's history. The
 * shell renders it now, inside `main`, beside every other tab. What is worth
 * pinning: the page header is the shared one, there is no Back control, and
 * a viewer with no session gets a plain empty state rather than a "Go Back".
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const auth = {
  user: { id: 'member-1', email: 'member@example.com', user_metadata: { full_name: 'Arya Shah' } },
  isAuthenticated: true,
  isAdmin: false,
  loading: false,
  updatePassword: vi.fn()
};

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    users: {
      isParlayCommissioner: vi.fn(async () => false),
      isApprovedMember: vi.fn(async () => true),
      listMemberApprovals: vi.fn(async () => [])
    },
    seasons: { getActiveSeason: async () => null, getSeasons: async () => [] }
  })
}));

const { UserSettingsPage } = await import('../UserSettingsPage.jsx');

describe('UserSettingsPage', () => {
  it('uses the shared page header and offers no Back control', () => {
    renderWithProviders(<UserSettingsPage />, { initialEntries: ['/settings'] });

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back/i })).not.toBeInTheDocument();
    // The profile section is the member's own and is open by default.
    expect(screen.getByLabelText(/Full Name/)).toHaveValue('Arya Shah');
  });

  it('shows the admin sections only to the admin', () => {
    renderWithProviders(<UserSettingsPage />, { initialEntries: ['/settings'] });

    expect(screen.queryByRole('button', { name: /Seasons/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Automations/ })).not.toBeInTheDocument();
  });

  it('renders an empty state, not a Go Back, when the session is gone', () => {
    const signedIn = { ...auth };
    auth.user = null;
    auth.isAuthenticated = false;
    try {
      renderWithProviders(<UserSettingsPage />, { initialEntries: ['/settings'] });
      expect(screen.getByText('Sign in to open settings')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /go back/i })).not.toBeInTheDocument();
    } finally {
      Object.assign(auth, signedIn);
    }
  });
});
