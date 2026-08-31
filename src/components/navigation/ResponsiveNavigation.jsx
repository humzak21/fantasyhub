import React, { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/utils';

/**
 * Navigation, in two forms.
 *
 * Below lg: a bottom tab bar that scrolls horizontally and holds *every*
 * destination, each with a visible label under its icon. At lg and up:
 * labelled items in the header.
 *
 * The boundary is lg, not md, and the reason is arithmetic. At 768px the
 * header already carries the logo, the season, the week navigator and the
 * login control; eight labelled tabs need roughly 720px more than what is
 * left. That shortfall is what produced the icon-only tier in the first
 * place. Rather than strip the labels off, the tab bar — which has room for
 * them — keeps the tablet.
 *
 * What this replaces, and why each part went:
 *
 *   - A hamburger in the top-right corner opening a drawer. Every navigation
 *     cost two taps, and it put the site's entire map at the far end of the
 *     screen from the thumb while a secondary control (the standings button)
 *     occupied the reachable corner.
 *   - An icon-only tier that covered 640px to 1535px — most laptops and every
 *     tablet — with the label delivered by the `title` attribute. `title` has
 *     a one-second delay on a desktop and does not exist at all on touch,
 *     which is exactly the tablet case. Eight lucide glyphs with no labels is
 *     not navigation, it is a quiz. Labels now appear from md up.
 *   - Per-tab notification dots collapsing into one dot on the hamburger, so
 *     "something needs you" could not be resolved without opening the drawer.
 *     The dot is back on the tab it belongs to.
 *
 * Items are `NavLink`s rather than buttons calling `navigate()`. Tabs have
 * been real routes since §6; making them real links restores cmd-click,
 * middle-click, "copy link address" and `aria-current`, all of which a
 * `<button>` silently drops.
 *
 * @param {Array} tabs - tab config: { id, label, icon, isDisabled, showNotification }
 * @param {string} activeTab
 * @param {Function} shouldShowTab
 */
/**
 * Header navigation, lg and up. Every item shows its label; there is no
 * icon-only tier at any width any more.
 *
 * Rendered by the shell inside the header. Its phone counterpart is
 * `MobileTabBar`, which the shell must render *outside* the header — see the
 * note on that component.
 */
export const HeaderNav = ({ tabs, activeTab, shouldShowTab = () => true }) => {
  const visibleTabs = tabs.filter(shouldShowTab);
  if (visibleTabs.length === 0) return null;
  return <DesktopNav tabs={visibleTabs} activeTab={activeTab} />;
};

const DesktopNav = ({ tabs, activeTab }) => (
  /*
    Scrolls rather than overflows. The row gives this element whatever width is
    left, and eight tabs currently sit well inside it — but a ninth or a longer
    label should push the page wider, and the honest degradation for a nav that
    outgrows its line is to scroll it. No `justify-center`: centring an
    overflowing flex line puts its start at an unreachable negative offset,
    which CI greps for.
  */
  <nav
    aria-label="Main"
    className="hidden min-w-0 overflow-x-auto overscroll-x-contain lg:flex lg:items-center [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {tabs.map((tab) => {
      const Icon = tab.icon;
      const isActive = activeTab === tab.id;
      return (
        <NavLink
          key={tab.id}
          to={`/${tab.id}`}
          aria-disabled={tab.isDisabled || undefined}
          onClick={(e) => tab.isDisabled && e.preventDefault()}
          className={cn(
            'relative flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors xl:px-3',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            isActive
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            tab.isDisabled && 'pointer-events-none opacity-50',
            // The awards tab pulses while there is something new to see.
            tab.id === 'awards' && !isActive && 'animate-pulse-glow rounded-md'
          )}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {/* Short label until there is room for the long one.
              Eight full labels come to ~920px, which at 1280 leaves nothing
              for the brand, the week control and the account — that shortfall
              is what the old icon-only tier was papering over. Shortening the
              three long ones ("Power Rankings" → "Rankings") buys ~165px and
              costs nothing: the full label stays the accessible name, so
              nothing is hidden from a screen reader, and it returns in full
              at 2xl where the row can hold it. */}
          <span className="whitespace-nowrap 2xl:hidden" aria-hidden="true">
            {tab.shortLabel || tab.label}
          </span>
          <span className="hidden whitespace-nowrap 2xl:inline" aria-hidden="true">
            {tab.label}
          </span>
          <span className="sr-only">{tab.label}</span>
          {tab.showNotification && (
            <span
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive"
              aria-label="Needs your attention"
            />
          )}
        </NavLink>
      );
    })}
  </nav>
);

/**
 * The phone tab bar. Scrolls, holds every destination, and lives where the
 * thumb already is.
 *
 * **Render this at the app root, never inside the header.** The header carries
 * `backdrop-blur`, and `backdrop-filter` — like `transform` — makes an element
 * the containing block for every `position: fixed` descendant. Nested there,
 * `bottom-0` resolves against the header and the bar lands directly under it
 * at the top of the screen. That is the same failure CLAUDE.md records for
 * `transform` on the app root, arriving through a different property.
 *
 * Note also the absence of `justify-center` on the scroller: centring an
 * overflowing flex line puts its start at a negative scroll offset that cannot
 * be reached, which is how round 1 of the playoff bracket became unviewable.
 * CI greps for that pair.
 */
export const MobileTabBar = ({ tabs, activeTab, shouldShowTab = () => true }) => {
  const visibleTabs = tabs.filter(shouldShowTab);
  const scrollerRef = useRef(null);
  const activeRef = useRef(null);

  // Bring the active tab into view on mount and whenever it changes — with
  // eight or more destinations the current one is often off-screen after a
  // reload. Scrolling the container directly rather than `scrollIntoView()`,
  // which also scrolls ancestors vertically and would jump the page.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = activeRef.current;
    if (!scroller || !active) return;

    const target = active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2;
    const left = Math.max(0, Math.min(target, scroller.scrollWidth - scroller.clientWidth));
    scroller.scrollTo({ left, behavior: 'smooth' });
  }, [activeTab]);

  if (visibleTabs.length === 0) return null;

  return (
    <nav
      aria-label="Main"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:hidden',
        // Sits above the home indicator rather than under it.
        'pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory items-stretch gap-0.5 overflow-x-auto overscroll-x-contain px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <NavLink
              key={tab.id}
              to={`/${tab.id}`}
              ref={isActive ? activeRef : undefined}
              aria-disabled={tab.isDisabled || undefined}
              onClick={(e) => tab.isDisabled && e.preventDefault()}
              className={cn(
                'relative flex min-h-14 w-[4.5rem] shrink-0 snap-center flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive ? 'text-primary' : 'text-muted-foreground active:bg-accent/50',
                tab.isDisabled && 'pointer-events-none opacity-50'
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {tab.showNotification && (
                  <span
                    className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card"
                    aria-label="Needs your attention"
                  />
                )}
              </span>
              {/* Drawn: the short label. Announced: the full one. The visible
                  text is hidden from assistive tech rather than added to it,
                  or the accessible name would read "Rankings Power Rankings". */}
              <span
                aria-hidden="true"
                className="w-full truncate text-center text-[10px] font-medium leading-tight"
              >
                {tab.shortLabel || tab.label}
              </span>
              <span className="sr-only">{tab.label}</span>
              {/* The active marker is a bar at the top edge of the tab rather
                  than a filled pill: at 72px wide a fill leaves no room for
                  the label to breathe. */}
              {isActive && (
                <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" aria-hidden="true" />
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default HeaderNav;
