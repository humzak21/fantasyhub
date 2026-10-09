/**
 * Admin assignment on the settings page.
 *
 * What is worth pinning: the viewer's own row cannot be removed from here —
 * the database refuses a self-revoke, and a button whose only outcome is that
 * error is the bug the disabled state prevents; both directions confirm on the
 * row before writing; and a refusal from `set_league_admin()` (the last-admin
 * rule, say) is shown in the database's own words rather than swallowed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor, within } from '../../../test/renderWithProviders.jsx';

const ADMINS = [
  {
    userId: 'admin-1',
    displayName: 'Humza Khalil',
    email: 'humza@example.com',
    grantedAt: '2026-10-08T12:00:00Z',
    grantedBy: null
  },
  {
    userId: 'u2',
    displayName: 'Rohit Ramki',
    email: 'rohit@example.com',
    grantedAt: '2026-10-09T15:30:00Z',
    grantedBy: 'admin-1'
  }
];

const MEMBERS = [
  { id: 'admin-1', displayName: 'Humza Khalil', email: 'humza@example.com' },
  { id: 'u1', displayName: 'Arya Shah', email: 'arya@example.com' },
  { id: 'u2', displayName: 'Rohit Ramki', email: 'rohit@example.com' }
];

const users = {
  listLeagueAdmins: vi.fn(async () => ADMINS),
  listLeagueMembers: vi.fn(async () => MEMBERS),
  setLeagueAdmin: vi.fn(async () => true),
  isParlayCommissioner: vi.fn(async () => false),
  isApprovedMember: vi.fn(async () => true),
  isLeagueAdmin: vi.fn(async () => true)
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
    loading: false
  })
}));

const { default: LeagueAdminsManager } = await import('../LeagueAdminsManager.jsx');

beforeEach(() => {
  vi.clearAllMocks();
  users.listLeagueAdmins.mockResolvedValue(ADMINS);
  users.listLeagueMembers.mockResolvedValue(MEMBERS);
  users.setLeagueAdmin.mockResolvedValue(true);
  users.isLeagueAdmin.mockResolvedValue(true);
});

const adminRow = async (name) =>
  (await screen.findByRole('button', { name: new RegExp(`remove ${name} as admin`, 'i') })).closest(
    'li'
  );

describe('LeagueAdminsManager', () => {
  it('lists the current admins with their address and grant date, marking the viewer', async () => {
    renderWithProviders(<LeagueAdminsManager />);

    const self = await adminRow('Humza Khalil');
    expect(within(self).getByText('humza@example.com')).toBeInTheDocument();
    expect(within(self).getByText('YOU')).toBeInTheDocument();
    expect(within(self).getByText(/Oct 8, 2026/)).toBeInTheDocument();

    const other = await adminRow('Rohit Ramki');
    expect(within(other).queryByText('YOU')).not.toBeInTheDocument();
  });

  it('will not offer to remove the viewer, and says why', async () => {
    renderWithProviders(<LeagueAdminsManager />);

    const self = await screen.findByRole('button', { name: /remove humza khalil as admin/i });
    expect(self).toBeDisabled();
    expect(screen.getByText('You cannot remove your own access')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove rohit ramki as admin/i })).toBeEnabled();
  });

  it('offers only members who are not already admins', async () => {
    renderWithProviders(<LeagueAdminsManager />);

    expect(await screen.findByRole('button', { name: /make arya shah an admin/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make rohit ramki an admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make humza khalil an admin/i })).not.toBeInTheDocument();
  });

  it('grants only after the row is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeagueAdminsManager />);

    await user.click(await screen.findByRole('button', { name: /make arya shah an admin/i }));
    expect(users.setLeagueAdmin).not.toHaveBeenCalled();
    expect(screen.getByText(/give arya shah every admin power/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() =>
      expect(users.setLeagueAdmin).toHaveBeenCalledWith({ userId: 'u1', grant: true })
    );
  });

  it('revokes only after the row is confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LeagueAdminsManager />);

    await user.click(await screen.findByRole('button', { name: /remove rohit ramki as admin/i }));
    expect(users.setLeagueAdmin).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^confirm$/i }));
    await waitFor(() =>
      expect(users.setLeagueAdmin).toHaveBeenCalledWith({ userId: 'u2', grant: false })
    );
  });

  it('shows the database’s refusal instead of swallowing it', async () => {
    const user = userEvent.setup();
    users.setLeagueAdmin.mockRejectedValue(new Error('The league must keep at least one admin'));
    renderWithProviders(<LeagueAdminsManager />);

    await user.click(await screen.findByRole('button', { name: /remove rohit ramki as admin/i }));
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(
      await screen.findByText(/could not remove admin: the league must keep at least one admin/i)
    ).toBeInTheDocument();
  });
});
