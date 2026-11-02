import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import PlayoffSchedule from '../PlayoffSchedule.jsx';

const standings = vi.hoisted(() => ({ current: { isPending: false, data: null } }));

vi.mock('../../../contexts/ViewerContext.jsx', () => ({
  useViewer: () => ({ user: null, isAdmin: false, teamOwnerNames: [] })
}));
vi.mock('../../../utils/displayNameUtils', async (importOriginal) => ({
  ...(await importOriginal()),
  getMaskedTeamName: (team) => `Masked ${team.id}`
}));
vi.mock('../../../../hooks/queries/index.js', () => ({
  useStandings: () => standings.current
}));

const teams = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Team ${i + 1}`,
  owner: `Owner ${i + 1}`,
  divisionId: i % 2 ? 'west' : 'east',
  playoffSeed: i < 6 ? i + 1 : null,
  wins: 14 - i,
  losses: i,
  ties: 0,
  winPercentage: (14 - i) / 14,
  pointsFor: 1500 - i,
  pointsAgainst: 1000
}));

const season = { id: 's26', year: 2026, teams };

const game = (id, type, week, team1Id, team2Id, scores = {}) => ({
  id, type, week, team1Id, team2Id, team1Score: null, team2Score: null, ...scores
});

const renderSchedule = (props = {}) => {
  const renderBoxScore = vi.fn((boxScoreGame) => <p>Box score for {boxScoreGame.id}</p>);
  render(
    <PlayoffSchedule
      season={season}
      schedule={[]}
      firstRoundWeek={15}
      renderBoxScore={renderBoxScore}
      fallback={<p>The flat list</p>}
      {...props}
    />
  );
  return renderBoxScore;
};

describe('PlayoffSchedule', () => {
  beforeEach(() => {
    standings.current = {
      isPending: false,
      data: { divisions: [{ divisionId: 'all', teams }], unassigned: [] }
    };
  });

  it('projects the bracket off the standings before ESPN has drawn it', () => {
    renderSchedule({ schedule: [game('r', 'regular', 14, 't1', 't2')] });

    expect(screen.getByText('Projected')).toBeInTheDocument();
    expect(screen.getByText(/If the season ended today/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Box score: Masked t3 vs Masked t6' })).toBeInTheDocument();
  });

  it('opens a projected matchup without inventing a game', () => {
    const renderBoxScore = renderSchedule();

    fireEvent.click(screen.getByRole('button', { name: 'Box score: Masked t3 vs Masked t6' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('A projected matchup');
    expect(renderBoxScore.mock.calls[0][0]).toMatchObject({ isProjected: true, team1Id: 't3', team2Id: 't6', week: 15 });
  });

  it('draws the real game once ESPN has, and opens that row', () => {
    const final = game('final', 'playoff_championship', 17, 't1', 't3', {
      team1Score: 140.1,
      team2Score: 120.2,
      isCompleted: true,
      winnerTeamId: 't1'
    });
    const renderBoxScore = renderSchedule({
      schedule: [game('b1', 'bye', 15, 't1', null), game('b2', 'bye', 15, 't2', null), final]
    });

    expect(screen.queryByText('Projected')).not.toBeInTheDocument();
    expect(screen.getByText('140.10')).toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('region', { name: 'Championship' })).getByRole('button')
    );

    expect(renderBoxScore.mock.calls[0][0]).toBe(final);
    expect(screen.getByRole('dialog')).toHaveTextContent('Week 17 box score');
    expect(screen.getByText('Box score for final')).toBeInTheDocument();
  });

  it('keeps the games the bracket does not draw, and they open too', () => {
    const renderBoxScore = renderSchedule({
      schedule: [
        game('b1', 'bye', 15, 't1', null),
        game('c1', 'playoff_consolation_quarterfinals', 15, 't7', 't8'),
        game('p3', 'playoff', 17, 't3', 't4')
      ]
    });

    const consolation = screen.getByRole('region', { name: 'Consolation and placement games' });
    expect(within(consolation).getByText('Week 15')).toBeInTheDocument();
    expect(within(consolation).getByText('Week 17')).toBeInTheDocument();

    fireEvent.click(within(consolation).getByRole('button', { name: 'Box score: Masked t7 vs Masked t8' }));
    expect(renderBoxScore.mock.calls[0][0].id).toBe('c1');
  });

  it('shows one week of them on a week view', () => {
    renderSchedule({
      week: 15,
      schedule: [
        game('b1', 'bye', 15, 't1', null),
        game('c1', 'playoff_consolation_quarterfinals', 15, 't7', 't8'),
        game('p3', 'playoff', 17, 't3', 't4')
      ]
    });

    const consolation = screen.getByRole('region', { name: 'Consolation and placement games' });
    expect(within(consolation).getAllByRole('button')).toHaveLength(1);
  });

  it('falls back to the list when there is no field to seed', () => {
    standings.current = { isPending: false, data: { divisions: [], unassigned: [] } };
    renderSchedule();

    expect(screen.getByText('The flat list')).toBeInTheDocument();
  });

  it('waits for the standings rather than flashing the fallback', () => {
    standings.current = { isPending: true, data: null };
    renderSchedule();

    expect(screen.queryByText('The flat list')).not.toBeInTheDocument();
  });
});
