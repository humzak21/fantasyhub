/**
 * Who sees autosubs, and what the picker offers. The first half is the point of
 * the feature's privacy: a member sees this on their own roster and nowhere
 * else, and with the switch off nobody sees it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, screen, waitFor } from '../../../test/renderWithProviders.jsx';
import { atWeeklyLimit, benchOptions, coverableStarters, autosubState } from '../autosubChoices.js';

const FUTURE = '2099-01-01T18:00:00Z';
const PAST = '2001-01-01T18:00:00Z';

const row = (playerId, name, rosterSlot, position, proTeamId) => ({
  playerId,
  rosterSlot,
  position,
  proTeamId,
  started: rosterSlot !== 'BE' && rosterSlot !== 'IR',
  player: { name, position }
});

const LINEUP = [
  row('p-rb', 'Bijan Robinson', 'RB', 'RB', 1),
  row('p-wr', 'Puka Nacua', 'WR', 'WR', 2),
  row('p-be-rb', 'Jaylen Warren', 'BE', 'RB', 3),
  row('p-be-wr', 'Rome Odunze', 'BE', 'WR', 4)
];

const OPPONENTS = {
  1: { bye: false, gameTime: FUTURE },
  2: { bye: false, gameTime: FUTURE },
  3: { bye: false, gameTime: FUTURE },
  4: { bye: false, gameTime: FUTURE }
};

const season = {
  id: 's1',
  year: 2026,
  startDate: '2026-09-08',
  autosubsEnabled: true,
  autosubWeeklyLimit: 2,
  teams: [{ id: 'team-mine', franchiseId: 'f-mine' }, { id: 'team-other', franchiseId: 'f-other' }]
};

const SET_AUTOSUB = {
  id: 'a1',
  status: 'armed',
  starterPlayerId: 'p-rb',
  benchPlayerId: 'p-be-rb',
  starter: { name: 'Bijan Robinson' },
  bench: { name: 'Jaylen Warren' }
};

const db = {
  users: {
    isApprovedMember: vi.fn(async () => true),
    isParlayCommissioner: vi.fn(async () => false),
    isLeagueAdmin: vi.fn(async () => false)
  },
  seasons: { getActiveSeason: vi.fn(async () => season) },
  franchiseProfiles: { getMyFranchiseId: vi.fn(async () => 'f-mine') },
  rosters: {
    getCurrentLineupsForWeek: vi.fn(async () => LINEUP.map((entry) => ({ ...entry, teamId: 'team-mine' })))
  },
  nflSchedule: {
    getNflScheduleForSeason: vi.fn(async () => [])
  },
  autosubs: {
    getMyAutosubs: vi.fn(async () => []),
    setAutosub: vi.fn(async () => 'new-id'),
    removeAutosub: vi.fn(async () => true)
  }
};

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => db,
  getContext: () => ({ seasonsCache: new Map() })
}));

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => ({
    user: { id: 'u1', user_metadata: { name: 'Harshil Pareek' } },
    isAuthenticated: true,
    loading: false
  })
}));

const { AutosubSection } = await import('../AutosubSection.jsx');

/** Calendar rows, in the shape `useNflOpponentMap` projects into `OPPONENTS`. */
const calendar = (week) => [1, 2, 3, 4].map((proTeamId) => ({
  week,
  proTeamId,
  opponentProTeamId: 30,
  isHome: true,
  gameTime: FUTURE
}));

beforeEach(() => {
  vi.clearAllMocks();
  db.seasons.getActiveSeason.mockResolvedValue(season);
  db.franchiseProfiles.getMyFranchiseId.mockResolvedValue('f-mine');
  db.users.isApprovedMember.mockResolvedValue(true);
  db.autosubs.getMyAutosubs.mockResolvedValue([]);
  db.nflSchedule.getNflScheduleForSeason.mockImplementation(async () =>
    Array.from({ length: 18 }, (_, i) => calendar(i + 1)).flat());
});

