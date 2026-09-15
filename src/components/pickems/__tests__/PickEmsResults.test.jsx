import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PickEmsResults from '../PickEmsResults';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

const pick = (overrides) => ({
  submissionId: 's1',
  userId: 'user-aaaaaaaa',
  displayName: 'Humza Khalil',
  team1Id: 't1',
  team1Name: 'Gridiron Gang',
  team2Id: 't2',
  team2Name: 'Waiver Wire Wizards',
  gameCompleted: true,
  actualWinnerTeamId: 't1',
  actualWinnerName: 'Gridiron Gang',
  pickedTeamId: 't1',
  pickedTeamName: 'Gridiron Gang',
  isCorrect: true,
  pointsEarned: 1,
  ...overrides,
});

// The value beside a label in a pick row's <dl>.
const valueFor = (row, label) =>
  within(row).getByText(label).nextElementSibling.textContent;

const renderBreakdown = (allPicks, props = {}) => {
  render(
    <PickEmsResults
      currentWeek={3}
      resultsAvailable
      allPicks={allPicks}
      isAdmin
      {...props}
    />
  );
  // Radix tabs activate on mouse down.
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Pick Breakdown/ }), { button: 0 });
  return screen.getAllByText('Winner of Matchup:').map((dt) => dt.closest('.border'));
};

describe('PickEmsResults pick breakdown', () => {
  it('names the winner and the chosen team separately, and marks a hit', () => {
    const [row] = renderBreakdown([pick()]);

    expect(valueFor(row, 'Winner of Matchup:')).toBe('Gridiron Gang');
    expect(valueFor(row, 'Chosen:')).toBe('Gridiron Gang');
    expect(within(row).getByText('Hit')).toBeInTheDocument();
  });

  it('shows the real winner beside a different chosen team on a miss', () => {
    const [row] = renderBreakdown([
      pick({ pickedTeamId: 't2', pickedTeamName: 'Waiver Wire Wizards', isCorrect: false, pointsEarned: 0 }),
    ]);

    expect(valueFor(row, 'Winner of Matchup:')).toBe('Gridiron Gang');
    expect(valueFor(row, 'Chosen:')).toBe('Waiver Wire Wizards');
    expect(within(row).getByText('Miss')).toBeInTheDocument();
  });

  it('never names a winner for a tie or an unplayed game', () => {
    const [tie, unplayed] = renderBreakdown([
      pick({ submissionId: 's1', actualWinnerTeamId: null, actualWinnerName: null, isCorrect: false, pointsEarned: 0 }),
      pick({ submissionId: 's2', gameCompleted: false, actualWinnerTeamId: null, actualWinnerName: null, isCorrect: false, pointsEarned: 0 }),
    ]);

    expect(valueFor(tie, 'Winner of Matchup:')).toBe('Tie');
    expect(within(tie).getByText('Miss')).toBeInTheDocument();

    expect(valueFor(unplayed, 'Winner of Matchup:')).toBe('Not played yet');
    expect(valueFor(unplayed, 'Chosen:')).toBe('Gridiron Gang');
    expect(within(unplayed).getByText('Pending')).toBeInTheDocument();
  });

  it('masks the winner by its team id for a viewer who cannot see names', () => {
    const [row] = renderBreakdown([pick()], { isAdmin: false, user: null });

    const masked = getMaskedTeamName({ id: 't1', name: 'Gridiron Gang' }, null, false);
    expect(masked).not.toBe('Gridiron Gang');
    expect(valueFor(row, 'Winner of Matchup:')).toBe(masked);
    expect(valueFor(row, 'Chosen:')).toBe(masked);
  });
});
