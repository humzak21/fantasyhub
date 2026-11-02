/**
 * The admin's submissions overview.
 *
 * It answers one question — who has picked, and what did they take — and it
 * used to answer it by redrawing the picker read-only: two 15rem team buttons
 * per matchup, one matchup per row, fourteen members deep. What is asserted
 * here is that the compaction did not cost any of the information: both teams
 * and both owners are still on every line, and which of them was picked is
 * still readable without colour.
 *
 * The other half is that the cards can be read against each other: every card
 * draws the same matchups in the same order, with the same team on each side.
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

const GAME = {
  week: 3,
  team1: { id: 't1', name: 'Gridiron Gang', owner: 'Humza Khalil' },
  team2: { id: 't2', name: 'Waiver Wire Wizards', owner: 'Arya Shah' }
};

const SECOND_GAME = {
  week: 3,
  team1: { id: 't3', name: 'Blitz Brigade', owner: 'Sai Rao' },
  team2: { id: 't4', name: 'Fourth And Long', owner: 'Jo Lee' }
};

const submission = (userId, displayName, gameId, pickedTeamId, result = {}) => ({
  userId,
  gameId,
  predictedWinnerTeamId: pickedTeamId,
  submittedAt: '2026-09-09T12:00:00Z',
  isCorrect: false,
  gameCompleted: false,
  ...result,
  userDetails: { displayName, email: `${userId}@example.com` },
  games: GAME
});

const renderTab = (props = {}) =>
  render(
    <PickEmsAdminSubmissions
      currentWeek={3}
      pickEmWeek={PICK_EM_WEEK}
      isAdmin
      user={{ id: 'admin' }}
      {...props}
    />
  );

const rowsOf = (name) =>
  within(screen.getByRole('list', { name: `${name}'s picks` })).getAllByRole('listitem');

const HIT = { gameCompleted: true, isCorrect: true };
const MISS = { gameCompleted: true, isCorrect: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PickEmsAdminSubmissions', () => {
  it('keeps both teams and both owners on a pick, and says which was taken', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', 't2')
    ]);

    renderTab();

    const row = (await screen.findByText('Waiver Wire Wizards')).closest('li');
    expect(within(row).getByText('Gridiron Gang')).toBeInTheDocument();
    expect(within(row).getByText('Arya Shah')).toBeInTheDocument();
    expect(within(row).getByText('Humza Khalil')).toBeInTheDocument();
    expect(within(row).getByText('(picked)').parentElement).toHaveTextContent(
      'Waiver Wire Wizards'
    );
  });

  it('keeps each team on its own side whichever one was picked', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', 't1'),
      submission('u2', 'Arya Shah', 'g1', 't2')
    ]);

    renderTab();
    await screen.findByText('u1@example.com');

    for (const [row] of [rowsOf('Humza Khalil'), rowsOf('Arya Shah')]) {
      expect(row.textContent.indexOf('Gridiron Gang')).toBeLessThan(
        row.textContent.indexOf('Waiver Wire Wizards')
      );
    }
  });

  it('draws the same matchups in the same order on every card', async () => {
    // Stored in opposite orders, with the second member missing a game.
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      { ...submission('u1', 'Humza Khalil', 'g2', 't3'), games: SECOND_GAME },
      submission('u1', 'Humza Khalil', 'g1', 't1'),
      submission('u2', 'Arya Shah', 'g1', 't2')
    ]);

    renderTab({
      games: [
        { id: 'g1', ...GAME },
        { id: 'g2', ...SECOND_GAME }
      ]
    });
    await screen.findByText('u1@example.com');

    for (const name of ['Humza Khalil', 'Arya Shah']) {
      const [first, second] = rowsOf(name);
      expect(first).toHaveTextContent('Gridiron Gang');
      expect(second).toHaveTextContent('Blitz Brigade');
    }
    expect(within(rowsOf('Arya Shah')[1]).getByText('no pick')).toBeInTheDocument();
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

    expect(within(rowsOf('Humza Khalil')[0]).getByText('(picked)')).toBeInTheDocument();
    expect(within(rowsOf('Arya Shah')[0]).getByText('(picked)')).toBeInTheDocument();
    expect(rowsOf('Arya Shah')[1]).toHaveTextContent('no pick');
  });

  it('shows the score and marks each pick once its game is scored', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', 't1', HIT),
      submission('u1', 'Humza Khalil', 'g2', 't2', MISS),
      submission('u1', 'Humza Khalil', 'g3', 't1', HIT)
    ]);

    renderTab();

    expect(await screen.findByText('2/3 picks')).toBeInTheDocument();
    const [first, second, third] = rowsOf('Humza Khalil');
    expect(within(first).getByLabelText('Hit')).toBeInTheDocument();
    expect(within(second).getByLabelText('Miss')).toBeInTheDocument();
    expect(within(third).getByLabelText('Hit')).toBeInTheDocument();
  });

  it('marks nothing and keeps the plain count before the games are scored', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', 't1'),
      submission('u1', 'Humza Khalil', 'g2', 't2')
    ]);

    renderTab();

    await screen.findByText('u1@example.com');
    expect(screen.queryByText(/\/\d+ picks/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hit')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Miss')).not.toBeInTheDocument();
  });

  it('leaves an unplayed game unmarked and out of the score', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', 't1', HIT),
      submission('u1', 'Humza Khalil', 'g2', 't2')
    ]);

    renderTab();

    expect(await screen.findByText('1/1 picks')).toBeInTheDocument();
    const [, unplayed] = rowsOf('Humza Khalil');
    expect(within(unplayed).queryByLabelText('Hit')).not.toBeInTheDocument();
    expect(within(unplayed).queryByLabelText('Miss')).not.toBeInTheDocument();
  });

  it('marks a matchup with no stored winner instead of reading as team 1', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([
      submission('u1', 'Humza Khalil', 'g1', null)
    ]);

    renderTab();

    expect(await screen.findByText('no pick')).toBeInTheDocument();
    expect(screen.queryByText('(picked)')).not.toBeInTheDocument();
  });

  it('says nobody has picked rather than rendering an empty grid', async () => {
    pickems.getAdminSubmissionsForWeek.mockResolvedValue([]);

    renderTab();

    await waitFor(() =>
      expect(screen.getByText(/no submissions yet/i)).toBeInTheDocument()
    );
  });
});
