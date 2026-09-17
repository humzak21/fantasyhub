/**
 * The cog is a link, and it says where it goes.
 *
 * Settings used to be an item inside the avatar dropdown, reachable only after
 * a click that gave no hint it was there. It is a `NavLink` in the header now,
 * beside the account control — so it must be a real link to `/settings` with
 * an accessible name, and it must show the same "you are here" state the
 * header nav uses.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { SettingsLink } from '../ResponsiveNavigation.jsx';

const mount = (ui) => render(<MemoryRouter initialEntries={['/rankings']}>{ui}</MemoryRouter>);

describe('SettingsLink', () => {
  it('is a link to /settings named "Settings"', () => {
    mount(<SettingsLink />);

    const link = screen.getByRole('link', { name: 'Settings' });
    expect(link).toHaveAttribute('href', '/settings');
  });

  it('carries the active treatment only when the settings tab is open', () => {
    const { rerender } = mount(<SettingsLink active={false} />);
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveClass('bg-accent');

    rerender(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsLink active />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveClass('bg-accent');
  });

  it('shows nothing when there is nothing waiting', () => {
    mount(<SettingsLink badgeCount={0} />);

    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('counts what is waiting, and says so in the name', () => {
    // The badge itself is `aria-hidden` — a bare "3" beside a cog is not a
    // sentence — so the accessible name is where the reason has to live.
    mount(<SettingsLink badgeCount={3} badgeLabel="3 accounts awaiting approval" />);

    const link = screen.getByRole('link', { name: 'Settings (3 accounts awaiting approval)' });
    expect(link).toHaveTextContent('3');
  });

  it('caps the count rather than widening the header', () => {
    mount(<SettingsLink badgeCount={42} />);

    expect(screen.getByRole('link', { name: /Settings/ })).toHaveTextContent('9+');
  });
});
