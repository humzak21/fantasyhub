/**
 * The home page's pick'ems widget. Pinned: the counters read "of N" from the
 * season's league size, and never "of —" without one; the picks under the
 * disclosure start from a draft made anywhere (the tab, a reload); and a
 * submission from here goes through the tab's own mutation and clears the
 * draft. The parlay half is `ParlayMyPick`, tested with the tab.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { browserStorage, readDraft, writeDraft } from '../../pickems/pickDraft.js';

const HOUR = 60 * 60 * 1000;
let q;
const mutateAsync = vi.fn(async () => {});

vi.mock('../../../contexts/ViewerContext.jsx', () => ({
  useViewer: () => ({
    user: { id: 'u1', user_metadata: { name: 'Owner 1' } },
    isAdmin: false,
    isApproved: true,
    isAuthenticated: true,
    teamOwnerNames: [{ ownerName: 'Owner 1' }]
  })
}));
vi.mock('../../pickems/ParlayMyPick.jsx', () => ({ default: () => <p>parlay pick</p> }));
vi.mock('../../../../hooks/queries/index.js', () => ({
  useNow: () => new Date(),
  usePickEmWeek: () => q.week,
  usePickEmGameData: () => q.games,
  useUserPicks: () => q.userPicks,
  useAllPicks: () => q.allPicks,
  useParlayWeekPicks: () => q.parlayPicks,
  useParlayLive: () => ({ data: undefined }),
  useMyParlayPick: () => q.myParlay,
  useNflOpponentMap: () => ({ data: {} }),
  usePickEmMutations: () => ({ submitPicks: { mutateAsync } }),
  useWeeklyPickEmScores: () => ({ data: [], isPending: false })
}));

const { default: PickemsParlayWidget } = await import('../widgets/PickemsParlayWidget.jsx');

const team = (id, owner) => ({ id, name: `Team ${id}`, owner });
const GAMES = [
  { id: 'g1', isCompleted: false, team1Id: 't1', team2Id: 't2', team1: team('t1', 'A'), team2: team('t2', 'B') },
  { id: 'g2', isCompleted: false, team1Id: 't3', team2Id: 't4', team1: team('t3', 'C'), team2: team('t4', 'D') }
];
const openWeek = () => ({
  id: 'w7',
  seasonId: 's',
  weekNumber: 7,
  submissionOpensAt: new Date(Date.now() - 24 * HOUR).toISOString(),
  submissionClosesAt: new Date(Date.now() + 28.5 * HOUR).toISOString(),
  resultsRevealAt: new Date(Date.now() + 5 * 24 * HOUR).toISOString()
});
const ok = (data) => ({ data, isPending: false, isError: false, refetch: vi.fn() });

const render = () =>
  rtlRender(
    <MemoryRouter>
      <PickemsParlayWidget ctx={{ seasonId: 's', season: q.season, actualWeek: 7, openTab: vi.fn() }} />
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  mutateAsync.mockClear();
  q = {
    week: ok(openWeek()),
    games: ok(GAMES),
    userPicks: ok([]),
    allPicks: ok(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((userId) => ({ userId, gameId: 'g1' }))),
    parlayPicks: ok(Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, userId: `m${i}` }))),
    season: { year: 2026, leagueSize: 14 },
    myParlay: { data: null, isLoading: false }
  };
});

describe('PickemsParlayWidget', () => {
  it('pairs each tile with the league\'s turnout, "of" the season\'s league size', () => {
    render();
    expect(screen.getByText('9 of 14 picked')).toBeInTheDocument();
    expect(screen.getByText('7 of 14 parlays in')).toBeInTheDocument();
    expect(screen.getByText(/closes in 1d 4h/i)).toBeInTheDocument();
  });

  it('follows the league size the admin set, not a count of accounts', () => {
    q.season = { year: 2026, leagueSize: 12 };
    render();
    expect(screen.getByText('9 of 12 picked')).toBeInTheDocument();
  });

  it('reads "9 picked" without a league size, never "of —"', () => {
    q.season = { year: 2026 };
    render();
    expect(screen.getByText('9 picked')).toBeInTheDocument();
    expect(screen.getByText('7 parlays in')).toBeInTheDocument();
  });

  it('says what is left to do: picks not in, and no scorer yet', () => {
    render();
    const picks = screen.getByRole('button', { name: /^pick'ems/i });
    expect(within(picks).getByText('Not submitted yet')).toBeInTheDocument();
    expect(within(picks).getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /td parlay/i })).toHaveTextContent(/pick a scorer/i);
  });

  it('opens one panel at a time from the tiles', async () => {
    render();
    await userEvent.click(screen.getByRole('button', { name: /td parlay/i }));
    expect(screen.getByText('parlay pick')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^pick'ems/i }));
    expect(screen.queryByText('parlay pick')).not.toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Pick the winner of game 1' })).toBeInTheDocument();
  });

  it('opens on a draft made elsewhere', async () => {
    writeDraft(browserStorage(), 'u1', 'w7', { picks: { g1: 't2' } });
    render();

    const tile = screen.getByRole('button', { name: /^pick'ems/i });
    expect(within(tile).getByText(/draft — not submitted/i)).toBeInTheDocument();
    await userEvent.click(tile);

    const game1 = screen.getByRole('radiogroup', { name: 'Pick the winner of game 1' });
    expect(within(game1).getByRole('radio', { name: /team t2/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('submits through the tab’s mutation and clears the draft', async () => {
    render();
    await userEvent.click(screen.getByRole('button', { name: /^pick'ems/i }));

    await userEvent.click(screen.getByRole('radio', { name: /team t1/i }));
    await userEvent.click(screen.getByRole('radio', { name: /team t4/i }));
    expect(readDraft(browserStorage(), 'u1', 'w7').picks).toEqual({ g1: 't1', g2: 't4' });

    await userEvent.click(screen.getByRole('button', { name: /submit picks/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      pickEmWeekId: 'w7',
      picks: [
        { gameId: 'g1', predictedWinnerTeamId: 't1', confidenceLevel: 1 },
        { gameId: 'g2', predictedWinnerTeamId: 't4', confidenceLevel: 1 }
      ]
    });
    expect(readDraft(browserStorage(), 'u1', 'w7')).toBeNull();
  });

  it('says so on a week with no pick’em row', () => {
    q.week = ok(null);
    render();
    expect(screen.getByText(/no pick'ems this week/i)).toBeInTheDocument();
  });

  it('says when picks open, and offers nothing to do before then', () => {
    q.week = ok({
      ...openWeek(),
      submissionOpensAt: new Date(Date.now() + 2 * HOUR).toISOString()
    });
    render();
    expect(screen.queryByText(/picked/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/^pick'ems$/i)).toBeInTheDocument();
    expect(screen.getByText(/opens with pick'ems/i)).toBeInTheDocument();
  });
});
