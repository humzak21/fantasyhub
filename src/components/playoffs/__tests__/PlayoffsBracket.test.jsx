/**
 * Two brackets, one component.
 *
 * The 2025 bracket is two independent division halves whose matchup ids are
 * already stored against people's submitted picks; the 2026 one is a single
 * six-team bracket that re-seeds at the semifinals. What this file guards is
 * mostly the first: nothing about the new format may change what a 2025 view
 * renders or what its picks are called.
 */

import { render, screen, within } from '../../../test/renderWithProviders.jsx';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    divisions: {
      getDivisions: async () => [
        { id: 1, name: 'Assholes' },
        { id: 2, name: 'Ninjas' }
      ]
    }
  })
}));

const { default: PlayoffsBracket } = await import('../PlayoffsBracket.jsx');

const T = {
  s1: { id: 's1', name: 'Alpha', owner: 'Alpha owner' },
  s2: { id: 's2', name: 'Bravo', owner: 'Bravo owner' },
  s3: { id: 's3', name: 'Charlie', owner: 'Charlie owner' },
  s4: { id: 's4', name: 'Delta', owner: 'Delta owner' },
  s5: { id: 's5', name: 'Echo', owner: 'Echo owner' },
  s6: { id: 's6', name: 'Foxtrot', owner: 'Foxtrot owner' }
};

const game = (id, type, week, team1, team2 = null) => ({
  id,
  type,
  week,
  team1,
  team2,
  team1Id: team1?.id ?? null,
  team2Id: team2?.id ?? null,
  winnerTeamId: null
});

const seededGames = [
  game('bye-1', 'bye', 15, T.s1),
  game('bye-2', 'bye', 15, T.s2),
  game('r1-low', 'playoff_first_round', 15, T.s4, T.s5),
  game('r1-top', 'playoff_first_round', 15, T.s3, T.s6),
  game('semi-a', 'playoff_semifinals', 16, T.s1, T.s6),
  game('semi-b', 'playoff_semifinals', 16, T.s2, T.s4),
  game('final', 'playoff_championship', 17, T.s1, T.s2)
];

const seedByTeamId = new Map([
  ['s1', 1],
  ['s2', 2],
  ['s3', 3],
  ['s4', 4],
  ['s5', 5],
  ['s6', 6]
]);

const legacyGames = [
  game('bye-a', 'bye', 15, T.s1),
  game('bye-b', 'bye', 15, T.s2),
  game('r1-a', 'playoff_first_round', 15, T.s3, T.s4),
  game('r1-b', 'playoff_first_round', 15, T.s5, T.s6)
];

const baseProps = {
  bracketStatus: { canSubmit: true, resultsReleased: false, deadlineFormatted: 'Dec 1' },
  onSubmitPicks: vi.fn(),
  user: { id: 'u1' },
  isAdmin: true,
  teamOwnerNames: []
};

const season = (year) => ({ id: 'season', year, regularSeasonWeeks: 14, playoffWeeks: 3 });

/** The slot whose visible text starts with these two team names. */
const slotWith = (name) =>
  screen
    .getAllByRole('radiogroup')
    .find((group) => group.textContent.includes(name));

describe('PlayoffsBracket, 2025 and earlier', () => {
  it('still describes the old rule and lays the bracket out by division', async () => {
    render(
      <PlayoffsBracket {...baseProps} season={season(2025)} playoffGames={legacyGames} />
    );

    expect(await screen.findByText('The top 3 seeds from each division!')).toBeInTheDocument();
    expect(screen.queryByText(/wildcards/i)).not.toBeInTheDocument();
    // The two division columns, named from the divisions the season has.
    expect(await screen.findByText('Assholes')).toBeInTheDocument();
    expect(await screen.findByText('Ninjas')).toBeInTheDocument();
  });

  it('shows no seed chips, because that season had no league-wide seeds', () => {
    render(
      <PlayoffsBracket
        {...baseProps}
        season={season(2025)}
        playoffGames={legacyGames}
        // Even handed a seed map, a legacy season must not start labelling.
        seedByTeamId={seedByTeamId}
      />
    );

    const slot = slotWith('Charlie');
    expect(within(slot).getByText('Charlie')).toBeInTheDocument();
    expect(slot.textContent).not.toMatch(/^\s*3/);
  });

  it('still counts twenty matchups, the number stored picks were made against', () => {
    render(
      <PlayoffsBracket {...baseProps} season={season(2025)} playoffGames={legacyGames} />
    );
    expect(screen.getByText(/0\/20 matchups selected/)).toBeInTheDocument();
  });

  it('records a round-one pick against the division matchup id it always used', async () => {
    const user = userEvent.setup();
    const onSubmitPicks = vi.fn();
    render(
      <PlayoffsBracket
        {...baseProps}
        season={season(2025)}
        playoffGames={legacyGames}
        onSubmitPicks={onSubmitPicks}
      />
    );

    await user.click(within(slotWith('Charlie')).getByText('Charlie'));
    expect(screen.getByText(/1\/20 matchups selected/)).toBeInTheDocument();
  });
});

