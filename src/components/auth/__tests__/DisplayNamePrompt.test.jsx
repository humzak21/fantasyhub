import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen, waitFor } from '../../../test/renderWithProviders.jsx';
import DisplayNamePrompt from '../DisplayNamePrompt.jsx';

/**
 * The contexts are replaced outright rather than partially mocked: every hook
 * this component reads is stubbed here, so the real `AuthProvider` would only
 * contribute a `supabase.auth.getSession()` call over a network that does not
 * exist in jsdom. The providers stay in the tree as passthroughs so the test
 * still renders through `renderWithProviders`, per CLAUDE.md.
 */

let viewerValue;
let authValue;
let activeSeason;

vi.mock('../../../contexts/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authValue
}));

vi.mock('../../../contexts/ViewerContext.jsx', () => ({
  ViewerProvider: ({ children }) => children,
  useViewer: () => viewerValue
}));

vi.mock('../../../../hooks/queries/index.js', () => ({
  useActiveSeason: () => ({ data: activeSeason })
}));

const OWNERS = [
  { ownerName: 'Humza Khalil', teamName: 'Cardiac Kids' },
  { ownerName: 'Aaron Wadhwa', teamName: 'Dak to the Future' }
];

/** A logged-in user whose metadata carries `metadata` (blank name by default). */
const signedIn = (metadata = {}) => ({
  user: { id: 'user-1', email: 'someone@example.com', user_metadata: metadata },
  isAuthenticated: true,
  isAdmin: false,
  teamOwnerNames: OWNERS,
  isTeamOwner: false
});

beforeEach(() => {
  viewerValue = signedIn();
  authValue = { updateProfile: vi.fn().mockResolvedValue({ success: true }) };
  activeSeason = { id: 'season-2026', year: 2026 };
});

const prompt = () => screen.queryByTestId('display-name-prompt');

describe('DisplayNamePrompt gate', () => {
  it('stays hidden for a signed-out visitor', () => {
    viewerValue = { user: null, isAuthenticated: false, isAdmin: false, teamOwnerNames: OWNERS };
    render(<DisplayNamePrompt />);
    expect(prompt()).not.toBeInTheDocument();
  });

  it('stays hidden when a name is already set under either key', () => {
    viewerValue = signedIn({ full_name: 'Humza Khalil' });
    const { unmount } = render(<DisplayNamePrompt />);
    expect(prompt()).not.toBeInTheDocument();
    unmount();

    viewerValue = signedIn({ name: 'Aaron Wadhwa' });
    render(<DisplayNamePrompt />);
    expect(prompt()).not.toBeInTheDocument();
  });

  it('shows for a signed-in user whose name metadata is blank', () => {
    viewerValue = signedIn({ full_name: '', name: '   ' });
    render(<DisplayNamePrompt />);
    expect(prompt()).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});

describe('DisplayNamePrompt cannot be dismissed by clicking out', () => {
  it('ignores a click on the backdrop', async () => {
    const user = userEvent.setup();
    render(<DisplayNamePrompt />);

    await user.click(screen.getByTestId('display-name-backdrop'));

    expect(prompt()).toBeInTheDocument();
  });

  it('ignores Escape', async () => {
    const user = userEvent.setup();
    render(<DisplayNamePrompt />);

    await user.keyboard('{Escape}');

    expect(prompt()).toBeInTheDocument();
  });

  it('closes on "Remind me later", and returns on the next load', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DisplayNamePrompt />);

    await user.click(screen.getByRole('button', { name: /remind me later/i }));
    expect(prompt()).not.toBeInTheDocument();

    // A remount is the next page load: nothing was persisted, so it is back.
    unmount();
    render(<DisplayNamePrompt />);
    expect(prompt()).toBeInTheDocument();
  });
});

describe('DisplayNamePrompt name entry', () => {
  const openForm = async (user) => {
    render(<DisplayNamePrompt />);
    await user.click(screen.getByRole('button', { name: /set my name/i }));
    return screen.getByLabelText(/full name/i);
  };

  it('reveals the input only after "Set my name"', async () => {
    const user = userEvent.setup();
    render(<DisplayNamePrompt />);
    expect(screen.queryByLabelText(/full name/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /set my name/i }));

    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByText(/no middle name/i)).toBeInTheDocument();
  });

  it.each([
    ['', /first and last name/i],
    ['Khalil, Humza', /no commas/i],
    ['Humza', /last name/i]
  ])('rejects %o without saving', async (typed, message) => {
    const user = userEvent.setup();
    const input = await openForm(user);

    if (typed) await user.type(input, typed);
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(authValue.updateProfile).not.toHaveBeenCalled();
    expect(prompt()).toBeInTheDocument();
  });

  it('saves both metadata keys and closes when the name matches an owner', async () => {
    const user = userEvent.setup();
    const input = await openForm(user);

    await user.type(input, 'Humza Khalil');
    await user.click(screen.getByRole('button', { name: /^confirm$/i }));

    expect(authValue.updateProfile).toHaveBeenCalledWith({
      full_name: 'Humza Khalil',
      name: 'Humza Khalil'
    });
    await waitFor(() => expect(prompt()).not.toBeInTheDocument());
  });

  it('submits on Enter as well as the button', async () => {
    const user = userEvent.setup();
    const input = await openForm(user);

    await user.type(input, 'Aaron Wadhwa{Enter}');

    expect(authValue.updateProfile).toHaveBeenCalledWith({
      full_name: 'Aaron Wadhwa',
      name: 'Aaron Wadhwa'
    });
  });

  it('trims before saving', async () => {
    const user = userEvent.setup();
    const input = await openForm(user);

    await user.type(input, '  Humza Khalil  {Enter}');

    expect(authValue.updateProfile).toHaveBeenCalledWith({
      full_name: 'Humza Khalil',
      name: 'Humza Khalil'
    });
  });

  it('still saves a name matching no owner, but warns before closing', async () => {
    const user = userEvent.setup();
    const input = await openForm(user);

    await user.type(input, 'Humza Kalil{Enter}');

    expect(authValue.updateProfile).toHaveBeenCalledWith({
      full_name: 'Humza Kalil',
      name: 'Humza Kalil'
    });
    expect(await screen.findByText(/doesn't match any team owner in the 2026 season/i)).toBeInTheDocument();
    expect(prompt()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /got it/i }));
    expect(prompt()).not.toBeInTheDocument();
  });

  it('skips the warning when the season has no owners to compare against', async () => {
    viewerValue = { ...signedIn(), teamOwnerNames: [] };
    const user = userEvent.setup();
    const input = await openForm(user);

    await user.type(input, 'Humza Kalil{Enter}');

    await waitFor(() => expect(prompt()).not.toBeInTheDocument());
  });

  it('keeps the modal open and reports a failed save', async () => {
    authValue.updateProfile = vi.fn().mockResolvedValue({ success: false, error: 'Network down' });
    const user = userEvent.setup();
    const input = await openForm(user);

    await user.type(input, 'Humza Khalil{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(prompt()).toBeInTheDocument();
  });
});
