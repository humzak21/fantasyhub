/**
 * SeasonManager is admin-only, so the Playwright smoke job — which runs signed
 * out — never reaches it. That gap is exactly how the version of this file
 * that used `<Dialog>` without importing it built clean, type-checked clean,
 * and would have thrown `Dialog is not defined` the first time an admin
 * clicked "New Season".
 *
 * These tests are cheap insurance against that class of mistake: render the
 * component, open each dialog, assert it appeared.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen, fireEvent, waitFor } from '../../../test/renderWithProviders.jsx';
import SeasonManager from '../SeasonManager.jsx';

const seasons = [
  {
    id: 's-2025',
    year: 2025,
    name: '2025 Season',
    isActive: false,
    isCompleted: true,
    leagueSize: 14,
    regularSeasonWeeks: 14,
    playoffWeeks: 3,
    teams: [],
  },
];

const props = () => ({
  seasons,
  activeSeason: null,
  onCreateSeason: vi.fn(),
  onSetActiveSeason: vi.fn(),
  onDeleteSeason: vi.fn(),
  onFinalizeSeason: vi.fn(),
  onExportSeason: vi.fn(),
  onImportSeason: vi.fn(),
  isAuthenticated: true,
});

describe('SeasonManager', () => {
  it('renders without throwing', () => {
    renderWithProviders(<SeasonManager {...props()} />);
    expect(screen.getByRole('button', { name: /new season/i })).toBeInTheDocument();
    expect(screen.getByText(/2025 Season/)).toBeInTheDocument();
  });

  it('opens the create-season dialog', async () => {
    renderWithProviders(<SeasonManager {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: /new season/i }));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /create new season/i })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /create season/i })).toBeInTheDocument();
  });

  it('opens the import dialog', async () => {
    renderWithProviders(<SeasonManager {...props()} />);

    fireEvent.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /import season/i })).toBeInTheDocument()
    );
  });

  it('saves a changed league size, and offers Save only once it has changed', async () => {
    const onSetLeagueSize = vi.fn(async () => {});
    renderWithProviders(<SeasonManager {...props()} onSetLeagueSize={onSetLeagueSize} />);

    const field = screen.getByLabelText(/league size for 2025/i);
    expect(field).toHaveValue(14);
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(onSetLeagueSize).toHaveBeenCalledWith('s-2025', 12));
  });

  it('will not save a league size under 4', () => {
    renderWithProviders(<SeasonManager {...props()} onSetLeagueSize={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/league size for 2025/i), { target: { value: '2' } });

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });
});