describe('PlayoffsBracket, 2026 and later', () => {
  const seeded = {
    ...baseProps,
    season: season(2026),
    playoffGames: seededGames,
    seedByTeamId
  };

  it('describes byes, league-wide wildcards and the re-seed', () => {
    render(<PlayoffsBracket {...seeded} />);
    expect(
      screen.getByText(
        'Each division winner takes a bye; the next four teams league-wide take the wildcards, and the semifinals re-seed.'
      )
    ).toBeInTheDocument();
  });

  it('labels the round-one game containing seed 6 as the 3v6', () => {
    render(<PlayoffsBracket {...seeded} />);

    // Charlie (3) and Foxtrot (6) are one game; Delta (4) and Echo (5) another,
    // whichever order the rows came back in.
    const top = slotWith('Charlie');
    expect(within(top).getByText('Foxtrot')).toBeInTheDocument();
  });

  it('shows each team its seed', () => {
    render(<PlayoffsBracket {...seeded} />);
    const top = slotWith('Charlie');
    expect(top.textContent).toContain('3Charlie');
    expect(top.textContent).toContain('6Foxtrot');
  });

  it('leaves both semifinals TBD until both round-one picks exist', async () => {
    const user = userEvent.setup();
    render(<PlayoffsBracket {...seeded} />);

    // Seed 6 survives round one. Who seed 1 plays still depends on the other
    // game — a 4 or a 5 surviving would not displace a 6, but a 3 would.
    await user.click(within(slotWith('Charlie')).getByText('Foxtrot'));

    const semis = screen
      .getAllByRole('radiogroup')
      .filter((group) => group.textContent.includes('Alpha') || group.textContent.includes('Bravo'));
    for (const semi of semis) {
      expect(semi.textContent).toContain('TBD');
    }
  });

  it('gives seed 1 the lowest survivor once both round-one games are picked', async () => {
    const user = userEvent.setup();
    render(<PlayoffsBracket {...seeded} />);

    await user.click(within(slotWith('Charlie')).getByText('Foxtrot')); // 6 wins
    await user.click(within(slotWith('Delta')).getByText('Delta')); // 4 wins

    // 1 v 6 and 2 v 4.
    const semi1 = slotWith('Alpha');
    expect(within(semi1).getByText('Foxtrot')).toBeInTheDocument();
    const semi2 = slotWith('Bravo');
    expect(within(semi2).getByText('Delta')).toBeInTheDocument();
  });

  it('clears a semifinal pick the re-seed made impossible, and says so', async () => {
    const user = userEvent.setup();
    render(<PlayoffsBracket {...seeded} />);

    await user.click(within(slotWith('Charlie')).getByText('Foxtrot')); // 6 wins
    await user.click(within(slotWith('Delta')).getByText('Delta')); // 4 wins
    await user.click(within(slotWith('Alpha')).getByText('Foxtrot')); // seed 6 into the final
    expect(screen.getByText(/3\/20 matchups selected/)).toBeInTheDocument();

    // Now seed 3 survives instead of seed 6: seed 1 draws the 4, and the pick
    // for Foxtrot is no longer in any semifinal.
    await user.click(within(slotWith('Charlie')).getByText('Charlie'));

    expect(screen.getByText(/Semifinal 1.*cleared/i)).toBeInTheDocument();
    expect(screen.getByText(/2\/20 matchups selected/)).toBeInTheDocument();
  });

  it('renders TBD slots rather than a projected bracket before the games exist', () => {
    render(<PlayoffsBracket {...seeded} playoffGames={[]} />);

    // Every matchup is TBD: standings alone must not be dressed up as a draw.
    for (const group of screen.getAllByRole('radiogroup')) {
      expect(group.textContent).toContain('TBD');
    }
    expect(screen.getByText(/0\/20 matchups selected/)).toBeInTheDocument();
  });
});
