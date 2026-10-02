/**
 * The Settings card says which step a member is on. The browser and server
 * reads are `usePushNotifications`' and stubbed here; what is pinned is what
 * each state tells the member and what each control sends.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const viewer = { isApproved: true, isApprovalLoading: false };
const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null });
let hook;

vi.mock('../../../contexts/ViewerContext.jsx', () => ({ useViewer: () => viewer }));
vi.mock('../../../../hooks/queries/index.js', () => ({ usePushNotifications: () => hook }));

const { default: NotificationsCard } = await import('../NotificationsCard.jsx');

const withState = (state, topics = []) => {
  hook = {
    isPending: false,
    data: { state, topics },
    turnOn: mutation(),
    turnOff: mutation(),
    setTopics: mutation()
  };
};

beforeEach(() => {
  viewer.isApproved = true;
  viewer.isApprovalLoading = false;
});

describe('NotificationsCard', () => {
  it('waits for approval', () => {
    viewer.isApproved = false;
    withState('off');
    render(<NotificationsCard />);
    expect(screen.getByText(/once the admin has approved your account/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /turn on/i })).not.toBeInTheDocument();
  });

  it('sends an iPhone Safari tab to the Home Screen', () => {
    withState('install');
    render(<NotificationsCard />);
    expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
    expect(screen.getByText(/sign in with your password/)).toBeInTheDocument();
    expect(screen.getByText(/Delete it and add it again/)).toBeInTheDocument();
  });

  it('points a refusal at iOS Settings', () => {
    withState('denied');
    render(<NotificationsCard />);
    expect(screen.getByText(/Settings → Notifications → OG Jits/)).toBeInTheDocument();
  });

  it('turns every topic on with one tap', async () => {
    withState('off');
    render(<NotificationsCard />);
    await userEvent.click(screen.getByRole('button', { name: 'Turn on notifications' }));
    expect(hook.turnOn.mutate).toHaveBeenCalledWith(['pickems_open', 'pickems_closing']);
  });

  it('toggles one topic and keeps the other', async () => {
    withState('on', ['pickems_open', 'pickems_closing']);
    render(<NotificationsCard />);
    await userEvent.click(screen.getByRole('switch', { name: "Pick'ems are open" }));
    expect(hook.setTopics.mutate).toHaveBeenCalledWith(['pickems_closing']);
  });

  it('turns off on this device', async () => {
    withState('on', ['pickems_open']);
    render(<NotificationsCard />);
    expect(screen.getByRole('switch', { name: "Pick'ems close soon" })).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(screen.getByRole('button', { name: /Turn off on this device/ }));
    expect(hook.turnOff.mutate).toHaveBeenCalled();
  });
});
