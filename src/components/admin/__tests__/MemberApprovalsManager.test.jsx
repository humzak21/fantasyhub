/**
 * The approval queue on the settings page.
 *
 * What is worth pinning: each decision is a single immediate write with the
 * right status; rejected and approved accounts are out of the way until
 * asked for; Revoke — a hard delete — writes nothing until it has been
 * confirmed on the row; and the admin cannot revoke themselves from here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor, within } from '../../../test/renderWithProviders.jsx';

const users = {
  listMemberApprovals: vi.fn(async () => ROWS),
  setMemberApproval: vi.fn(async () => ({})),
  deleteMemberAccount: vi.fn(async () => true),
  isParlayCommissioner: vi.fn(async () => false),
  isApprovedMember: vi.fn(async () => true)
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

const ROWS = [
  {
    userId: 'u1',
    displayName: 'Arya Shah',
    email: 'arya@example.com',
    status: 'pending',
    requestedAt: '2026-09-03T14:00:00Z',
    decidedAt: null
  },
  {
    userId: 'u2',
    displayName: 'Rohit Ramki',
    email: 'rohit@example.com',
    status: 'rejected',
    requestedAt: '2026-09-01T14:00:00Z',
    decidedAt: '2026-09-02T09:00:00Z'
  },
  {
    userId: 'u3',
    displayName: 'Dana Whitfield',
    email: 'dana@example.com',
    status: 'approved',
    requestedAt: '2026-08-01T14:00:00Z',
    decidedAt: '2026-08-01T14:00:00Z'
  },
  {
    userId: 'admin-1',
    displayName: 'Humza Khalil',
    email: 'humza@example.com',
    status: 'approved',
    requestedAt: '2026-08-01T14:00:00Z',
    decidedAt: null
  }
];

const { default: MemberApprovalsManager } = await import('../MemberApprovalsManager.jsx');
const { countPendingApprovals } = await import('../../../../hooks/queries/index.js');

beforeEach(() => {
  vi.clearAllMocks();
  users.listMemberApprovals.mockResolvedValue(ROWS);
  users.setMemberApproval.mockResolvedValue({});
  users.deleteMemberAccount.mockResolvedValue(true);
});

describe('MemberApprovalsManager', () => {
  it('shows who is waiting, with the address, and keeps the rest folded away', async () => {
    renderWithProviders(<MemberApprovalsManager />);

    expect(await screen.findByText('Arya Shah')).toBeInTheDocument();
    expect(screen.getByText('arya@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Rohit Ramki')).not.toBeInTheDocument();
    expect(screen.queryByText('Dana Whitfield')).not.toBeInTheDocument();
  });

  it('approves with one click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemberApprovalsManager />);

    await user.click(await screen.findByRole('button', { name: /approve arya shah/i }));

    await waitFor(() =>
      expect(users.setMemberApproval).toHaveBeenCalledWith({
        userId: 'u1',
        status: 'approved',
        note: null
      })
    );
  });

  it('rejects with one click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemberApprovalsManager />);

    await user.click(await screen.findByRole('button', { name: /reject arya shah/i }));

    await waitFor(() =>
      expect(users.setMemberApproval).toHaveBeenCalledWith({
        userId: 'u1',
        status: 'rejected',
        note: null
      })
    );
  });

  it('lets a rejected request be reconsidered', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemberApprovalsManager />);

    await screen.findByText('Arya Shah');
    await user.click(screen.getByRole('button', { name: /show 1 rejected/i }));
    await user.click(screen.getByRole('button', { name: /approve rohit ramki/i }));

    await waitFor(() =>
      expect(users.setMemberApproval).toHaveBeenCalledWith({
        userId: 'u2',
        status: 'approved',
        note: null
      })
    );
  });

  it('does not delete until the row has been confirmed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemberApprovalsManager />);

    await user.click(await screen.findByRole('button', { name: /revoke arya shah/i }));
    expect(users.deleteMemberAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(users.deleteMemberAccount).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /revoke arya shah/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /revoke arya shah/i }));
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(users.deleteMemberAccount).toHaveBeenCalledWith('u1'));
  });

  it('will not offer to revoke the admin themselves', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemberApprovalsManager />);

    await screen.findByText('Arya Shah');
    await user.click(screen.getByRole('button', { name: /show 2 approved members/i }));

    expect(screen.getByRole('button', { name: /revoke humza khalil/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /revoke dana whitfield/i })).toBeEnabled();
  });

  it('reports a refused write instead of swallowing it', async () => {
    const user = userEvent.setup();
    users.setMemberApproval.mockRejectedValue(new Error('Only the admin can approve members.'));
    renderWithProviders(<MemberApprovalsManager />);

    await user.click(await screen.findByRole('button', { name: /approve arya shah/i }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/only the admin can approve members/i)).toBeInTheDocument();
  });

  it('counts only the pending rows for the sidebar badge', () => {
    expect(countPendingApprovals(ROWS)).toBe(1);
    expect(countPendingApprovals([])).toBe(0);
  });
});
