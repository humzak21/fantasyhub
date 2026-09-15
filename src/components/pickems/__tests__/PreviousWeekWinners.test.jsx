/**
 * The previous week's winners strip.
 *
 * What must not break: it names every member tied on the top score, and it
 * reveals nothing — issues no query at all — for a week whose results the
 * Results tab would still be withholding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithProviders, screen } from '../../../test/renderWithProviders.jsx';
import { getMaskedUserName } from '../../../utils/displayNameUtils';

const pickems = { getWeeklyPickEmScores: vi.fn(async () => []) };

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    pickems,
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => true },
    seasons: { getActiveSeason: async () => null }
  })
}));

const auth = {
  user: { id: 'u1', user_metadata: { name: 'Arya Shah' } },
  isAuthenticated: true,
  isAdmin: true,
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn()
};

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: PreviousWeekWinners } = await import('../PreviousWeekWinners.jsx');

const REVEALED = { weekNumber: 1, pickEmWeekId: 'pew-1', resultsAvailable: true };

const score = (userId, displayName, totalPoints, weeklyRank) => ({
  userId,
  displayName,
  totalPoints,
  correctPicks: totalPoints,
  totalPicks: 7,
  weeklyRank
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(auth, { isAdmin: true, user: { id: 'u1', user_metadata: { name: 'Arya Shah' } } });
});

describe('PreviousWeekWinners', () => {
  it('names the winner and their score', async () => {
    pickems.getWeeklyPickEmScores.mockResolvedValue([
      score('u2', 'Rohit Ramki', 6, 1),
      score('u3', 'Humza Khalil', 5, 2)
    ]);

    renderWithProviders(<PreviousWeekWinners week={1} status={REVEALED} />);

    const strip = await screen.findByLabelText("Week 1 pick'em winner");
    expect(strip).toHaveTextContent('Week 1 winner');
    expect(strip).toHaveTextContent('Rohit Ramki');
    expect(strip).toHaveTextContent('6 pts');
    expect(strip).not.toHaveTextContent('Humza Khalil');
    expect(pickems.getWeeklyPickEmScores).toHaveBeenCalledWith('pew-1');
  });

  it('names everyone tied on the top score', async () => {
    pickems.getWeeklyPickEmScores.mockResolvedValue([
      score('u2', 'Rohit Ramki', 6, 1),
      score('u3', 'Humza Khalil', 6, 2),
      score('u4', 'Arya Shah', 4, 3)
    ]);

    renderWithProviders(<PreviousWeekWinners week={1} status={REVEALED} />);

    const strip = await screen.findByLabelText("Week 1 pick'em winners");
    expect(strip).toHaveTextContent('Week 1 winners');
    expect(strip).toHaveTextContent('Rohit Ramki, Humza Khalil');
    expect(strip).not.toHaveTextContent('Arya Shah');
  });

  it('reveals nothing and fetches nothing before results are available', () => {
    const { container } = renderWithProviders(
      <PreviousWeekWinners week={1} status={{ ...REVEALED, resultsAvailable: false }} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(pickems.getWeeklyPickEmScores).not.toHaveBeenCalled();
  });

  it('renders nothing for a week nobody scored in', async () => {
    pickems.getWeeklyPickEmScores.mockResolvedValue([score('u2', 'Rohit Ramki', 0, 1)]);

    const { container } = renderWithProviders(<PreviousWeekWinners week={1} status={REVEALED} />);

    await vi.waitFor(() => expect(pickems.getWeeklyPickEmScores).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('masks the winner for a viewer who cannot see names', async () => {
    Object.assign(auth, { isAdmin: false, user: null });
    pickems.getWeeklyPickEmScores.mockResolvedValue([score('u2', 'Rohit Ramki', 6, 1)]);

    renderWithProviders(<PreviousWeekWinners week={1} status={REVEALED} />);

    const strip = await screen.findByLabelText("Week 1 pick'em winner");
    expect(strip).not.toHaveTextContent('Rohit Ramki');
    expect(strip).toHaveTextContent(getMaskedUserName('Rohit Ramki', 'u2', null, false, []));
  });
});
