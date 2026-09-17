/**
 * A nav that scrolls says so, and only while it has something to say.
 *
 * Both navs hide their scrollbar, so the tabs past the right edge are
 * invisible *and* unannounced — the last visible tab reads as the last tab.
 * The chevrons are the only thing that contradicts that, which makes "shown
 * exactly when that edge has more behind it" the behaviour worth pinning.
 *
 * jsdom has no layout: every box measures zero, so the metrics the hook reads
 * are stubbed here rather than arranged. That is the honest version of this
 * test — a real 375px measurement is `npm run test:e2e`'s job — and stubbing
 * them is what lets the *decision* be asserted at all.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Trophy, BarChart3, Calendar } from 'lucide-react';

import { HeaderNav, MobileTabBar } from '../ResponsiveNavigation.jsx';

const TABS = [
  { id: 'rankings', label: 'Power Rankings', shortLabel: 'Rankings', icon: Trophy },
  { id: 'statistics', label: 'Statistics', shortLabel: 'Stats', icon: BarChart3 },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
];

/** Make every element report a scroller `wide` px wide in a `visible` px box. */
const stubMetrics = ({ scrollWidth, clientWidth, scrollLeft = 0 }) => {
  for (const [prop, value] of Object.entries({ scrollWidth, clientWidth, scrollLeft })) {
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      writable: true,
      value,
    });
  }
};

const mount = (ui) => render(<MemoryRouter initialEntries={['/rankings']}>{ui}</MemoryRouter>);

// The chevrons are `aria-hidden` on purpose — every destination is already a
// link — so they are counted as buttons in the tree, not by accessible name.
const chevrons = (container) => container.querySelectorAll('button[aria-hidden="true"]');
const shown = (container) =>
  [...chevrons(container)].filter((b) => !b.className.includes('opacity-0'));

beforeEach(() => {
  Element.prototype.scrollBy = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  for (const prop of ['scrollWidth', 'clientWidth', 'scrollLeft']) {
    delete HTMLElement.prototype[prop];
  }
  vi.restoreAllMocks();
});

describe.each([
  ['HeaderNav', (props) => <HeaderNav {...props} />],
  ['MobileTabBar', (props) => <MobileTabBar {...props} />],
])('%s scroll indicators', (_name, renderNav) => {
  it('shows nothing when every tab fits', () => {
    stubMetrics({ scrollWidth: 400, clientWidth: 400 });
    const { container } = mount(renderNav({ tabs: TABS, activeTab: 'rankings' }));

    expect(shown(container)).toHaveLength(0);
  });

  it('points forward only, at the start of an overflowing nav', () => {
    stubMetrics({ scrollWidth: 900, clientWidth: 375, scrollLeft: 0 });
    const { container } = mount(renderNav({ tabs: TABS, activeTab: 'rankings' }));

    const visible = shown(container);
    expect(visible).toHaveLength(1);
    expect(visible[0].className).toContain('right-0');
  });

  it('points both ways in the middle, and back only at the end', () => {
    stubMetrics({ scrollWidth: 900, clientWidth: 375, scrollLeft: 200 });
    const { container } = mount(renderNav({ tabs: TABS, activeTab: 'rankings' }));

    expect(shown(container)).toHaveLength(2);

    // The hook re-measures on the scroller's own scroll event.
    stubMetrics({ scrollWidth: 900, clientWidth: 375, scrollLeft: 525 });
    act(() => {
      container.querySelector('[class*="overflow-x-auto"]').dispatchEvent(new Event('scroll'));
    });

    const atEnd = shown(container);
    expect(atEnd).toHaveLength(1);
    expect(atEnd[0].className).toContain('left-0');
  });

  it('scrolls the nav by most of a viewport when clicked', () => {
    stubMetrics({ scrollWidth: 900, clientWidth: 375, scrollLeft: 0 });
    const { container } = mount(renderNav({ tabs: TABS, activeTab: 'rankings' }));

    shown(container)[0].click();

    expect(Element.prototype.scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 375 * 0.66, behavior: 'smooth' })
    );
  });

  it('leaves the tabs themselves reachable', () => {
    stubMetrics({ scrollWidth: 900, clientWidth: 375, scrollLeft: 0 });
    mount(renderNav({ tabs: TABS, activeTab: 'rankings' }));

    expect(screen.getByRole('link', { name: 'Schedule' })).toHaveAttribute('href', '/schedule');
  });
});
