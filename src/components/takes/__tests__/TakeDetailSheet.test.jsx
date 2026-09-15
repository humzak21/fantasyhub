/**
 * The detail sheet, as the admin sees it and as a member does.
 *
 * `adminEdit.test.js` covers what a save sends and the database covers who may
 * send it; this covers the wiring between them — that the admin is offered the
 * editor and the roster controls, that a save hands the parent exactly the
 * patch, and that a member is offered none of it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor
} from '../../../test/renderWithProviders.jsx';

vi.mock('../../../../services/db/index.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getDb: () => ({
    users: { isParlayCommissioner: async () => false, isApprovedMember: async () => true },
    seasons: { getActiveSeason: async () => null }
  })
}));

const ADMIN = { user: { id: 'u1' }, isAuthenticated: true, isAdmin: true, loading: false };
const MEMBER = { user: { id: 'u4' }, isAuthenticated: true, isAdmin: false, loading: false };

let auth = ADMIN;

vi.mock('../../../contexts/AuthContext.jsx', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuth: () => auth
}));

const { default: TakeDetailSheet } = await import('../TakeDetailSheet.jsx');

const TAKE = {
  id: 't1',
  userId: 'u2',
  body: 'Nobody goes 14-0',
  targetType: 'week',
  targetWeek: 3,
  status: 'pending',
  wager: '$20',
  createdAt: '2026-09-01T12:00:00Z',
  takeParticipants: [{ id: 'p1', userId: 'u3', createdAt: '2026-09-02T12:00:00Z' }]
};

const NAMES = { u1: 'Humza Khalil', u2: 'Arya Shah', u3: 'Sam Lee' };
const MEMBERS = [
  { id: 'u1', displayName: 'Humza Khalil' },
  { id: 'u2', displayName: 'Arya Shah' },
  { id: 'u3', displayName: 'Sam Lee' }
];

const render = (props) =>
  renderWithProviders(
    <TakeDetailSheet
      take={TAKE}
      displayNames={NAMES}
      seasonConfig={{ regularSeasonWeeks: 14, weekCount: 17 }}
      open
      onOpenChange={() => {}}
      members={MEMBERS}
      {...props}
    />
  );

beforeEach(() => {
  auth = ADMIN;
});

describe('TakeDetailSheet, admin', () => {
  it('opens the editor in place and hands the parent only what moved', async () => {
    const onAdminSave = vi.fn().mockResolvedValue(undefined);
    render({ onAdminSave });

    fireEvent.click(screen.getByRole('button', { name: /edit take/i }));

    // The take itself gives way to the form while it is open.
    expect(screen.getByLabelText('Wording')).toHaveValue('Nobody goes 14-0');
    expect(screen.queryByRole('button', { name: /^correct$/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Wording'), {
      target: { value: 'Nobody goes 13-1' }
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(onAdminSave).toHaveBeenCalledWith(TAKE, { body: 'Nobody goes 13-1' })
    );
    await waitFor(() => expect(screen.queryByLabelText('Wording')).not.toBeInTheDocument());
  });

  it('will not save a form nobody changed', () => {
    render({ onAdminSave: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: /edit take/i }));

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('keeps the editor open and says why when the save is refused', async () => {
    const onAdminSave = vi.fn().mockRejectedValue(new Error('permission denied for table takes'));
    render({ onAdminSave });

    fireEvent.click(screen.getByRole('button', { name: /edit take/i }));
    fireEvent.change(screen.getByLabelText('Stake'), { target: { value: '$50' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Stake')).toHaveValue('$50');
  });

  it('can remove somebody else’s Hell Nah', () => {
    const onAdminRemoveFade = vi.fn();
    render({ onAdminRemoveFade });

    fireEvent.click(screen.getByRole('button', { name: "Remove Sam Lee's Hell Nah" }));

    expect(onAdminRemoveFade).toHaveBeenCalledWith(TAKE, 'u3');
  });

  it('says the log will sign what they change', () => {
    render();

    expect(screen.getByText(/shows in the activity log as Admin/i)).toBeInTheDocument();
  });
});

describe('TakeDetailSheet, member', () => {
  it('offers none of the admin’s controls', () => {
    auth = MEMBER;
    render();

    expect(screen.queryByRole('button', { name: /edit take/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove .*hell nah/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Member to add a Hell Nah for')).not.toBeInTheDocument();
  });
});
