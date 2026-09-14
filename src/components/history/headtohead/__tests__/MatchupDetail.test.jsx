/**
 * One rivalry, rendered. The arithmetic is `matchupSummary`'s and tested there;
 * this pins that the page tells the phases apart, names who holds the current
 * streak, groups every meeting by season, and masks both franchises.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen, within } from '../../../../test/renderWithProviders.jsx';

const history = { getMatchupHistory: vi.fn() };

vi.mock('../../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ history })
}));

const { default: MatchupDetail } = await import('../MatchupDetail.jsx');

const FRANCHISES = [
  { id: 'f-alpha01', owner_name: 'Owner A', display_name: 'Owner A' },
  { id: 'f-bravo02', owner_name: 'Owner B', display_name: 'Owner B' }
];

const meeting = (id, year, week, team1Score, team2Score, phase = 'regular') => ({
  id,
  year,
  week,
  team1Score,
  team2Score,
  isRegular: phase === 'regular',
  isPlayoff: phase === 'playoff',
  isConsolation: phase === 'consolation'
});

const MEETINGS = [
  meeting('g1', 2023, 3, 120, 100),
  meeting('g2', 2023, 10, 110.96, 111),
  meeting('g3', 2024, 2, 130, 90),
  meeting('g4', 2024, 16, 140, 135, 'playoff'),
  meeting('g5', 2025, 15, 99, 101, 'consolation')
];

beforeEach(() => {
  vi.clearAllMocks();
  history.getMatchupHistory.mockResolvedValue(MEETINGS);
});

const tapeRow = (label) => screen.getByText(label, { selector: 'dt' }).parentElement;

describe('MatchupDetail', () => {
  it('sets the two sides against each other, phase by phase', async () => {
    renderWithProviders(
      <MatchupDetail franchise1Id="f-alpha01" franchise2Id="f-bravo02" franchises={FRANCHISES} />
    );

    expect(await screen.findByText('Every meeting')).toBeInTheDocument();

    expect(within(tapeRow('Series')).getAllByRole('definition').map((cell) => cell.textContent))
      .toEqual(['3–2', '2–3']);
    expect(within(tapeRow('Playoffs')).getAllByRole('definition').map((cell) => cell.textContent))
      .toEqual(['1–0', '0–1']);
    expect(within(tapeRow('Consolation')).getAllByRole('definition').map((cell) => cell.textContent))
      .toEqual(['0–1', '1–0']);
  });

  it('names who holds the streak, and groups every meeting by season, newest first', async () => {
    renderWithProviders(
      <MatchupDetail franchise1Id="f-alpha01" franchise2Id="f-bravo02" franchises={FRANCHISES} />
    );

    expect(await screen.findByText(/Franchise f-bravo0 won the last meeting/)).toBeInTheDocument();

    const seasons = ['2025', '2024', '2023'].map((year) => document.getElementById(`meetings-${year}`));
    expect(seasons.every(Boolean)).toBe(true);
    expect(seasons[0].compareDocumentPosition(seasons[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.getAllByText('Playoffs', { selector: '[class*="badge"], span, div' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Consol.').length).toBeGreaterThan(0);
  });

  it('reads scores and margins to the hundredth', async () => {
    renderWithProviders(
      <MatchupDetail franchise1Id="f-alpha01" franchise2Id="f-bravo02" franchises={FRANCHISES} />
    );

    await screen.findByText('Every meeting');
    // The closest meeting was decided by 0.04, which one decimal would show as 0.0.
    const closest = screen.getByText('Closest meeting').parentElement;
    expect(within(closest).getByText('0.04')).toBeInTheDocument();
    expect(within(closest).getByText(/110\.96–111\.00/)).toBeInTheDocument();
  });

  it('never prints an owner a signed-out viewer may not see', async () => {
    renderWithProviders(
      <MatchupDetail franchise1Id="f-alpha01" franchise2Id="f-bravo02" franchises={FRANCHISES} />
    );

    await screen.findByText('Every meeting');
    expect(screen.queryByText(/Owner A|Owner B/)).not.toBeInTheDocument();
  });

  it('says when two franchises have never met', async () => {
    history.getMatchupHistory.mockResolvedValue([]);

    renderWithProviders(
      <MatchupDetail franchise1Id="f-alpha01" franchise2Id="f-bravo02" franchises={FRANCHISES} />
    );

    expect(await screen.findByText(/have never met/)).toBeInTheDocument();
  });
});
