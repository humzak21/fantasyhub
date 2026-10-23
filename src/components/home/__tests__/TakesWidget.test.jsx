/**
 * The home page's takes card. Pinned: which takes it shows (`selectHomeTakes`,
 * through the board the shell already holds); that its Hell Nah is the Takes
 * tab's Hell Nah — the same confirmation, the same "don't show again", the
 * same write (`useTakeActions` + `TakeActionDialogs`); and that it never
 * marks the board seen, because two cards are not the board.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, within } from '../../../test/renderWithProviders.jsx';

const takes = {
  getTakesForSeason: vi.fn(),
  addFade: vi.fn(),
  addHellYeah: vi.fn(),
  getTakeViewMark: vi.fn(),
  markTakesSeen: vi.fn()
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    takes,
    users: {
      isParlayCommissioner: async () => false,
      isApprovedMember: async () => true,
      isLeagueAdmin: async () => false
    },
    seasons: { getActiveSeason: async () => null }
  })
}));

const auth = {
  user: { id: 'reader', user_metadata: { name: 'Arya Shah' } },
  isAuthenticated: true,
  loading: false
};
vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: TakesWidget } = await import('../widgets/TakesWidget.jsx');
const { suppressHellNahConfirm } = await import('../../takes/confirmPreference.js');

const hoursAgo = (hours) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
const take = (id, extra = {}) => ({
  id,
  userId: 'author',
  body: `Take ${id}`,
  targetType: 'end_of_season',
  targetWeek: null,
  status: 'pending',
  wager: '$20',
  createdAt: hoursAgo(2),
  takeParticipants: [],
  ...extra
});

const BOARD = {
  takes: [
    take('newest', { createdAt: hoursAgo(1) }),
    take('second', { createdAt: hoursAgo(5) }),
    take('old', { createdAt: hoursAgo(200) }),
    take('graded', { createdAt: hoursAgo(300), status: 'correct', resolvedAt: hoursAgo(10) }),
    take('graded-long-ago', { createdAt: hoursAgo(400), status: 'incorrect', resolvedAt: hoursAgo(100) })
  ],
  displayNames: { author: 'Humza Khalil', reader: 'Arya Shah' }
};

const render = () => renderWithProviders(<TakesWidget ctx={{ seasonId: 's1' }} />);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  takes.getTakesForSeason.mockResolvedValue(BOARD);
  takes.addFade.mockResolvedValue({ id: 'fade' });
  takes.getTakeViewMark.mockResolvedValue(null);
});

describe('TakesWidget', () => {
  it('shows a recent grade first, then the two newest, and nothing else', async () => {
    render();
    await screen.findByText('Take newest');

    const shown = screen.getAllByText(/^Take /).map((node) => node.textContent);
    expect(shown).toEqual(['Take graded', 'Take newest', 'Take second']);
  });

  it('confirms a Hell Nah before writing it, as the Takes tab does', async () => {
    const user = userEvent.setup();
    render();
    const card = (await screen.findByText('Take newest')).closest('[role="button"]');

    await user.click(within(card).getByRole('button', { name: /^hell nah$/i }));

    expect(takes.addFade).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/if this take hits, you owe \$20/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^hell nah$/i }));
    expect(takes.addFade).toHaveBeenCalledWith({ takeId: 'newest', seasonId: 's1' });
  });

  it('honours "don\'t show again" set on the Takes tab', async () => {
    suppressHellNahConfirm('reader');
    const user = userEvent.setup();
    render();
    const card = (await screen.findByText('Take newest')).closest('[role="button"]');

    await user.click(within(card).getByRole('button', { name: /^hell nah$/i }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(takes.addFade).toHaveBeenCalledWith({ takeId: 'newest', seasonId: 's1' });
  });

  it('counts unseen takes but never marks them seen', async () => {
    render();
    await screen.findByText('Take newest');

    expect(await screen.findByText(/5 new/)).toBeInTheDocument();
    expect(takes.markTakesSeen).not.toHaveBeenCalled();
  });

  it('invites the first take on an empty board', async () => {
    takes.getTakesForSeason.mockResolvedValue({ takes: [], displayNames: {} });
    render();
    expect(await screen.findByRole('link', { name: /post the first take/i })).toHaveAttribute('href', '/takes');
  });
});
