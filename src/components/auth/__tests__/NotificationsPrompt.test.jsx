/**
 * The one-time sheet: which face it opens on, and what each button does. The
 * device and server reads are `usePushNotifications`' and stubbed here.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const viewer = {};
let hook;
const toastSuccess = vi.fn();

vi.mock('../../../contexts/ViewerContext.jsx', () => ({ useViewer: () => viewer }));
vi.mock('../../../../hooks/queries/index.js', () => ({ usePushNotifications: () => hook }));
vi.mock('sonner', () => ({ toast: { success: (...args) => toastSuccess(...args) } }));

const { default: NotificationsPrompt } = await import('../NotificationsPrompt.jsx');
const { snoozeKey } = await import('../../../utils/pushPrompt.js');

const device = (state, isStandalone = false) => {
  hook = {
    data: { state, isStandalone, topics: [] },
    turnOn: { mutate: vi.fn((topics, { onSuccess }) => onSuccess()), isPending: false, error: null }
  };
};

beforeEach(() => {
  Object.assign(viewer, {
    user: { id: 'u1', user_metadata: { full_name: 'Harshil Pareek' } },
    isApproved: true,
    isApprovalLoading: false
  });
  window.localStorage.clear();
  toastSuccess.mockClear();
});

describe('NotificationsPrompt', () => {
  it('asks an iPhone in Safari, then shows the Home Screen steps', async () => {
    device('install');
    render(<NotificationsPrompt />);
    expect(screen.getByText('Get OG Jits on your phone?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, set it up' }));
    expect(screen.getByText('Add OG Jits to your Home Screen')).toBeInTheDocument();
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
    expect(screen.getByText(/One tap and you're set/)).toBeInTheDocument();
  });

  it('finishes in the Home Screen app with one tap that turns every topic on', async () => {
    device('off', true);
    render(<NotificationsPrompt />);
    expect(screen.getByText('One last step')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Turn on notifications/ }));
    expect(hook.turnOn.mutate).toHaveBeenCalledWith(
      ['pickems_open', 'pickems_closing', 'takes_new', 'takes_reactions', 'takes_stakes', 'matchup_facts'],
      expect.any(Object)
    );
    expect(toastSuccess).toHaveBeenCalledWith('Notifications are on.', expect.any(Object));
    expect(screen.queryByText('One last step')).not.toBeInTheDocument();
  });

  it('remembers "Not now" on this device', async () => {
    device('off');
    const { unmount } = render(<NotificationsPrompt />);
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Get OG Jits notifications?')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(snoozeKey('u1'))).not.toBeNull();
    unmount();
    render(<NotificationsPrompt />);
    expect(screen.queryByText('Get OG Jits notifications?')).not.toBeInTheDocument();
  });

  it('stays away from a device already on, a refusal, a visitor, and a member with no name yet', () => {
    device('on');
    const { unmount } = render(<NotificationsPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    device('denied');
    const second = render(<NotificationsPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    second.unmount();

    device('off');
    viewer.isApproved = false;
    const third = render(<NotificationsPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    third.unmount();

    viewer.isApproved = true;
    viewer.user = { id: 'u1', user_metadata: {} };
    render(<NotificationsPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
