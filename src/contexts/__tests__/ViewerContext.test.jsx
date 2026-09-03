/**
 * The approval lever.
 *
 * Every masking helper decides "real name or masked" by asking whether the
 * viewer's display name is in `teamOwnerNames`. The provider hands an
 * unapproved viewer an empty list, so the ~35 call sites mask without knowing
 * approval exists. This pins that: the same user, the same season, and the
 * only thing that moves is the database's answer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { AllProviders } from '../../test/renderWithProviders.jsx';
import { getMaskedOwnerName, getMaskedTeamName } from '../../utils/displayNameUtils.js';

const users = {
  isParlayCommissioner: vi.fn(async () => false),
  isApprovedMember: vi.fn(async () => false)
};

// `useActiveSeason` feeds the row to `setSeasonConfig`, which wants the
// calendar columns — the same shape the other suites give it.
const SEASON = {
  id: 's1',
  year: 2026,
  start_date: '2026-09-01',
  regular_season_weeks: 14,
  playoff_weeks: 3,
  teams: [{ id: 'team-1', name: 'The Arya Show', owner: 'Arya Shah' }]
};

vi.mock('../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({ users, seasons: { getActiveSeason: async () => SEASON } }),
  // `useActiveSeason` clears the data layer's season memo before it reads,
  // and the real `getContext()` would build a Supabase client to do it.
  getContext: () => ({ seasonsCache: new Map() })
}));

let auth = { user: null, isAuthenticated: false, isAdmin: false, loading: false };

vi.mock('../AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { useViewer } = await import('../ViewerContext.jsx');

const ARYA = { id: 'u1', user_metadata: { name: 'Arya Shah' } };
const TEAM = SEASON.teams[0];

const renderViewer = () => renderHook(() => useViewer(), { wrapper: AllProviders });

beforeEach(() => {
  vi.clearAllMocks();
  users.isApprovedMember.mockResolvedValue(false);
});

describe('ViewerContext approval', () => {
  it('masks an owner whose account the admin has not approved', async () => {
    auth = { user: ARYA, isAuthenticated: true, isAdmin: false, loading: false };
    const { result } = renderViewer();

    await waitFor(() => expect(result.current.isApprovalLoading).toBe(false));

    const { user, isAdmin, teamOwnerNames } = result.current;
    expect(result.current.isApproved).toBe(false);
    expect(result.current.isTeamOwner).toBe(false);
    expect(teamOwnerNames).toEqual([]);
    expect(getMaskedTeamName(TEAM, user, isAdmin, teamOwnerNames)).toBe('team-1');
    expect(getMaskedOwnerName(TEAM, user, isAdmin, teamOwnerNames)).toBe('team-1');
  });

  it('unmasks the same owner once approved', async () => {
    users.isApprovedMember.mockResolvedValue(true);
    auth = { user: ARYA, isAuthenticated: true, isAdmin: false, loading: false };
    const { result } = renderViewer();

    await waitFor(() => expect(result.current.isApproved).toBe(true));
    await waitFor(() => expect(result.current.isTeamOwner).toBe(true));

    const { user, isAdmin, teamOwnerNames } = result.current;
    expect(getMaskedTeamName(TEAM, user, isAdmin, teamOwnerNames)).toBe('The Arya Show');
    expect(getMaskedOwnerName(TEAM, user, isAdmin, teamOwnerNames)).toBe('Arya Shah');
  });

  it('treats the admin as approved without asking', async () => {
    auth = { user: { id: 'admin-1' }, isAuthenticated: true, isAdmin: true, loading: false };
    const { result } = renderViewer();

    expect(result.current.isApproved).toBe(true);
    expect(result.current.isApprovalLoading).toBe(false);
    await waitFor(() => expect(result.current.teamOwnerNames).toHaveLength(1));
    expect(users.isApprovedMember).not.toHaveBeenCalled();
  });

  it('has nothing to wait for when signed out', async () => {
    auth = { user: null, isAuthenticated: false, isAdmin: false, loading: false };
    const { result } = renderViewer();

    expect(result.current.isApproved).toBe(false);
    expect(result.current.isApprovalLoading).toBe(false);
    // A visitor is masked by having no user, not by an empty owner list —
    // the list stays intact so the name prompt's owner-match warning works.
    await waitFor(() => expect(result.current.teamOwnerNames).toHaveLength(1));
    expect(users.isApprovedMember).not.toHaveBeenCalled();
  });

  it('reports loading, and masks, until the answer arrives', async () => {
    users.isApprovedMember.mockImplementation(() => new Promise(() => {}));
    auth = { user: ARYA, isAuthenticated: true, isAdmin: false, loading: false };
    const { result } = renderViewer();

    await waitFor(() => expect(users.isApprovedMember).toHaveBeenCalled());
    expect(result.current.isApprovalLoading).toBe(true);
    expect(result.current.isApproved).toBe(false);
    expect(result.current.teamOwnerNames).toEqual([]);
  });
});
