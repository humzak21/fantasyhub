/**
 * The commissioner dashboard.
 *
 * The load-bearing assertion is the access one: this page shows real names, so
 * a viewer who is neither the admin nor the commissioner must not reach it —
 * and the *reason* they cannot is RLS, which returns them no rows regardless.
 * The check here is that the page says so instead of rendering an empty table
 * that reads as "nobody has picked".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';

const parlay = { getSeasonParlayPicks: vi.fn(async () => []) };
const pickems = { getAllPickEmWeeks: vi.fn(async () => []) };
const users = {
  isParlayCommissioner: vi.fn(async () => true),
  getUserDisplayNames: vi.fn(async () => ({ u1: 'Arya Shah', u2: 'Rohit Ramki' }))
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    parlay,
    pickems,
    users,
    seasons: { getActiveSeason: async () => null }
  })
}));

const auth = {
  user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
  isAuthenticated: true,
  isAdmin: false,
  loading: false
};

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: ParlayCommissionerDashboard } = await import(
  '../ParlayCommissionerDashboard.jsx'
);

const SEASON = { id: 's1', year: 2026, name: '2026 Season' };

const WEEKS = [
  { id: 'pew-1', weekNumber: 1 },
  { id: 'pew-2', weekNumber: 2 }
];

const PICKS = [
  {
    id: 'a',
    userId: 'u1',
    week: 2,
    playerId: 'p-jj',
    playerNameRaw: 'Justin Jefferson',
    scoredTd: true,
    submittedAt: '2026-09-09T12:00:00Z',
    player: { position: 'WR', teamAbbreviation: 'MIN' }
  },
  {
    id: 'b',
    userId: 'u2',
    week: 2,
    playerId: null,
    playerNameRaw: 'Some Rookie',
    scoredTd: null,
    submittedAt: '2026-09-09T13:00:00Z',
    player: null
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  users.isParlayCommissioner.mockResolvedValue(true);
  users.getUserDisplayNames.mockResolvedValue({ u1: 'Arya Shah', u2: 'Rohit Ramki' });
  pickems.getAllPickEmWeeks.mockResolvedValue(WEEKS);
  parlay.getSeasonParlayPicks.mockResolvedValue(PICKS);
  Object.assign(auth, { isAdmin: false, isAuthenticated: true });
});

describe('ParlayCommissionerDashboard', () => {
  it('shows every member\'s pick under their real name for the commissioner', async () => {
    renderWithProviders(<ParlayCommissionerDashboard season={SEASON} />);

    expect(await screen.findAllByText('Arya Shah')).not.toHaveLength(0);
    expect(screen.getAllByText('Rohit Ramki').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Justin Jefferson').length).toBeGreaterThan(0);
  });

  it('flags a free-text pick, which is the one nothing can auto-grade', async () => {
    renderWithProviders(<ParlayCommissionerDashboard season={SEASON} />);

    expect(await screen.findAllByText(/unmatched/i)).not.toHaveLength(0);
  });

  it('turns an ungraded pick into "Ungraded", not "No TD"', async () => {
    renderWithProviders(<ParlayCommissionerDashboard season={SEASON} />);

    expect(await screen.findAllByText(/ungraded/i)).not.toHaveLength(0);
    expect(screen.queryByText('No TD')).not.toBeInTheDocument();
  });

  it('turns an ordinary viewer away instead of showing an empty table', async () => {
    users.isParlayCommissioner.mockResolvedValue(false);
    parlay.getSeasonParlayPicks.mockResolvedValue([]);

    renderWithProviders(<ParlayCommissionerDashboard season={SEASON} />);

    expect(await screen.findByText(/parlay commissioner/i)).toBeInTheDocument();
    expect(screen.queryByText('Justin Jefferson')).not.toBeInTheDocument();
  });

  it('explains an empty season rather than rendering a bare table', async () => {
    pickems.getAllPickEmWeeks.mockResolvedValue([]);
    parlay.getSeasonParlayPicks.mockResolvedValue([]);

    renderWithProviders(<ParlayCommissionerDashboard season={SEASON} />);

    expect(await screen.findByText(/no pick.em weeks yet/i)).toBeInTheDocument();
  });

  it('says there is nothing to show without an active season', async () => {
    renderWithProviders(<ParlayCommissionerDashboard season={null} />);

    expect(await screen.findByText(/no active season/i)).toBeInTheDocument();
  });
});
