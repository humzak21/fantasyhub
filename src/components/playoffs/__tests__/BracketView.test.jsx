import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { BracketView } from '../BracketView.jsx';
import { resolveUpperBracket } from '../../../../utils/projectedBracket.js';

const teams = Array.from({ length: 14 }, (_, i) => ({
  id: `t${i + 1}`,
  name: `Team ${i + 1}`,
  divisionId: i % 2 ? 'west' : 'east',
  playoffSeed: i < 6 ? i + 1 : null,
  wins: 14 - i,
  losses: i,
  ties: 0,
  winPercentage: (14 - i) / 14,
  pointsFor: 1500 - i,
  pointsAgainst: 1000
}));

const nameOf = (team) => `Masked ${team.id}`;

describe('BracketView', () => {
  it('draws three rounds with their weeks', () => {
    render(<BracketView bracket={resolveUpperBracket({ teams })} nameOf={nameOf} />);
    expect(within(screen.getByRole('region', { name: 'Round 1' })).getByText('Week 15')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Semifinals' })).getByText('Week 16')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Championship' })).getByText('Week 17')).toBeInTheDocument();
  });

  it('prints names only through the masking it is given', () => {
    render(<BracketView bracket={resolveUpperBracket({ teams })} nameOf={nameOf} />);
    expect(screen.getAllByText('Masked t1')).toHaveLength(2); // the bye, then the semifinal
    expect(screen.queryByText('Team 1')).not.toBeInTheDocument();
  });

  it('marks the byes and what the semifinals wait for', () => {
    render(<BracketView bracket={resolveUpperBracket({ teams })} nameOf={nameOf} />);
    expect(screen.getAllByText('First-round bye')).toHaveLength(2);
    expect(screen.getByText('Lowest seed left')).toBeInTheDocument();
    expect(screen.getByText('Highest seed left')).toBeInTheDocument();
  });

  it('names the champion once there is one', () => {
    const game = (id, type, week, team1Id, team2Id, winnerTeamId = null) => ({
      id, type, week, team1Id, team2Id, winnerTeamId,
      team1Score: winnerTeamId ? 110 : null,
      team2Score: winnerTeamId ? 100 : null
    });
    const games = [
      game('b1', 'bye', 15, 't1', null),
      game('b2', 'bye', 15, 't2', null),
      game('f', 'playoff_championship', 17, 't1', 't2', 't1')
    ];
    render(<BracketView bracket={resolveUpperBracket({ games, teams })} nameOf={nameOf} />);
    expect(screen.getByText('110.00')).toBeInTheDocument();
    expect(screen.getAllByText('Masked t1').length).toBeGreaterThan(2);
  });
});
