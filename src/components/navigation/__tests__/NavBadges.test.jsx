/**
 * What a nav item says when it is carrying something.
 *
 * Two markers with two meanings: Pick'ems' dot means "you owe something here"
 * and is answered by acting; the Takes count means "there are four takes you
 * have not read" and is answered by looking. They must not be interchangeable,
 * and neither may be visible without being announced — both navs draw their
 * labels `aria-hidden` and carry the accessible name separately, which is
 * exactly the arrangement in which a marker quietly stops existing for a
 * screen reader.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Flame, Target, Trophy } from 'lucide-react';

import { HeaderNav, MobileTabBar } from '../ResponsiveNavigation.jsx';

const tabs = ({ badgeCount = 0, showNotification = false } = {}) => [
  { id: 'rankings', label: 'Rankings', icon: Trophy },
  { id: 'pickems', label: "Pick'ems", icon: Target, showNotification },
  { id: 'takes', label: 'Takes', icon: Flame, badgeCount }
];

const mount = (ui) => render(<MemoryRouter initialEntries={['/rankings']}>{ui}</MemoryRouter>);

// jsdom implements neither, and the phone bar scrolls its active tab into view
// on mount. Nothing here is about scrolling — see NavScrollIndicators for that.
beforeEach(() => {
  Element.prototype.scrollBy = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ['HeaderNav', HeaderNav],
  ['MobileTabBar', MobileTabBar]
])('%s badges', (_name, Nav) => {
  it('puts the count on the tab it belongs to', () => {
    mount(<Nav tabs={tabs({ badgeCount: 4 })} activeTab="rankings" />);

    expect(screen.getByRole('link', { name: 'Takes, 4 unread' })).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('caps the drawn count so a busy week cannot stretch the tab', () => {
    mount(<Nav tabs={tabs({ badgeCount: 23 })} activeTab="rankings" />);

    expect(screen.getByText('9+')).toBeInTheDocument();
    // The real number still reaches a screen reader: it is the width that is
    // capped, not the fact.
    expect(screen.getByRole('link', { name: 'Takes, 23 unread' })).toBeInTheDocument();
  });

  it('draws nothing at zero', () => {
    mount(<Nav tabs={tabs({ badgeCount: 0 })} activeTab="rankings" />);

    expect(screen.getByRole('link', { name: 'Takes' })).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('keeps the dot a different statement from the count', () => {
    mount(<Nav tabs={tabs({ badgeCount: 2, showNotification: true })} activeTab="rankings" />);

    expect(screen.getByRole('link', { name: "Pick'ems, needs your attention" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Takes, 2 unread' })).toBeInTheDocument();
  });
});
