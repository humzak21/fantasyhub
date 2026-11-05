/**
 * The player page's body, over a profile built by the real `buildPlayerProfile`
 * and a ranking from the real `rankCareers`, so the shapes cannot drift from
 * the pure module.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { buildPlayerProfile } from '../../../../utils/playerProfile/buildPlayerProfile.js';
import { rankCareers } from '../../../../utils/playerProfile/rankCareers.js';

vi.mock('../../../../hooks/queries/index.js', () => ({
  useNflSeasonSchedule: () => ({ data: [] }),
  useNflOpponentMap: () => ({ data: {} }),
  buildOpponentMap: () => ({}),
  usePlayerByEspnId: () => ({ data: null }),
  // The box score sheet's reads, for the week that opens one.
  useWeekPlayerStats: () => ({ data: {}, isLoading: false })
}));

vi.mock('../../../contexts/FranchiseAvatarsContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useCanOpenProfiles: () => true
}));

vi.mock('../sections/PlayerCharts.jsx', () => ({
  default: ({ mode }) => <div data-testid="charts" data-mode={mode} />
}));

const { default: PlayerDetailBody } = await import('../PlayerDetailBody.jsx');
const { PlayerDetailProvider } = await import('../PlayerDetailContext.jsx');

const BREAKDOWN = { 23: 10, 24: 40, 53: 2, 42: 15, 58: 3 };

function line(seasonId, year, week, teamId, franchiseId, started, actualPoints, extra = {}) {
  return {
    id: `${seasonId}-${week}`,
    seasonId, year, week, playerId: 'p1', espnPlayerId: 100, teamId, franchiseId,
    position: 'RB', rosterSlot: started ? 'RB' : 'BE', started, actualPoints,
    projectedPoints: 15, proTeamId: 8, injuryStatus: 'ACTIVE',
    statBreakdown: actualPoints == null ? null : { ...BREAKDOWN },
    overallRank: 4, overallOf: 150, positionRank: 2, positionOf: 40,
    gameId: `g-${seasonId}-${week}`, gameType: 'regular', teamScore: 100, opponentScore: 90,
    opponentTeamId: 'tOpp', opponentFranchiseId: 'fB', result: 'W', isBye: false,
    ...extra
  };
}

function source() {
  return {
    player: {
      id: 'p1', espnPlayerId: 100, name: 'Jahmyr Gibbs', position: 'RB', teamAbbreviation: 'DET',
      proTeamId: 8, injuryStatus: 'QUESTIONABLE', projectedPoints: 18.5, isActive: true
    },
    lines: [
      line('s26', 2026, 1, 'tA26', 'fA', true, 10),
      line('s26', 2026, 2, 'tA26', 'fA', true, 20, { result: 'L' }),
      line('s26', 2026, 3, 'tA26', 'fA', false, 30),
      line('s25', 2025, 4, 'tB25', 'fB', true, 15),
      line('s25', 2025, 15, 'tB25', 'fB', true, 22, { gameType: 'playoff_first_round' })
    ],
    teams: [
      { id: 'tB25', seasonId: 's25', franchiseId: 'fB', name: 'Bravo 25', owner: 'Owner B' },
      { id: 'tA26', seasonId: 's26', franchiseId: 'fA', name: 'Alpha 26', owner: 'Owner A' }
    ],
    franchises: [
      { id: 'fA', owner_name: 'Owner A', display_name: null },
      { id: 'fB', owner_name: 'Owner B', display_name: null }
    ],
    seasons: [
      { id: 's25', year: 2025, nflSeasonYear: 2025, regularSeasonWeeks: 14, playoffWeeks: 3, totalWeeks: 17, isActive: false, isCompleted: true },
      { id: 's26', year: 2026, nflSeasonYear: 2026, regularSeasonWeeks: 14, playoffWeeks: 3, totalWeeks: 17, isActive: true, isCompleted: false }
    ],
    current: { teamId: 'tA26', rosterSlot: 'RB', seasonId: 's26' },
    events: [
      {
        id: 'e-claim', seasonId: 's25', year: 2025, type: 'WAIVER', week: 4, processedAt: '2025-09-24T10:00:00Z',
        bidAmount: 12, franchiseId: 'fB', franchiseIds: ['fB'],
        espnPlayerIds: [100], playerFromFranchiseIds: [null], playerToFranchiseIds: ['fB']
      }
    ]
  };
}

const career = (playerId, name, gamesPlayed, pointsPerGame) => ({
  playerId, name, position: 'RB', gamesPlayed, weeksRostered: gamesPlayed, weeksStarted: gamesPlayed, pointsPerGame
});
const RANKED = rankCareers([career('p1', 'Jahmyr Gibbs', 5, 19.4), career('p2', 'Bijan Robinson', 8, 17.2)]);
const UNRANKED = rankCareers([career('p1', 'Jahmyr Gibbs', 3, 19.4), career('p2', 'Bijan Robinson', 8, 17.2)]);

const ADMIN = { user: { id: 'u1' }, isAdmin: true, teamOwnerNames: ['Owner A', 'Owner B'] };
const VISITOR = { user: null, isAdmin: false, teamOwnerNames: ['Owner A', 'Owner B'] };
const OK_QUERY = { isLoading: false, isPending: false, isError: false };

function renderBody({ ranking = RANKED, rankingQuery = OK_QUERY, viewer = ADMIN, onClose = vi.fn() } = {}) {
  render(
    <MemoryRouter>
      <PlayerDetailProvider>
        <PlayerDetailBody
          profile={buildPlayerProfile(source())}
          ranking={ranking}
          rankingQuery={rankingQuery}
          viewer={viewer}
          onClose={onClose}
        />
      </PlayerDetailProvider>
    </MemoryRouter>
  );
  return { onClose };
}

const gameLogTable = () => document.querySelector('[data-layout="wide"]');

describe('PlayerDetailBody', () => {
  it('shows his career PPG and league rank in the tiles', async () => {
    renderBody();
    // The charts are a lazy chunk; let it land.
    expect(await screen.findByTestId('charts')).toBeInTheDocument();
    const tile = screen.getByTestId('tile-ppg');
    expect(within(tile).getByText('19.4')).toBeInTheDocument();
    expect(within(tile).getByText('RB1 of 2')).toBeInTheDocument();
  });

  it('opens on All seasons, newest first, and narrows the game log with the season picker', async () => {
    const user = userEvent.setup();
    renderBody();
    const tables = document.querySelectorAll('[data-season]');
    expect([...tables].map((t) => t.dataset.season)).toEqual(['2026', '2025']);
    expect(screen.getByTestId('charts').dataset.mode).toBe('all');

    await user.click(screen.getByRole('combobox', { name: 'Season' }));
    await user.click(await screen.findByRole('option', { name: '2025' }));

    const log = () => within(gameLogTable());
    expect(log().getByText('Wk 15')).toBeInTheDocument();
    expect(log().queryByText('Wk 1')).toBeNull();
    // The playoff week carries its phase.
    expect(log().getByText('R1')).toBeInTheDocument();
    expect(screen.getByTestId('charts').dataset.mode).toBe('season');
  });

  it('opens a scored week\'s box score from the game log, over the page', async () => {
    const user = userEvent.setup();
    renderBody();
    // Every week in the fixture has a scored game, so each is a box score button.
    const buttons = within(gameLogTable()).getAllByRole('button', { name: /box score/ });
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[0]);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/Box score: both lineups/)).toBeInTheDocument();
    // The page's sections are still there beneath it.
    expect(screen.getByTestId('tile-ppg')).toBeInTheDocument();
  });

  it('masks every franchise for a viewer who cannot see names', () => {
    renderBody({ viewer: VISITOR });
    expect(screen.queryByText('Owner A')).toBeNull();
    expect(screen.queryByText('Owner B')).toBeNull();
    expect(screen.getAllByText(/^Franchise fA/).length).toBeGreaterThan(0);
    // The player himself is never masked.
    expect(screen.getAllByText('Jahmyr Gibbs').length).toBeGreaterThan(0);
  });

  it('closes the page when a franchise link is followed', async () => {
    const user = userEvent.setup();
    const { onClose } = renderBody();
    const [link] = screen.getAllByRole('link', { name: 'Owner A' });
    await user.click(link);
    expect(onClose).toHaveBeenCalled();
  });

  it('says how far an unqualified player is from a rank', () => {
    renderBody({ ranking: UNRANKED });
    expect(within(screen.getByTestId('tile-ppg')).getByText('Not yet ranked · 3 of 5 games')).toBeInTheDocument();
  });

  it('degrades quietly when the league ranks fail', () => {
    renderBody({ ranking: null, rankingQuery: { isLoading: false, isPending: false, isError: true } });
    expect(within(screen.getByTestId('tile-ppg')).getByText('League ranks unavailable')).toBeInTheDocument();
    expect(screen.getByText('League ranks unavailable right now')).toBeInTheDocument();
    // The rest of the page is still there.
    expect(gameLogTable()).not.toBeNull();
  });

  it('shows a skeleton for the rank while the league ranks load', () => {
    renderBody({ ranking: null, rankingQuery: { isLoading: true, isPending: true, isError: false } });
    expect(screen.getByRole('status', { name: 'Loading league ranks' })).toBeInTheDocument();
  });

  it('lists his neighbours, each a link to his own page, and marks him', () => {
    renderBody();
    expect(screen.getByRole('button', { name: 'Bijan Robinson' })).toBeInTheDocument();
    expect(document.querySelector('[data-self]')).toHaveTextContent('Jahmyr Gibbs');
  });

  it('lists his moves with the bid, for the seasons in view', async () => {
    const user = userEvent.setup();
    renderBody();
    expect(screen.getByText('Claimed')).toBeInTheDocument();
    expect(screen.getByText('$12')).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Season' }));
    await user.click(await screen.findByRole('option', { name: /^2026/ }));
    expect(screen.getByText('No recorded moves')).toBeInTheDocument();
  });
});
