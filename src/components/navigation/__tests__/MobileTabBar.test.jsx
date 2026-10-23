/**
 * The phone tab bar is five slots: the tabs that carry a `tabBarSlot`, in slot
 * order, and Menu. Everything else the viewer may open is in the Menu, with
 * the account — Settings, the newsletter and Log out, which asks first.
 *
 * Nothing here measures a width: jsdom has none. That the bar fits 375px
 * without scrolling is `npm run test:e2e`'s to assert.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BarChart3, Calendar, Flame, History, House, Target, Users } from 'lucide-react';

import { MobileTabBar } from '../ResponsiveNavigation.jsx';

const TABS = [
  { id: 'home', label: 'Home', icon: House, tabBarSlot: 0 },
  { id: 'rankings', label: 'Statistics', icon: BarChart3, tabBarSlot: 1 },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'history', label: 'History', icon: History, tabBarSlot: 3 },
  { id: 'pickems', label: "Pick'ems", icon: Target, tabBarSlot: 2 },
  { id: 'takes', label: 'Takes', icon: Flame, badgeCount: 3 },
];

const USER = { id: 'u1', email: 'jo@example.com', user_metadata: { name: 'Jo Member' } };

const mount = (props = {}, route = '/home') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <MobileTabBar tabs={TABS} activeTab={route.slice(1)} {...props} />
    </MemoryRouter>
  );

const bar = () => screen.getByRole('navigation', { name: 'Main' });

describe('MobileTabBar', () => {
  it('holds the slotted tabs in slot order, then Menu, and nothing else', () => {
    mount();

    const items = within(bar()).getAllByRole('link').map((l) => l.textContent);
    expect(items.map((t) => t.replace(/(.+)\1$/, '$1'))).toEqual(['Home', 'Statistics', "Pick'ems", 'History']);
    expect(within(bar()).getByRole('button', { name: /^Menu/ })).toBeInTheDocument();
    expect(within(bar()).queryByRole('link', { name: 'Schedule' })).not.toBeInTheDocument();
  });

  it('leaves a slot empty for a tab the viewer may not open', () => {
    mount({ shouldShowTab: (t) => t.id !== 'history' && t.id !== 'pickems' });

    expect(within(bar()).getAllByRole('link')).toHaveLength(2);
    expect(within(bar()).queryByRole('link', { name: 'History' })).not.toBeInTheDocument();
  });

  it("carries the menu's badges on the Menu button", () => {
    mount({ account: { user: USER, settingsBadgeCount: 2 } });

    // Three unread takes and two accounts awaiting approval.
    expect(within(bar()).getByRole('button', { name: 'Menu, 5 new' })).toHaveTextContent('5');
  });

  it('lights Menu when the open tab lives in it', () => {
    mount({}, '/schedule');
    expect(within(bar()).getByRole('button', { name: /^Menu/ })).toHaveClass('text-primary');
  });

  it('opens the rest of the tabs, and closes as one is chosen', async () => {
    const user = userEvent.setup();
    mount();

    await user.click(within(bar()).getByRole('button', { name: /^Menu/ }));
    const more = await screen.findByRole('navigation', { name: 'More' });

    expect(within(more).getByRole('link', { name: 'Schedule' })).toHaveAttribute('href', '/schedule');
    expect(within(more).getByRole('link', { name: 'Takes, 3 unread' })).toBeInTheDocument();
    expect(within(more).queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();

    await user.click(within(more).getByRole('link', { name: 'Teams' }));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'More' })).not.toBeInTheDocument());
  });

  it('has no account rows for a signed-out viewer, whose Login is in the header', async () => {
    const user = userEvent.setup();
    mount({ account: { user: null } });

    await user.click(within(bar()).getByRole('button', { name: /^Menu/ }));
    await screen.findByRole('navigation', { name: 'More' });

    expect(screen.queryByRole('link', { name: /Settings/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument();
    expect(screen.queryByText('Profile')).not.toBeInTheDocument();
  });

  it('shows the account, Settings and the newsletter for a member', async () => {
    const user = userEvent.setup();
    mount({
      account: {
        user: USER,
        showNewsletter: true,
        settingsBadgeCount: 1,
        settingsBadgeLabel: '1 account awaiting approval',
      },
    });

    await user.click(within(bar()).getByRole('button', { name: /^Menu/ }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('Jo Member')).toBeInTheDocument();
    expect(within(dialog).getByText('Soon')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: 'Settings (1 account awaiting approval)' })
    ).toHaveAttribute('href', '/settings');
    const newsletter = within(dialog).getByRole('link', { name: /newsletter/i });
    expect(newsletter).toHaveAttribute('target', '_blank');
    expect(newsletter).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps the newsletter from a member who is not approved', async () => {
    const user = userEvent.setup();
    mount({ account: { user: USER, showNewsletter: false } });

    await user.click(within(bar()).getByRole('button', { name: /^Menu/ }));
    await screen.findByRole('dialog');

    expect(screen.queryByRole('link', { name: /newsletter/i })).not.toBeInTheDocument();
  });

  it('asks before logging out, and Cancel logs nobody out', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    mount({ account: { user: USER, onSignOut } });

    await user.click(within(bar()).getByRole('button', { name: /^Menu/ }));
    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    const confirm = await screen.findByRole('alertdialog', { name: 'Log out?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(onSignOut).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('logs out once confirmed', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    mount({ account: { user: USER, onSignOut } });

    await user.click(within(bar()).getByRole('button', { name: /^Menu/ }));
    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    const confirm = await screen.findByRole('alertdialog', { name: 'Log out?' });
    await user.click(within(confirm).getByRole('button', { name: 'Log out' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
