/**
 * Role assignment on the settings page.
 *
 * The behaviour worth pinning is that selection is *local until Save*. A
 * per-row write would mean an admin rebuilding the list passes through a state
 * where nobody holds the role, and every mis-click is a live grant. The other
 * is the diff: saving an unchanged list must write nothing, because
 * re-inserting a grant rewrites its `created_at`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../../test/renderWithProviders.jsx';

const users = {
  listLeagueMembers: vi.fn(async () => MEMBERS),
  getParlayCommissioners: vi.fn(async () => []),
  setParlayCommissioners: vi.fn(async () => ({ granted: 0, revoked: 0 })),
  isParlayCommissioner: vi.fn(async () => false)
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ users, seasons: { getActiveSeason: async () => null } })
}));

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    user: { id: 'admin-1', user_metadata: { name: 'Humza Khalil' } },
    isAuthenticated: true,
    isAdmin: true,
    loading: false
  })
}));

const MEMBERS = [
  { id: 'u1', displayName: 'Arya Shah', email: 'arya@example.com' },
  { id: 'u2', displayName: 'Rohit Ramki', email: 'rohit@example.com' },
  // Same display name, different account — the reason the email is rendered.
  { id: 'u3', displayName: 'Humza Khalil', email: 'other@example.com' }
];

const { default: LeagueRolesManager } = await import('../LeagueRolesManager.jsx');

beforeEach(() => {
  vi.clearAllMocks();
  users.listLeagueMembers.mockResolvedValue(MEMBERS);
  users.getParlayCommissioners.mockResolvedValue([]);
  users.setParlayCommissioners.mockResolvedValue({ granted: 0, revoked: 0 });
});

describe('LeagueRolesManager', () => {
  it('shows every member with the address that tells duplicates apart', async () => {
    renderWithProviders(<LeagueRolesManager />);

    expect(await screen.findByText('Arya Shah')).toBeInTheDocument();
    expect(screen.getByText('other@example.com')).toBeInTheDocument();
  });

  it('pre-ticks whoever already holds the role', async () => {
    users.getParlayCommissioners.mockResolvedValue([
      { id: 'role-1', userId: 'u2', role: 'parlay_commissioner' }
    ]);

    renderWithProviders(<LeagueRolesManager />);

    const rohit = await screen.findByRole('checkbox', { name: /rohit ramki/i });
    await waitFor(() => expect(rohit).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByRole('checkbox', { name: /arya shah/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });

  it('does not write until Save is pressed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeagueRolesManager />);

    await user.click(await screen.findByRole('checkbox', { name: /arya shah/i }));
    expect(users.setParlayCommissioners).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /save roles/i }));
    await waitFor(() => expect(users.setParlayCommissioners).toHaveBeenCalledWith(['u1']));
  });

  it('keeps Save disabled while nothing has changed', async () => {
    renderWithProviders(<LeagueRolesManager />);

    const save = await screen.findByRole('button', { name: /save roles/i });
    await waitFor(() => expect(save).toBeDisabled());
  });

  it('can hand the role to more than one person at once', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeagueRolesManager />);

    await user.click(await screen.findByRole('checkbox', { name: /arya shah/i }));
    await user.click(screen.getByRole('checkbox', { name: /rohit ramki/i }));
    await user.click(screen.getByRole('button', { name: /save roles/i }));

    await waitFor(() =>
      expect(users.setParlayCommissioners).toHaveBeenCalledWith(['u1', 'u2'])
    );
  });

  it('sends an empty list when the last commissioner is unticked', async () => {
    const user = userEvent.setup();
    users.getParlayCommissioners.mockResolvedValue([
      { id: 'role-1', userId: 'u2', role: 'parlay_commissioner' }
    ]);

    renderWithProviders(<LeagueRolesManager />);

    const rohit = await screen.findByRole('checkbox', { name: /rohit ramki/i });
    await waitFor(() => expect(rohit).toHaveAttribute('aria-checked', 'true'));

    await user.click(rohit);
    await user.click(screen.getByRole('button', { name: /save roles/i }));

    await waitFor(() => expect(users.setParlayCommissioners).toHaveBeenCalledWith([]));
    expect(screen.getByText(/only you can open the td parlay tab/i)).toBeInTheDocument();
  });

  it('filters by name or email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeagueRolesManager />);

    await user.type(await screen.findByLabelText(/filter members/i), 'rohit@');

    expect(screen.getByText('Rohit Ramki')).toBeInTheDocument();
    expect(screen.queryByText('Arya Shah')).not.toBeInTheDocument();
  });
});
