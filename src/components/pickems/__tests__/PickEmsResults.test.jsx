import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders as render, screen, fireEvent, within } from '../../../test/renderWithProviders.jsx';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';

// The page mounts "how the league picked", which reads the viewer and a query,
// so it renders through the providers and needs the db they reach.
const pickems = { getAllPicksForWeek: vi.fn(async () => []) };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    pickems,
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => true },
    seasons: { getActiveSeason: async () => null }
  })
}));

const { default: PickEmsResults } = await import('../PickEmsResults');

beforeEach(() => {
  vi.clearAllMocks();
  pickems.getAllPicksForWeek.mockResolvedValue([]);
});

const pick = (overrides) => ({
  submissionId: 's1',
  userId: 'user-aaaaaaaa',
  displayName: 'Humza Khalil',
  team1Id: 't1',
  team1Name: 'Gridiron Gang',
  team2Id: 't2',
  team2Name: 'Waiver Wire Wizards',
  gameCompleted: true,
  actualWinnerTeamId: 't1',
  actualWinnerName: 'Gridiron Gang',
  pickedTeamId: 't1',
  pickedTeamName: 'Gridiron Gang',
  isCorrect: true,
  pointsEarned: 1,
  ...overrides,
});

// The value beside a label in a pick row's <dl>.
const valueFor = (row, label) =>
  within(row).getByText(label).nextElementSibling.textContent;

const renderBreakdown = (allPicks, props = {}) => {
  render(
    <PickEmsResults
      currentWeek={3}
      resultsAvailable
      allPicks={allPicks}
      isAdmin
      {...props}
    />
  );
  // Radix tabs activate on mouse down.
  fireEvent.mouseDown(screen.getByRole('tab', { name: /Pick Breakdown/ }), { button: 0 });
  return screen.getAllByText('Winner of Matchup:').map((dt) => dt.closest('.border'));
};

describe('PickEmsResults pick breakdown', () => {
  it('names the winner and the chosen team separately, and marks a hit', () => {
    const [row] = renderBreakdown([pick()]);

    expect(valueFor(row, 'Winner of Matchup:')).toBe('Gridiron Gang');
    expect(valueFor(row, 'Chosen:')).toBe('Gridiron Gang');
    expect(within(row).getByText('Hit')).toBeInTheDocument();
  });

  it('shows the real winner beside a different chosen team on a miss', () => {
    const [row] = renderBreakdown([
      pick({ pickedTeamId: 't2', pickedTeamName: 'Waiver Wire Wizards', isCorrect: false, pointsEarned: 0 }),
    ]);

    expect(valueFor(row, 'Winner of Matchup:')).toBe('Gridiron Gang');
    expect(valueFor(row, 'Chosen:')).toBe('Waiver Wire Wizards');
    expect(within(row).getByText('Miss')).toBeInTheDocument();
  });

  it('never names a winner for a tie or an unplayed game', () => {
    const [tie, unplayed] = renderBreakdown([
      pick({ submissionId: 's1', actualWinnerTeamId: null, actualWinnerName: null, isCorrect: false, pointsEarned: 0 }),
      pick({ submissionId: 's2', gameCompleted: false, actualWinnerTeamId: null, actualWinnerName: null, isCorrect: false, pointsEarned: 0 }),
    ]);

    expect(valueFor(tie, 'Winner of Matchup:')).toBe('Tie');
    expect(within(tie).getByText('Miss')).toBeInTheDocument();

    expect(valueFor(unplayed, 'Winner of Matchup:')).toBe('Not played yet');
    expect(valueFor(unplayed, 'Chosen:')).toBe('Gridiron Gang');
    expect(within(unplayed).getByText('Pending')).toBeInTheDocument();
  });

  it('masks the winner by its team id for a viewer who cannot see names', () => {
    const [row] = renderBreakdown([pick()], { isAdmin: false, user: null });

    const masked = getMaskedTeamName({ id: 't1', name: 'Gridiron Gang' }, null, false);
    expect(masked).not.toBe('Gridiron Gang');
    expect(valueFor(row, 'Winner of Matchup:')).toBe(masked);
    expect(valueFor(row, 'Chosen:')).toBe(masked);
  });
});

/**
 * The week's leaderboard has the same denominator problem the season
 * standings had: mid-week, a member who had picked seven games and seen one
 * played read as 1/7 at 14.3%. A hit is counted against games that have
 * finished — and, the half that is easy to lose the other way, a week that is
 * one game old must not be credited as perfect just because that one game
 * went right.
 */
const score = (overrides) => ({
  userId: 'user-aaaaaaaa',
  displayName: 'Humza Khalil',
  weeklyRank: 1,
  totalPicks: 7,
  decidedPicks: 7,
  correctPicks: 7,
  totalPoints: 7,
  isComplete: true,
  accuracyPercentage: 100,
  ...overrides,
});

