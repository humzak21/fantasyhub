/**
 * The stat comparison card. The arithmetic and the chart choice are
 * `utils/statComparison`'s and tested there; this pins what the reader
 * controls — the opening all-time list, narrowing to one season, a second stat
 * — and the masking.
 *
 * Assertions read the value list and the controls: jsdom has no layout, so
 * the SVG is not there to inspect.
 *
 * 2024 (completed): wk1 A 120 – B 100, wk2 A 90 – B 110   → A 1–1, B 1–1
 * 2025 (completed): wk1 A 130 – B 100, wk2 A 100 – B 95   → A 2–0, B 0–2
 * Lineups are stored for A only.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../../../../test/renderWithProviders.jsx';

const history = { getRecordBookSource: vi.fn(), getFranchisesWithCareerStats: vi.fn() };

vi.mock('../../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ history })
}));

const { default: StatComparison } = await import('../StatComparison.jsx');

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
  type: 'regular',
  team1Id: `${seasonId}-a`,
  team2Id: `${seasonId}-b`,
  team1Score: aScore,
  team2Score: bScore,
  isBlowout: Math.abs(aScore - bScore) >= 30,
  isClose: Math.abs(aScore - bScore) <= 5
});

const SOURCE = {
  seasons: SEASONS,
  teams: SEASONS.flatMap((season) => [
    { id: `${season.id}-a`, seasonId: season.id, franchiseId: 'f-alpha01', finalRank: 1, playoffFinish: 'champion', madePlayoffs: true },
    { id: `${season.id}-b`, seasonId: season.id, franchiseId: 'f-bravo02', finalRank: 2, playoffFinish: '2nd', madePlayoffs: true }
  ]),
  games: [
    game('g1', 's24', 1, 120, 100),
    game('g2', 's24', 2, 90, 110),
    game('g3', 's25', 1, 130, 100),
    game('g4', 's25', 2, 100, 95)
  ],
  transactions: [],
  lineups: [
    { seasonId: 's24', week: 1, teamId: 's24-a', starterPoints: 120, optimalPoints: 130, startersScoring: 9 }
  ]
};

beforeEach(() => {
  vi.clearAllMocks();
  history.getRecordBookSource.mockResolvedValue(SOURCE);
  history.getFranchisesWithCareerStats.mockResolvedValue(FRANCHISES);
});

const valueRows = async () => within(await screen.findByRole('list', { name: 'Values' })).getAllByRole('listitem');

const chooseStat = async (user, label, option) => {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
};

describe('StatComparison', () => {
  it('opens on every team, all-time, ranked by win percentage', async () => {
    renderWithProviders(<StatComparison isAdmin />);

    const rows = await valueRows();
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/Owner A.*2 seasons · 4 games.*75\.0%/),
      expect.stringMatching(/Owner B.*2 seasons · 4 games.*25\.0%/)
    ]);
    expect(screen.getByRole('button', { name: 'Teams: All teams' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seasons: All seasons' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All-time', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Season by season' })).toBeInTheDocument();
  });

  it('offers week by week once one season is picked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatComparison isAdmin />);
    await valueRows();

    await user.click(screen.getByRole('button', { name: 'Seasons: All seasons' }));
    await user.click(await screen.findByRole('checkbox', { name: 'All seasons' }));

    expect(await screen.findByRole('tab', { name: 'Week by week', selected: true })).toBeInTheDocument();
    expect(screen.getByText('2025 season total')).toBeInTheDocument();
    expect((await valueRows())[0]).toHaveTextContent(/Owner A.*100\.0%/);
  });

  it('offers a per-season average for a count over several seasons', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatComparison isAdmin />);
    await valueRows();

    await chooseStat(user, 'Stat', 'Wins');
    expect((await valueRows())[0]).toHaveTextContent(/Owner A.*3$/);

    await user.click(screen.getByRole('tab', { name: 'Per season' }));
    expect((await valueRows())[0]).toHaveTextContent(/Owner A.*1\.5$/);
  });

  it('plots a second stat against the first', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatComparison isAdmin />);
    await valueRows();

    await chooseStat(user, 'Against', 'Points per game');

    const rows = await valueRows();
    expect(rows[0]).toHaveTextContent(/Owner A.*75\.0%.*110\.0/);
    expect(screen.getByText(/Dashed lines mark the average/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Each season' })).toBeInTheDocument();
  });

  it('names the teams with no figure instead of drawing them as zero', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StatComparison isAdmin />);
    await valueRows();

    await chooseStat(user, 'Stat', 'Lineup efficiency');

    expect(await valueRows()).toHaveLength(1);
    expect(screen.getByText('No data:').parentElement).toHaveTextContent('Owner B');
  });

  it('masks franchise names for a viewer who may not see the league', async () => {
    renderWithProviders(<StatComparison />);

    const rows = await valueRows();
    expect(rows[0]).toHaveTextContent('Franchise f-alpha0');
    expect(screen.queryByText('Owner A')).not.toBeInTheDocument();
  });
});
