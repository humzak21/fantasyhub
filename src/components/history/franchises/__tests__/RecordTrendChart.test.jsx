/**
 * The record trend on a franchise profile. The arithmetic is
 * `utils/recordTrend`'s and tested there; this pins what the reader controls —
 * the opening pick, "All seasons", comparing a second team — and the masking.
 *
 * Assertions read the pickers and the HTML legend: jsdom has no layout, so the
 * SVG lines themselves are not there to inspect.
 *
 * 2024: wk1 A 120 – B 100, wk2 A 90 – B 110   → A 1–1, B 1–1
 * 2025: wk1 A 130 – B 100, wk2 A 100 – B 95   → A 2–0, B 0–2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../../../../test/renderWithProviders.jsx';

const history = { getRecordTrendSource: vi.fn(), getFranchisesWithCareerStats: vi.fn() };

vi.mock('../../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ history })
}));

const { default: RecordTrendChart } = await import('../RecordTrendChart.jsx');

const FRANCHISES = [
  { id: 'f-alpha01', owner_name: 'Owner A', display_name: 'Owner A' },
  { id: 'f-bravo02', owner_name: 'Owner B', display_name: 'Owner B' }
];

const SEASONS = [
  { id: 's24', year: 2024, isCompleted: true },
  { id: 's25', year: 2025, isCompleted: true }
];

const game = (id, seasonId, week, aScore, bScore) => ({
  id,
  seasonId,
  week,
  team1Id: `${seasonId}-a`,
  team2Id: `${seasonId}-b`,
  team1Score: aScore,
  team2Score: bScore
});

const SOURCE = {
  seasons: SEASONS,
  teams: SEASONS.flatMap((season) => [
    { id: `${season.id}-a`, seasonId: season.id, franchiseId: 'f-alpha01' },
    { id: `${season.id}-b`, seasonId: season.id, franchiseId: 'f-bravo02' }
  ]),
  games: [
    game('g1', 's24', 1, 120, 100),
    game('g2', 's24', 2, 90, 110),
    game('g3', 's25', 1, 130, 100),
    game('g4', 's25', 2, 100, 95)
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  history.getRecordTrendSource.mockResolvedValue(SOURCE);
  history.getFranchisesWithCareerStats.mockResolvedValue(FRANCHISES);
});

const legend = () =>
  within(screen.getByRole('list', { name: 'Lines' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('RecordTrendChart', () => {
  it("opens on the profile's franchise in its latest season", async () => {
    renderWithProviders(<RecordTrendChart franchiseId="f-alpha01" isAdmin />);

    expect(await screen.findByRole('button', { name: 'Seasons: 2025' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Teams: Owner A' })).toBeInTheDocument();
    expect(legend()).toEqual(['20252–0']);
  });

  it('overlays every season the team played under "All seasons"', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecordTrendChart franchiseId="f-alpha01" isAdmin />);

    await user.click(await screen.findByRole('button', { name: 'Seasons: 2025' }));
    await user.click(await screen.findByRole('checkbox', { name: 'All seasons' }));

    expect(screen.getByRole('button', { name: 'Seasons: All seasons' })).toBeInTheDocument();
    expect(legend()).toEqual(['20252–0', '20241–1']);
  });

  it('compares a second team, naming lines by team when one season is shown', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RecordTrendChart franchiseId="f-alpha01" isAdmin />);

    await user.click(await screen.findByRole('button', { name: 'Teams: Owner A' }));
    // The last team left checked cannot be unchecked, so the chart is never empty.
    expect(screen.getByRole('checkbox', { name: /Owner A/ })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Owner B/ }));

    expect(screen.getByRole('button', { name: 'Teams: 2 teams' })).toBeInTheDocument();
    expect(legend()).toEqual(['Owner A2–0', 'Owner B0–2']);
  });

  it('masks every franchise name for a viewer who is not a member', async () => {
    renderWithProviders(<RecordTrendChart franchiseId="f-alpha01" />);

    expect(await screen.findByRole('button', { name: /^Teams: Franchise f-alpha0/ })).toBeInTheDocument();
    expect(screen.queryByText(/Owner A/)).not.toBeInTheDocument();
  });
});
