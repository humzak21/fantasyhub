/**
 * Settings → Alerts keeps every push a member was sent, because a push is
 * gone once tapped. What is pinned: unread alerts say so, tapping one marks
 * it read and goes where the push would have, "Mark all read" clears the
 * rest, and an alert can be deleted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigate = vi.fn();
const markRead = { mutate: vi.fn(), isPending: false };
const remove = { mutate: vi.fn(), isPending: false };
let inbox;

vi.mock('react-router-dom', async (actual) => ({ ...(await actual()), useNavigate: () => navigate }));
vi.mock('../../../../hooks/queries/index.js', async () => {
  const { countUnread } = await import('../../../../hooks/queries/useNotificationInbox.js');
  return {
    countUnread,
    useNotificationInbox: () => inbox,
    useInboxMutations: () => ({ markRead, remove })
  };
});

const { default: AlertsPanel } = await import('../AlertsPanel.jsx');

const alert = (id, over = {}) => ({
  id,
  kind: 'test',
  title: 'OG Jits',
  body: `body ${id}`,
  url: '/',
  createdAt: new Date('2026-10-14T00:14:00Z'),
  readAt: null,
  ...over
});

beforeEach(() => {
  vi.clearAllMocks();
  inbox = { data: [], isLoading: false, error: null };
});

describe('AlertsPanel', () => {
  it('says there is nothing yet', () => {
    render(<AlertsPanel />);
    expect(screen.getByText('No alerts yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeDisabled();
  });

  it('shows the whole message, and which alerts are unread', () => {
    inbox.data = [
      alert('a', { body: "Nikhil, your team is ass. You manage it like a chocolate bar with nuts." }),
      alert('b', { title: 'New take', readAt: new Date() })
    ];
    render(<AlertsPanel />);
    expect(screen.getByText(/like a chocolate bar with nuts/)).toBeInTheDocument();
    expect(screen.getAllByText('(unread)')).toHaveLength(1);
  });

  it('marks an alert read and opens where the push would have', async () => {
    inbox.data = [alert('a', { kind: 'takes_new', title: 'New take', url: '/takes?take=t1' })];
    render(<AlertsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /^New take/ }));
    expect(markRead.mutate).toHaveBeenCalledWith(['a']);
    expect(navigate).toHaveBeenCalledWith('/takes?take=t1');
  });

  it('does not mark an alert read twice', async () => {
    inbox.data = [alert('a', { readAt: new Date(), url: null })];
    render(<AlertsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /^OG Jits/ }));
    expect(markRead.mutate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('marks everything read at once', async () => {
    inbox.data = [alert('a'), alert('b')];
    render(<AlertsPanel />);
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(markRead.mutate).toHaveBeenCalledWith(null);
  });

  it('deletes one alert', async () => {
    inbox.data = [alert('a', { title: 'Week 5: you vs Arya' })];
    render(<AlertsPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete alert: Week 5: you vs Arya' }));
    expect(remove.mutate).toHaveBeenCalledWith('a');
    expect(markRead.mutate).not.toHaveBeenCalled();
  });

  it('shows a skeleton while loading, never a blank panel', () => {
    inbox = { data: undefined, isLoading: true, error: null };
    const { container } = render(<AlertsPanel />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

});
