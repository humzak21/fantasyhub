/**
 * The table's component legend was written out by hand and named six
 * components with weights that matched neither the calculator nor
 * `POWER_RANKING_WEIGHTS` — the user was reading a description of an algorithm
 * that had not run in a long time. It is derived from the weights now, and
 * these tests hold that derivation in place.
 *
 * The second thing worth pinning is the difference between a component with no
 * data and a component that scored zero. The old breakdown coalesced both to
 * `0.00` with a full-width label, which is how a roster metric that had never
 * once been computed appeared as a confident number for every team.
 *
 * Cell assertions are scoped with `within(table())`. The table now renders
 * through ResponsiveDataTable, which emits *both* a table and a card stack and
 * lets CSS choose — in a browser exactly one of them is `display: none` and so
 * out of the accessibility tree, but jsdom applies no CSS and sees both. An
 * unscoped `getByText` therefore finds two of everything. Scoping says which
 * layout the assertion is about, which is more precise than what it replaced.
 */

import { describe, it, expect } from 'vitest';
import { renderWithProviders, screen, within } from '../../../test/renderWithProviders.jsx';
import PowerRankingsTable from '../PowerRankingsTable.jsx';
import { POWER_RANKING_WEIGHTS, POWER_RANKING_COMPONENT_META } from '../../../../types/index.js';

const team = (overrides = {}) => ({
  teamId: 't1',
  id: 't1',
  name: 'Lightskin Empire',
  owner: 'Alice Example',
  rank: 1,
  wins: 3,
  losses: 0,
  ties: 0,
  winPercentage: 1,
  pointsFor: 375,
  pointsAgainst: 240,
  pointDifferential: 135,
  currentStreak: { type: 'win', length: 3 },
  powerRating: 87.5,
  playoffOdds: 92,
  recentForm: 8.4,
  qualityWins: 2,
  badLosses: 0,
  powerRatingComponents: {
    record: 100,
    allPlay: 92,
    scoring: 88,
    recentForm: 76,
    consistency: 64,
    rosterStrength: null,
    lineupEfficiency: null,
    futureStrength: null,
    leagueSos: 41,
    allPlayWinPct: 92,
    luckPercentage: 0.08
  },
  ...overrides
});

describe('PowerRankingsTable', () => {
  const table = () => screen.getByRole('table');

  // One precision policy, from src/utils/format.js: points and ratings to one
  // decimal, percentages to one, records with an en dash. The table used to
  // print `87.50` and `+135.00`, two decimals of a quantity whose inputs are
  // not that precise, and a different precision again in the standings drawer.
  it('renders a team with its record and rating', () => {
    renderWithProviders(<PowerRankingsTable rankings={[team()]} currentWeek={4} />);

    expect(within(table()).getByText('3–0')).toBeInTheDocument();
    expect(within(table()).getByText('87.5')).toBeInTheDocument();
    expect(within(table()).getByText('+135.0')).toBeInTheDocument();
  });

  it('renders the same row as a card, from the same column definitions', () => {
    const { container } = renderWithProviders(
      <PowerRankingsTable rankings={[team()]} currentWeek={4} />
    );

    const cardStack = container.querySelector('.md\\:hidden');
    expect(cardStack.children).toHaveLength(1);
    expect(within(cardStack).getByText('3–0')).toBeInTheDocument();
    expect(within(cardStack).getByText('87.5')).toBeInTheDocument();
  });

  it('masks the team name for a signed-out viewer', () => {
    // These tests render with no authenticated user, so the league's names are
    // masked to a truncated team id — asserting on the real name here would be
    // asserting that the masking is broken.
    renderWithProviders(<PowerRankingsTable rankings={[team()]} currentWeek={4} />);

    expect(screen.queryByText('Lightskin Empire')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice Example')).not.toBeInTheDocument();
    // Team name and owner name both mask to the same truncated id.
    expect(within(table()).getAllByText('t1')).toHaveLength(2);
  });

  it('labels every component from the weights, in the advanced legend', () => {
    renderWithProviders(
      <PowerRankingsTable rankings={[team()]} currentWeek={4} showAdvanced />
    );

    for (const [key, weight] of Object.entries(POWER_RANKING_WEIGHTS)) {
      const label = POWER_RANKING_COMPONENT_META[key].label;
      const expected = `${label} (${Math.round(weight * 100)}%):`;
      expect(screen.getByText(expected)).toBeInTheDocument();
    }
  });

  it('describes playoff odds by the field, not by a division place', () => {
    renderWithProviders(
      <PowerRankingsTable rankings={[team()]} currentWeek={4} showAdvanced />
    );

    // The legend said "finishing top 3 in the division", which stopped being
    // what the column measures when 2026 moved to league-wide wildcards.
    expect(
      screen.getByText('Probability of making the six-team playoff field')
    ).toBeInTheDocument();
    expect(screen.queryByText(/top 3 in the division/i)).not.toBeInTheDocument();
  });

  it('names no component the calculator no longer produces', () => {
    renderWithProviders(
      <PowerRankingsTable rankings={[team()]} currentWeek={4} showAdvanced />
    );

    for (const stale of ['Performance (25%):', 'Team Strength (20%):', 'Clutch (5%):']) {
      expect(screen.queryByText(stale)).not.toBeInTheDocument();
    }
  });

  it('explains that missing components are dropped rather than zeroed', () => {
    renderWithProviders(
      <PowerRankingsTable rankings={[team()]} currentWeek={4} showAdvanced />
    );

    expect(screen.getByText(/remaining\s+weights are rescaled/i)).toBeInTheDocument();
  });

  // Luck keeps both its sign and its unit. It is a deviation from an
  // expectation, so "+8.0%" says which way and of what; rendering it as a bare
  // signed number leaves the reader guessing at the scale.
  it('shows the luck percentage the calculator reports, signed', () => {
    renderWithProviders(<PowerRankingsTable rankings={[team()]} currentWeek={4} />);
    expect(within(table()).getByText('+8.0%')).toBeInTheDocument();
  });

  it('renders a loading indicator instead of an empty page', () => {
    renderWithProviders(<PowerRankingsTable rankings={[]} currentWeek={4} loading />);
    // The same spinner every other route shows. This was a table skeleton —
    // the last one in the app — so a page load looked different depending on
    // which tab you opened, and its uncoloured borders drew in white.
    expect(screen.getAllByRole('status', { name: /loading/i }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders an empty state when there is nothing to rank', () => {
    renderWithProviders(<PowerRankingsTable rankings={[]} currentWeek={4} />);
    expect(screen.getByText('No rankings yet')).toBeInTheDocument();
    expect(screen.getByText(/week 4 needs teams/i)).toBeInTheDocument();
  });

  it('shows how far each team moved since last week', () => {
    renderWithProviders(
      <PowerRankingsTable rankings={[team({ rankChange: 2 })]} currentWeek={4} />
    );
    // Movement is stated in words for assistive tech, not just an arrow.
    expect(within(table()).getByText(/2 places up from last week/i)).toBeInTheDocument();
  });
});
