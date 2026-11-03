/**
 * The sheet's career list: each stint names a franchise, and following that name
 * has to take the sheet down with it, or it stays open over the profile.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const career = {
  player: { position: 'QB' },
  weeks: [
    { year: 2026, week: 1, franchiseId: 'fA', teamId: 'tA', teamName: 'Team A', owner: 'Owner A', started: true, actualPoints: 20 }
  ]
};

vi.mock('../../../../../../hooks/queries/index.js', () => ({
  useNflOpponentMap: () => ({ data: {} }),
  usePlayerCareer: () => ({ data: career })
}));

vi.mock('../../../../../contexts/FranchiseAvatarsContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useCanOpenProfiles: () => true
}));

const { default: PlayerSheet } = await import('../PlayerSheet.jsx');

describe('PlayerSheet', () => {
  it('closes when a franchise in the career list is followed', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    render(
      <MemoryRouter>
        <PlayerSheet
          player={{ playerId: 'p1', name: 'Josh Allen' }}
          week={1}
          index={null}
          viewer={{ user: null, isAdmin: true, teamOwnerNames: [] }}
          open
          onOpenChange={onOpenChange}
        />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('link', { name: 'Owner A' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