describe('AutosubSection', () => {
  it('shows on the viewer\'s own roster', async () => {
    renderWithProviders(<AutosubSection teamId="team-mine" />);

    expect(await screen.findByText('Autosubs')).toBeInTheDocument();
  });

  it('shows nothing on another member\'s roster, and fetches nothing for it', async () => {
    renderWithProviders(<AutosubSection teamId="team-other" />);

    await waitFor(() => expect(db.franchiseProfiles.getMyFranchiseId).toHaveBeenCalled());
    await waitFor(() => expect(db.seasons.getActiveSeason).toHaveBeenCalled());

    expect(screen.queryByText('Autosubs')).not.toBeInTheDocument();
    expect(db.autosubs.getMyAutosubs).not.toHaveBeenCalled();
  });

  it('shows nothing while the switch is off', async () => {
    db.seasons.getActiveSeason.mockResolvedValue({ ...season, autosubsEnabled: false });

    renderWithProviders(<AutosubSection teamId="team-mine" />);

    await waitFor(() => expect(db.seasons.getActiveSeason).toHaveBeenCalled());
    expect(screen.queryByText('Autosubs')).not.toBeInTheDocument();
  });

  it('shows nothing to an unapproved account', async () => {
    db.users.isApprovedMember.mockResolvedValue(false);

    renderWithProviders(<AutosubSection teamId="team-mine" />);

    await waitFor(() => expect(db.users.isApprovedMember).toHaveBeenCalled());
    expect(screen.queryByText('Autosubs')).not.toBeInTheDocument();
  });

  it('lists a set autosub and removes it', async () => {
    const user = userEvent.setup();
    db.autosubs.getMyAutosubs.mockResolvedValue([{
      id: 'a1',
      status: 'armed',
      starterPlayerId: 'p-rb',
      benchPlayerId: 'p-be-rb',
      starter: { name: 'Bijan Robinson' },
      bench: { name: 'Jaylen Warren' }
    }]);

    renderWithProviders(<AutosubSection teamId="team-mine" />);

    expect(await screen.findByText('Jaylen Warren')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /remove the autosub for bijan robinson/i }));

    await waitFor(() => expect(db.autosubs.removeAutosub).toHaveBeenCalledWith('a1'));
  });

  it('says how much of the week\'s allowance is used', async () => {
    db.autosubs.getMyAutosubs.mockResolvedValue([SET_AUTOSUB]);

    renderWithProviders(<AutosubSection teamId="team-mine" />);

    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('stops offering Add once the limit is reached, and keeps what is set', async () => {
    db.autosubs.getMyAutosubs.mockResolvedValue([SET_AUTOSUB]);
    db.seasons.getActiveSeason.mockResolvedValue({ ...season, autosubWeeklyLimit: 1 });

    renderWithProviders(<AutosubSection teamId="team-mine" />);

    expect(await screen.findByText('1 of 1')).toBeInTheDocument();
    expect(screen.getByText('Jaylen Warren')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });

  it('sets one through the picker, for the viewer\'s team and the current week', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AutosubSection teamId="team-mine" />);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('combobox', { name: /if this starter is out/i }));
    await user.click(await screen.findByRole('option', { name: 'Bijan Robinson (RB)' }));

    await user.click(screen.getByRole('combobox', { name: /start this bench player/i }));
    // A receiver cannot cover a running back, so only one bench player is offered.
    expect(await screen.findAllByRole('option')).toHaveLength(1);
    await user.click(screen.getByRole('option', { name: 'Jaylen Warren (RB)' }));

    await user.click(screen.getByRole('button', { name: 'Set autosub' }));

    await waitFor(() => expect(db.autosubs.setAutosub).toHaveBeenCalledWith({
      teamId: 'team-mine',
      week: expect.any(Number),
      starterPlayerId: 'p-rb',
      benchPlayerId: 'p-be-rb'
    }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the database\'s refusal and keeps the dialog open', async () => {
    const user = userEvent.setup();
    db.autosubs.setAutosub.mockRejectedValueOnce(new Error('That player\'s game has already kicked off'));
    renderWithProviders(<AutosubSection teamId="team-mine" />);

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.click(await screen.findByRole('combobox', { name: /if this starter is out/i }));
    await user.click(await screen.findByRole('option', { name: 'Bijan Robinson (RB)' }));
    await user.click(screen.getByRole('combobox', { name: /start this bench player/i }));
    await user.click(await screen.findByRole('option', { name: 'Jaylen Warren (RB)' }));
    await user.click(screen.getByRole('button', { name: 'Set autosub' }));

    expect(await screen.findByText(/already kicked off/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps a fired autosub, with what happened and no way to remove it', async () => {
    db.autosubs.getMyAutosubs.mockResolvedValue([{
      id: 'a1',
      status: 'swapped',
      starter: { name: 'Bijan Robinson' },
      bench: { name: 'Jaylen Warren' }
    }]);

    renderWithProviders(<AutosubSection teamId="team-mine" />);

    expect(await screen.findByText('Subbed in')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove the autosub/i })).not.toBeInTheDocument();
  });
});

describe('coverableStarters', () => {
  it('offers starters with a game to come, and no bench player', () => {
    expect(coverableStarters(LINEUP, [], OPPONENTS).map((entry) => entry.playerId)).toEqual(['p-rb', 'p-wr']);
  });

  it('leaves out a starter already covered', () => {
    const autosubs = [{ starterPlayerId: 'p-rb', benchPlayerId: 'p-be-rb' }];
    expect(coverableStarters(LINEUP, autosubs, OPPONENTS).map((entry) => entry.playerId)).toEqual(['p-wr']);
  });

  it('leaves out a starter whose game has kicked off, is a bye, or is not on the calendar', () => {
    const opponents = {
      ...OPPONENTS,
      1: { bye: false, gameTime: PAST },
      2: { bye: true, gameTime: null }
    };
    expect(coverableStarters(LINEUP, [], opponents)).toEqual([]);
    expect(coverableStarters(LINEUP, [], {})).toEqual([]);
  });
});

describe('benchOptions', () => {
  const starter = LINEUP[0];

  it('offers only who can play the starter\'s slot', () => {
    expect(benchOptions(LINEUP, starter, [], OPPONENTS).map((entry) => entry.playerId)).toEqual(['p-be-rb']);
  });

  it('offers every position a FLEX takes', () => {
    const flex = { ...starter, rosterSlot: 'FLEX' };
    expect(benchOptions(LINEUP, flex, [], OPPONENTS).map((entry) => entry.playerId))
      .toEqual(['p-be-rb', 'p-be-wr']);
  });

  it('does not offer a bench player already covering somebody else', () => {
    const autosubs = [{ starterPlayerId: 'p-other', benchPlayerId: 'p-be-rb' }];
    expect(benchOptions(LINEUP, starter, autosubs, OPPONENTS)).toEqual([]);
  });

  it('does not offer a bench player whose game has kicked off', () => {
    const opponents = { ...OPPONENTS, 3: { bye: false, gameTime: PAST } };
    expect(benchOptions(LINEUP, starter, [], opponents)).toEqual([]);
  });

  it('offers nobody until a starter is chosen', () => {
    expect(benchOptions(LINEUP, null, [], OPPONENTS)).toEqual([]);
  });
});

describe('atWeeklyLimit', () => {
  it('is reached at the limit, and past it after an admin lowers the limit', () => {
    expect(atWeeklyLimit([{}, {}], 3)).toBe(false);
    expect(atWeeklyLimit([{}, {}], 2)).toBe(true);
    expect(atWeeklyLimit([{}, {}], 1)).toBe(true);
  });

  it('leaves the picker open when no limit is known, for the database to answer', () => {
    expect(atWeeklyLimit([{}], null)).toBe(false);
  });
});

describe('autosubState', () => {
  it('says what happened in the member\'s words', () => {
    expect(autosubState({ status: 'armed' }).label).toBe('Set');
    expect(autosubState({ status: 'swapped' }).label).toBe('Subbed in');
    expect(autosubState({ status: 'manual' }).label).toBe('Commissioner told');
  });
});
