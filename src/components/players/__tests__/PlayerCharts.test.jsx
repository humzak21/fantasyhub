import { cloneElement } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import PlayerCharts from '../sections/PlayerCharts.jsx';
import { buildPlayerProfile } from '../../../../utils/playerProfile/buildPlayerProfile.js';

// jsdom has no layout, so ResponsiveContainer measures 0x0 and draws nothing.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) => (
      <div style={{ width: 400, height: 200 }}>{cloneElement(children, { width: 400, height: 200 })}</div>
    )
  };
});

const seasons = [
  { id: 's25', year: 2025, nflSeasonYear: 2025, regularSeasonWeeks: 14, playoffWeeks: 3, totalWeeks: 17, isActive: false },
  { id: 's26', year: 2026, nflSeasonYear: 2026, regularSeasonWeeks: 14, playoffWeeks: 3, totalWeeks: 17, isActive: true }
];
const teams = [
  { id: 't25', seasonId: 's25', franchiseId: 'fA', name: 'Alpha 25', owner: 'Owner A' },
  { id: 't26', seasonId: 's26', franchiseId: 'fA', name: 'Alpha 26', owner: 'Owner A' }
];
const franchises = [{ id: 'fA', owner_name: 'Owner A', display_name: null }];

function line(seasonId, year, week, position, actualPoints, statBreakdown, extra = {}) {
  return {
    id: `${seasonId}-${week}`, seasonId, year, week, playerId: 'p1', espnPlayerId: 100,
    teamId: seasonId === 's25' ? 't25' : 't26', franchiseId: 'fA', position,
    rosterSlot: 'RB', started: true, actualPoints, projectedPoints: 12, proTeamId: 8,
    statBreakdown, overallRank: 10, overallOf: 150, positionRank: week, positionOf: 40,
    gameId: `g-${seasonId}-${week}`, gameType: 'regular', teamScore: 100, opponentScore: 90,
    result: 'W', isBye: false,
    ...extra
  };
}

function profileFor(position, lines) {
  return buildPlayerProfile({
    player: { id: 'p1', espnPlayerId: 100, name: 'Test Player', position, proTeamId: 8 },
    lines, teams, franchises, seasons, current: null, events: []
  });
}

const rb = () => profileFor('RB', [
  line('s25', 2025, 1, 'RB', 10, { 23: 10, 24: 40, 53: 2, 42: 15 }),
  line('s25', 2025, 2, 'RB', 14, { 23: 12, 24: 60, 53: 3, 42: 20 }),
  line('s26', 2026, 1, 'RB', 20, { 23: 15, 24: 90, 53: 4, 42: 30 }),
  line('s26', 2026, 2, 'RB', 8, { 23: 8, 24: 30, 53: 1, 42: 5 }, { started: false, rosterSlot: 'BE' })
]);

describe('PlayerCharts', () => {
  it('draws the four season charts for a running back, with the yards chart', () => {
    const profile = rb();
    const season = profile.seasons[0];
    const { container } = render(<PlayerCharts profile={profile} season={season} mode="season" maskName={(f) => f.owner_name} />);

    expect(screen.getByText('Points by week')).toBeInTheDocument();
    expect(screen.getByText('Points so far')).toBeInTheDocument();
    expect(screen.getByText('Weekly RB rank')).toBeInTheDocument();
    expect(screen.getByText('Yards by week')).toBeInTheDocument();
    expect(screen.getByText(/Dashed line: his average, 14\.0/)).toBeInTheDocument();
    expect(screen.getByText(/scored his average every game/)).toBeInTheDocument();
    expect(screen.getByText('Rushing and receiving yards, stacked.')).toBeInTheDocument();
    expect(container.querySelectorAll('svg.recharts-surface').length).toBeGreaterThan(0);
  });

  it('says so quietly when a season has no stat lines, rather than drawing an empty axis', () => {
    const profile = profileFor('RB', [line('s26', 2026, 1, 'RB', 9, null)]);
    render(<PlayerCharts profile={profile} season={profile.seasons[0]} mode="season" />);
    expect(screen.getByText('Yards by week')).toBeInTheDocument();
    expect(screen.getByText('No stat lines stored for this season.')).toBeInTheDocument();
    expect(screen.queryByText('Rushing and receiving yards, stacked.')).not.toBeInTheDocument();
  });

  it('says so when he never played in the season', () => {
    const profile = profileFor('RB', [line('s26', 2026, 1, 'RB', null, null)]);
    render(<PlayerCharts profile={profile} season={profile.seasons[0]} mode="season" />);
    expect(screen.getByText('No games played this season.')).toBeInTheDocument();
  });

  it('gives a quarterback the passing chart and no yards stack', () => {
    const profile = profileFor('QB', [
      line('s26', 2026, 1, 'QB', 22, { 0: 31, 1: 20, 3: 280, 4: 2, 24: 15 }),
      line('s26', 2026, 2, 'QB', 18, { 0: 28, 1: 19, 3: 240, 4: 1, 24: 5 })
    ]);
    render(<PlayerCharts profile={profile} season={profile.seasons[0]} mode="season" />);
    expect(screen.getByText('Passing by week')).toBeInTheDocument();
    expect(screen.getByText(/passing TDs, on the right axis/)).toBeInTheDocument();
    expect(screen.queryByText('Yards by week')).not.toBeInTheDocument();
  });

  it('draws season-by-season charts in all mode and skips the category chart', () => {
    const profile = rb();
    render(<PlayerCharts profile={profile} season={null} mode="all" />);
    expect(screen.getByText('Points per game by season')).toBeInTheDocument();
    expect(screen.getByText('Total points by season')).toBeInTheDocument();
    expect(screen.getByText('Career points')).toBeInTheDocument();
    expect(screen.queryByText('Yards by week')).not.toBeInTheDocument();
    expect(screen.queryByText('Points by week')).not.toBeInTheDocument();
  });
});