const renderWeekly = (weeklyScores) =>
  render(
    <PickEmsResults
      currentWeek={2}
      resultsAvailable
      weeklyScores={weeklyScores}
      allPicks={[]}
      isAdmin
    />
  );

describe('PickEmsResults weekly leaderboard', () => {
  it('counts a record against the games played, and flags what is pending', () => {
    renderWeekly([
      score({ totalPicks: 7, decidedPicks: 2, correctPicks: 1, totalPoints: 1, isComplete: false, accuracyPercentage: 50 }),
    ]);

    expect(screen.getByText(/1\/2 correct/)).toBeInTheDocument();
    expect(screen.getByText(/5 pending/)).toBeInTheDocument();
    expect(screen.queryByText(/1\/7 correct/)).not.toBeInTheDocument();
  });

  it('does not call a week perfect while games are still to play', () => {
    renderWeekly([
      score({ decidedPicks: 1, correctPicks: 1, totalPoints: 1, isComplete: false, accuracyPercentage: 100 }),
    ]);

    // 1 from 1 is 100%, which is why the tile cannot read the percentage alone.
    const perfect = screen.getByText('Perfect Weeks').previousElementSibling;
    expect(perfect).toHaveTextContent('0');
  });

  it('calls it perfect once every game has been played', () => {
    renderWeekly([score()]);

    const perfect = screen.getByText('Perfect Weeks').previousElementSibling;
    expect(perfect).toHaveTextContent('1');
  });

  it('reports no league accuracy before a game has been played, rather than 0%', () => {
    renderWeekly([
      score({ decidedPicks: 0, correctPicks: 0, totalPoints: 0, isComplete: false, accuracyPercentage: 0 }),
    ]);

    const average = screen.getByText('Avg Accuracy').previousElementSibling;
    expect(average).toHaveTextContent('—');
  });
});

/**
 * A scored week swaps Make Picks for this tab, so "how the league picked"
 * comes with it: explained in the header card, the boxes directly under it
 * and above the Weekly Results / Pick Breakdown tabs, so they stay in view
 * whichever of the two is open — and here each matchup's winner wears a W.
 */
describe('PickEmsResults league split', () => {
  const GAMES = [
    {
      id: 'g1',
      isCompleted: true,
      winnerTeamId: 't2',
      team1Id: 't1',
      team2Id: 't2',
      team1: { id: 't1', name: 'Gridiron Gang', owner: 'Humza Khalil' },
      team2: { id: 't2', name: 'Waiver Wire Wizards', owner: 'Arya Shah' }
    }
  ];

  const renderScored = () =>
    render(
      <PickEmsResults
        currentWeek={3}
        pickEmWeek={{ id: 'pew-3', seasonId: 'season-1', weekNumber: 3 }}
        games={GAMES}
        resultsAvailable
        weeklyScores={[score()]}
        allPicks={[]}
        isAdmin
      />
    );

  beforeEach(() => {
    pickems.getAllPicksForWeek.mockResolvedValue([
      { userId: 'u1', gameId: 'g1', pickedTeamId: 't1', predictedWinnerTeamId: 't1' },
      { userId: 'u2', gameId: 'g1', pickedTeamId: 't1', predictedWinnerTeamId: 't1' }
    ]);
  });

  it('sits under the results header and above the results, with the winner marked', async () => {
    renderScored();

    const grid = await screen.findByRole('list', { name: 'How the league picked week 3' });
    const header = screen.getByText(/Pick'ems Results - Week 3/).closest('.rounded-xl');
    const tabs = screen.getByRole('tablist');

    expect(header).toContainElement(screen.getByText('How the league picked'));
    expect(header).not.toContainElement(grid);
    const follows = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(header, grid)).toBe(true);
    expect(follows(grid, tabs)).toBe(true);

    // Nobody picked the Wizards, and they won.
    await vi.waitFor(() => expect(grid).toHaveTextContent('100.0%'));
    const [gang, wizards] = within(grid).getAllByRole('listitem');
    expect(gang).not.toHaveTextContent('Won:');
    expect(wizards).toHaveTextContent('Won:');
    expect(wizards).toHaveTextContent('0.0%');
  });

  it('stays in view on the pick breakdown', async () => {
    renderScored();

    await screen.findByRole('list', { name: 'How the league picked week 3' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: /Pick Breakdown/ }), { button: 0 });

    expect(screen.getByRole('list', { name: 'How the league picked week 3' })).toBeInTheDocument();
  });

  it('shows neither without the week\'s games, and asks for nothing', () => {
    render(<PickEmsResults currentWeek={3} resultsAvailable weeklyScores={[score()]} isAdmin />);

    expect(screen.queryByText('How the league picked')).not.toBeInTheDocument();
    expect(pickems.getAllPicksForWeek).not.toHaveBeenCalled();
  });
});
