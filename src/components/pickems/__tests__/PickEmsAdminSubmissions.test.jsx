/**
 * The admin's submissions overview.
 *
 * It answers one question — who has picked, and what did they take — and it
 * used to answer it by redrawing the picker read-only: two 15rem team buttons
 * per matchup, one matchup per row, fourteen members deep. What is asserted
 * here is that the compaction did not cost any of the information: both teams
 * and both owners are still on every line, and which of them was picked is
 * still readable without colour.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';

const pickems = { getAdminSubmissionsForWeek: vi.fn(async () => []) };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ pickems })
}));

const { default: PickEmsAdminSubmissions } = await import('../PickEmsAdminSubmissions.jsx');

const PICK_EM_WEEK = {
  id: 'pew-3',
  submissionClosesAt: '2026-09-13T17:00:00Z'
};

const submission = (userId, displayName, gameId, pickedTeamId) => ({
  userId,
  gameId,
  predictedWinnerTeamId: pickedTeamId,
  submittedAt: '2026-09-09T12:00:00Z',
  userDetails: { displayName, email: `${userId}@example.com` },
  games: {
    week: 3,
    team1: { id: 't1', name: 'Gridiron Gang', owner: 'Humza Khalil' },
    team2: { id: 't2', name: 'Waiver Wire Wizards', owner: 'Arya Shah' }
  }
});

const renderTab = () =>
  render(
    <PickEmsAdminSubmissions currentWeek={3} pickEmWeek={PICK_EM_WEEK} isAdmin user={{ id: 'admin' }} />
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PickEmsAdminSubmissions', () => {
  it('keeps both teams and both owners on a pick, and says which was taken', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', 't2')
    ]);

    renderTab();

    // The team taken is the subject of the line; the other follows "over".
    const row = (await screen.findByText('Waiver Wire Wizards')).closest('li');
    expect(within(row).getByText('over')).toBeInTheDocument();
    expect(within(row).getByText('Gridiron Gang')).toBeInTheDocument();
    expect(within(row).getByText('Arya Shah')).toBeInTheDocument();
    expect(within(row).getByText('Humza Khalil')).toBeInTheDocument();
  });

  it('groups every pick under the member who made it', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', 't1'),
      submission('u1', 'Humza Khalil', 'g2', 't2'),
      submission('u2', 'Arya Shah', 'g1', 't2')
    ]);

    renderTab();

    await screen.findByText('u1@example.com');
    expect(screen.getByText('u2@example.com')).toBeInTheDocument();

    expect(
      within(screen.getByRole('list', { name: "Humza Khalil's picks" })).getAllByRole('listitem')
    ).toHaveLength(2);
    expect(
      within(screen.getByRole('list', { name: "Arya Shah's picks" })).getAllByRole('listitem')
    ).toHaveLength(1);
  });

  it('marks a matchup with no stored winner instead of reading as team 1', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', null)
    ]);

    renderTab();

    expect(await screen.findByText('no pick')).toBeInTheDocument();
    expect(screen.queryByText('over')).not.toBeInTheDocument();
  });

  it('says nobody has picked rather than rendering an empty grid', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([]);

    renderTab();

    await waitFor(() =>
      expect(screen.getByText(/no submissions yet/i)).toBeInTheDocument()
    );
  });
});
