/**
 * The bell is Alerts' one entry point: a link to /alerts beside the cog, on
 * screen at every width, carrying the unread count in its badge and its name.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AlertsLink } from '../ResponsiveNavigation.jsx';

const mount = (ui) => render(<MemoryRouter initialEntries={['/rankings']}>{ui}</MemoryRouter>);

describe('AlertsLink', () => {
  it('is a link to /alerts named "Alerts"', () => {
    mount(<AlertsLink />);
    expect(screen.getByRole('link', { name: 'Alerts' })).toHaveAttribute('href', '/alerts');
  });

  it('says how many are unread, in its name and its badge', () => {
    mount(<AlertsLink badgeCount={3} />);
    const link = screen.getByRole('link', { name: 'Alerts (3 unread)' });
    expect(link).toHaveTextContent('3');
  });

  it('caps the badge at 9+', () => {
    mount(<AlertsLink badgeCount={14} />);
    expect(screen.getByRole('link', { name: 'Alerts (14 unread)' })).toHaveTextContent('9+');
  });

  it('carries the active treatment on the Alerts page', () => {
    mount(<AlertsLink active />);
    expect(screen.getByRole('link', { name: 'Alerts' })).toHaveClass('bg-accent');
  });
});
