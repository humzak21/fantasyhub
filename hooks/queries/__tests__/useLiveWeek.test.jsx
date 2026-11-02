/**
 * When a browser asks for the live week at all. It must never run for history,
 * and on a Sunday it must keep asking after an answer that says nothing is on
 * yet, because that answer came from Thursday's row.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const liveScores = { getLiveWeek: vi.fn() };
const games = { getSeasonGames: vi.fn() };
const teams = { getTeamsForSeason: vi.fn() };

vi.mock('../../../services/db/index.js', () => ({ getDb: () => ({ liveScores, games, teams }) }));

const { useLiveWeek } = await import('../useLiveWeek.js');

const WEEK = 8;
const GAMES = [
  { id: 'g1', week: 7, type: 'regular', team1Id: 'a', team2Id: 'b', team1Score: 100, team2Score: 90 },
  { id: 'g2', week: 8, type: 'regular', team1Id: 'a', team2Id: 'b', team1Score: null, team2Score: null, espn_matchup_id: 50 }
];

const SNAPSHOT = {
  matchups: [
    {
      espnMatchupId: 50,
      home: { espnTeamId: 6, points: 18.5, projected: 120 },
      away: { espnTeamId: 2, points: 40, projected: 110 },
      espnWinner: 'UNDECIDED'
    }
  ],
  lineups: {},
  nflGames: {},
  live: true,
  windowOpen: true,
  refreshedAt: '2026-11-01T19:30:00Z'
};

function setup(week, actualWeek) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  return renderHook(() => useLiveWeek('s1', week, { actualWeek }), { wrapper });
}

describe('useLiveWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    games.getSeasonGames.mockResolvedValue(GAMES);
    teams.getTeamsForSeason.mockResolvedValue([
      { id: 'a', espn_team_id: 6 },
      { id: 'b', espn_team_id: 2 }
    ]);
    liveScores.getLiveWeek.mockResolvedValue(SNAPSHOT);
  });

  it('joins the week in progress to this league', async () => {
    const { result } = setup(WEEK, WEEK);

    await waitFor(() => expect(result.current.data?.games.g2).toBeDefined());

    expect(result.current.data.games.g2.team2.points).toBe(40);
    expect(liveScores.getLiveWeek).toHaveBeenCalledWith('s1', WEEK);
  });

  it('never asks about a week whose games have all been scored', async () => {
    const { result } = setup(7, WEEK);

    await waitFor(() => expect(games.getSeasonGames).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(liveScores.getLiveWeek).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it('never asks before the week is known', async () => {
    setup(WEEK, null);

    await waitFor(() => expect(games.getSeasonGames).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(liveScores.getLiveWeek).not.toHaveBeenCalled();
  });

  it('reads nothing live until the first refresh has stored something', async () => {
    liveScores.getLiveWeek.mockResolvedValue({ ...SNAPSHOT, refreshedAt: null });
    const { result } = setup(WEEK, WEEK);

    await waitFor(() => expect(liveScores.getLiveWeek).toHaveBeenCalled());
    expect(result.current.data).toBeNull();
  });
});
