/**
 * Alerts (/alerts) keeps every push a member was sent, because a push is
 * gone once tapped. What is pinned: unread alerts say so, tapping one marks
 * it read and goes where the push would have, "Mark all read" clears the
 * rest, and an alert can be deleted. A matchup fact that can still be used
 * offers a Taunt, opened from the alert or straight from the push's link, and
 * the taunt can hand its rivalry to the league chat.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const navigate = vi.fn();
const markRead = { mutate: vi.fn(), isPending: false };
const remove = { mutate: vi.fn(), isPending: false };
const sendTaunt = { mutateAsync: vi.fn(), isPending: false };
let inbox;
let taunts;
let chat;

vi.mock('react-router-dom', async (actual) => ({ ...(await actual()), useNavigate: () => navigate }));
vi.mock('../../ask/LeagueChatContext.jsx', () => ({ useLeagueChat: () => chat }));
vi.mock('../../../../hooks/queries/index.js', async () => {
  const { countUnread } = await import('../../../../hooks/queries/useNotificationInbox.js');
  return {
    countUnread,
    useNotificationInbox: () => inbox,
    useInboxMutations: () => ({ markRead, remove }),
    useMyTaunts: () => taunts,
    useSendTaunt: () => sendTaunt
  };
});

const { default: AlertsPage } = await import('../AlertsPage.jsx');

const render = (ui, { path = '/alerts' } = {}) => rtlRender(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

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
  taunts = { data: [], isLoading: false };
  chat = { available: false, open: vi.fn() };
});

const offer = (over = {}) => ({
  id: 't1',
  opponentName: 'Arya',
  fact: "You're 8-2 all-time against Arya.",
  taunt: 'Harshil is 8-2 all-time against you.',
  createdAt: new Date(),
  sentAt: null,
  ...over
});

const factAlert = alert('f', {
  kind: 'matchup_facts:tue',
  title: 'Week 7: you vs Arya',
  body: "You're 8-2 all-time against Arya.",
  url: '/alerts?taunt=t1'
});

describe('AlertsPage', () => {
  it('says there is nothing yet', () => {
    render(<AlertsPage />);
    expect(screen.getByText('No alerts yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeDisabled();
  });

  it('shows the whole message, and which alerts are unread', () => {
    inbox.data = [
      alert('a', { body: "Nikhil, your team is ass. You manage it like a chocolate bar with nuts." }),
      alert('b', { title: 'New take', readAt: new Date() })
    ];
    render(<AlertsPage />);
    expect(screen.getByText(/like a chocolate bar with nuts/)).toBeInTheDocument();
    expect(screen.getAllByText('(unread)')).toHaveLength(1);
  });

  it('marks an alert read and opens where the push would have', async () => {
    inbox.data = [alert('a', { kind: 'takes_new', title: 'New take', url: '/takes?take=t1' })];
    render(<AlertsPage />);
    await userEvent.click(screen.getByRole('button', { name: /^New take/ }));
    expect(markRead.mutate).toHaveBeenCalledWith(['a']);
    expect(navigate).toHaveBeenCalledWith('/takes?take=t1');
  });

  it('does not mark an alert read twice', async () => {
    inbox.data = [alert('a', { readAt: new Date(), url: null })];
    render(<AlertsPage />);
    await userEvent.click(screen.getByRole('button', { name: /^OG Jits/ }));
    expect(markRead.mutate).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('marks everything read at once', async () => {
    inbox.data = [alert('a'), alert('b')];
    render(<AlertsPage />);
    await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
    expect(markRead.mutate).toHaveBeenCalledWith(null);
  });

  it('deletes one alert', async () => {
    inbox.data = [alert('a', { title: 'Week 5: you vs Arya' })];
    render(<AlertsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete alert: Week 5: you vs Arya' }));
    expect(remove.mutate).toHaveBeenCalledWith('a');
    expect(markRead.mutate).not.toHaveBeenCalled();
  });

  it('shows a skeleton while loading, never a blank panel', () => {
    inbox = { data: undefined, isLoading: true, error: null };
    const { container } = render(<AlertsPage />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('offers a taunt on a matchup fact that can still be sent', async () => {
    inbox.data = [factAlert];
    taunts.data = [offer()];
    render(<AlertsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Taunt Arya' }));
    expect(await screen.findByText('Harshil is 8-2 all-time against you.')).toBeInTheDocument();
  });

  it('says a fact has been used, and offers nothing once it has', () => {
    inbox.data = [factAlert];
    taunts.data = [offer({ sentAt: new Date() })];
    render(<AlertsPage />);
    expect(screen.getByText('Taunted Arya')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Taunt Arya' })).toBeNull();
  });

  it('offers nothing for an expired fact', () => {
    inbox.data = [factAlert];
    taunts.data = [offer({ createdAt: new Date(Date.now() - 49 * 3600 * 1000) })];
    render(<AlertsPage />);
    expect(screen.queryByRole('button', { name: 'Taunt Arya' })).toBeNull();
    expect(screen.queryByText('Taunted Arya')).toBeNull();
  });

  it('opens the taunt from the push and marks the fact read', async () => {
    inbox.data = [factAlert];
    taunts.data = [offer()];
    sendTaunt.mutateAsync.mockResolvedValue('sent');
    render(<AlertsPage />, { path: '/alerts?taunt=t1' });
    expect(markRead.mutate).toHaveBeenCalledWith(['f']);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Arya gets');
    await userEvent.click(screen.getAllByRole('button', { name: 'Taunt Arya' }).at(-1));
    expect(sendTaunt.mutateAsync).toHaveBeenCalledWith('t1');
    expect(await screen.findByText('Taunt sent. Arya will get it in a minute.')).toBeInTheDocument();
  });

  it('offers no chat link without the league chat', async () => {
    inbox.data = [factAlert];
    taunts.data = [offer()];
    render(<AlertsPage />, { path: '/alerts?taunt=t1' });
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Ask og jits about this rivalry' })).toBeNull();
  });

  it('asks the league chat about the rivalry from the taunt', async () => {
    chat = { available: true, open: vi.fn() };
    inbox.data = [factAlert];
    taunts.data = [offer()];
    render(<AlertsPage />, { path: '/alerts?taunt=t1' });
    await userEvent.click(await screen.findByRole('button', { name: 'Ask og jits about this rivalry' }));
    expect(chat.open).toHaveBeenCalledWith("What's my record against Arya?");
  });

  it("sends at once from the notification's Taunt button", async () => {
    inbox.data = [factAlert];
    taunts.data = [offer()];
    sendTaunt.mutateAsync.mockResolvedValue('sent');
    render(<AlertsPage />, { path: '/alerts?taunt=t1&send=1' });
    await waitFor(() => expect(sendTaunt.mutateAsync).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Taunt sent. Arya will get it in a minute.')).toBeInTheDocument();
  });
});
