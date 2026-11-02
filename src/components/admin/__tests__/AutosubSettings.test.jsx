/**
 * The admin's autosub controls: the weekly limit offers exactly 1-9 and saves
 * the choice for the active season, and it stops being a choice while autosubs
 * are off.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../../test/renderWithProviders.jsx';

const season = {
  id: 's1',
  year: 2026,
  autosubsEnabled: true,
  autosubEspnWrites: false,
  autosubWeeklyLimit: 4,
  teams: []
};

const db = {
  users: {
    isApprovedMember: vi.fn(async () => true),
    isParlayCommissioner: vi.fn(async () => false),
    isLeagueAdmin: vi.fn(async () => true)
  },
  seasons: {
    getActiveSeason: vi.fn(async () => season),
    setAutosubSettings: vi.fn(async () => ({}))
  }
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => db,
  getContext: () => ({ seasonsCache: new Map() })
}));

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    user: { id: 'admin-1', user_metadata: { name: 'Humza Khalil' } },
    isAuthenticated: true,
    loading: false
  })
}));

const { default: AutosubSettings } = await import('../AutosubSettings.jsx');

const limitControl = () => screen.findByRole('combobox', { name: /autosubs per team each week/i });

beforeEach(() => {
  vi.clearAllMocks();
  db.seasons.getActiveSeason.mockResolvedValue(season);
});

describe('AutosubSettings', () => {
  it('shows the season\'s limit', async () => {
    renderWithProviders(<AutosubSettings />);

    await waitFor(async () => expect(await limitControl()).toHaveTextContent('4'));
  });

  it('offers one to nine', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AutosubSettings />);

    await waitFor(async () => expect(await limitControl()).toBeEnabled());
    await user.click(await limitControl());

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  });

  it('saves the choice for the active season and leaves the switches alone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AutosubSettings />);

    await waitFor(async () => expect(await limitControl()).toBeEnabled());
    await user.click(await limitControl());
    await user.click(await screen.findByRole('option', { name: '2' }));

    await waitFor(() =>
      expect(db.seasons.setAutosubSettings).toHaveBeenCalledWith('s1', { autosubWeeklyLimit: 2 })
    );
  });

  it('shows a refused save', async () => {
    const user = userEvent.setup();
    db.seasons.setAutosubSettings.mockRejectedValueOnce(new Error('new row violates row-level security'));
    renderWithProviders(<AutosubSettings />);

    await waitFor(async () => expect(await limitControl()).toBeEnabled());
    await user.click(await limitControl());
    await user.click(await screen.findByRole('option', { name: '2' }));

    expect(await screen.findByText(/row-level security/i)).toBeInTheDocument();
  });

  it('cannot be changed while autosubs are off', async () => {
    db.seasons.getActiveSeason.mockResolvedValue({ ...season, autosubsEnabled: false });
    renderWithProviders(<AutosubSettings />);

    await waitFor(async () => expect(await limitControl()).toBeDisabled());
  });
});
