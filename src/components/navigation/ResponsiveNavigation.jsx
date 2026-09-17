import React, { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Newspaper, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useScrollEdges } from '../../hooks/use-scroll-edges';

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
 * @param {Array} tabs - tab config: { id, label, icon, isDisabled,
 *   showNotification, badgeCount }
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

/**
 * The chevron at the edge of a nav that has more behind it.
 *
 * Both navs hide their scrollbar — deliberately, a 15px grey trough across the
 * bottom of the phone tab bar is worse than the problem — and a scroller with
 * no scrollbar is indistinguishable from content that has simply ended. So the
 * last visible tab reads as the last tab, and the tabs past it are not
 * discovered at all. This is the marker that says otherwise: a chevron chip
 * over a short fade, on whichever side still has tabs behind it, and nothing
 * at all once that side is exhausted.
 *
 * It is also a button, because the same compact widths that cause the overflow
 * are the ones with a mouse and no horizontal wheel: on a laptop the only way
 * to reach a tab off the right edge would otherwise be shift+wheel, which is
 * not something to expect a reader to know. A click scrolls about two thirds
 * of a viewport, which keeps a tab or two of context.
 *
 * `aria-hidden` with `tabIndex={-1}`: every destination is already a link in
 * the DOM, and a browser scrolls a focused link into view on its own, so to a
 * keyboard or screen reader this control has nothing to offer and would only
 * be two more stops before the nav. It is an affordance for pointers only.
 */
const NavScrollChevron = ({ side, show, scrollerRef, className }) => {
  const isStart = side === 'start';
  const Icon = isStart ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      aria-hidden="true"
      tabIndex={-1}
      onClick={() => {
        const scroller = scrollerRef.current;
        if (!scroller?.scrollBy) return;
        const step = Math.max(120, scroller.clientWidth * 0.66);
        scroller.scrollBy({ left: isStart ? -step : step, behavior: 'smooth' });
      }}
      className={cn(
        // Overlays the edge rather than taking layout width: the tab it covers
        // is the one that is already half off-screen, and one click brings it
        // fully into view.
        'absolute inset-y-0 z-10 flex w-11 items-center from-card via-card/85 to-transparent',
        'transition-opacity duration-150',
        isStart ? 'left-0 justify-start bg-gradient-to-r pl-1.5' : 'right-0 justify-end bg-gradient-to-l pr-1.5',
        show ? 'opacity-100' : 'pointer-events-none opacity-0',
        className
      )}
    >
      {/* A chip, not a bare glyph. The fade under it carries whatever tab is
          behind, and a 16px chevron laid straight over a team icon is a smudge;
          the card surface and hairline ring are what make it read as a control. */}
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-card text-foreground ring-1 ring-border shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]">
        <Icon className="h-4 w-4" />
      </span>
    </button>
  );
};

/**
 * A count on a nav item, for a tab holding things the viewer has not seen yet.
 *
 * A number rather than the dot beside it, and the difference is deliberate:
 * the dot means "you owe something here" — the pick'ems one is on until you
 * submit — and it is answered by acting. This says "there are four takes you
 * have not read", which is answered by looking, and four is a different amount
 * of looking from one. Capped at 9+ because past that the number stops being
 * information and starts being a width.
 *
 * `aria-hidden`, with the count carried in the link's accessible name instead:
 * a screen reader announcing "Takes 4" gives no clue what the 4 counts, and
 * two focus stops for one destination is worse than the label being long.
 */
const NavCountBadge = ({ count, className }) => (
  <span
    aria-hidden="true"
    className={cn(
      'flex h-4 min-w-4 items-center justify-center rounded-full px-1',
      'bg-destructive text-[10px] font-semibold leading-none tabular text-white ring-2 ring-card',
      className
    )}
  >
    {count > 9 ? '9+' : count}
  </span>
);

/**
 * What a tab's accessible name says when it is carrying a badge. The visible
 * label is `aria-hidden` in both navs, so this is the only place the count is
 * announced — and "Takes, 4 unread" is the whole of what the badge means.
 */
const tabAccessibleName = (tab) => {
  const count = Number(tab.badgeCount) || 0;
  if (count > 0) return `${tab.label}, ${count} unread`;
  if (tab.showNotification) return `${tab.label}, needs your attention`;
  return tab.label;
};

const DesktopNav = ({ tabs, activeTab }) => {
  const scrollerRef = useRef(null);
  const edges = useScrollEdges(scrollerRef, tabs.length);

  return (
    /*
      Scrolls rather than overflows. The row gives this element whatever width is
      left, and eight tabs currently sit well inside it — but a ninth or a longer
      label should push the page wider, and the honest degradation for a nav that
      outgrows its line is to scroll it. No `justify-center`: centring an
      overflowing flex line puts its start at an unreachable negative offset,
      which CI greps for.

      The wrapper exists for the chevrons, which are positioned against it: they
      have to sit outside the scrolling element, or they would scroll away with
      the tabs they are pointing at.
    */
    <div className="relative hidden min-w-0 flex-1 lg:block">
      <nav
        ref={scrollerRef}
        aria-label="Main"
        className="flex min-w-0 items-center overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                tab.isDisabled && 'pointer-events-none opacity-50'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {/* Short label until there is room for the long one.
                  Eight full labels come to ~920px, which at 1280 leaves nothing
                  for the brand, the week control and the account — that shortfall
                  is what the old icon-only tier was papering over. Shortening the
                  long ones ("Statistics" → "Stats") buys room and
                  costs nothing: the full label stays the accessible name, so
                  nothing is hidden from a screen reader, and it returns in full
                  at 2xl where the row can hold it. */}
              <span className="whitespace-nowrap 2xl:hidden" aria-hidden="true">
                {tab.shortLabel || tab.label}
              </span>
              <span className="hidden whitespace-nowrap 2xl:inline" aria-hidden="true">
                {tab.label}
              </span>
              <span className="sr-only">{tabAccessibleName(tab)}</span>
              {/* A count wins over the dot when there is one: stacked on one
                  tab they would say the same thing, and the number says more. */}
              {Number(tab.badgeCount) > 0 ? (
                <NavCountBadge
                  count={Number(tab.badgeCount)}
                  className="absolute -right-0.5 -top-0.5"
                />
              ) : (
                tab.showNotification && (
                  <span
                    aria-hidden="true"
                    className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-destructive"
                  />
                )
              )}
            </NavLink>
          );
        })}
      </nav>

      <NavScrollChevron side="start" show={edges.start} scrollerRef={scrollerRef} />
      <NavScrollChevron side="end" show={edges.end} scrollerRef={scrollerRef} />
    </div>
  );
};

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
  const edges = useScrollEdges(scrollerRef, visibleTabs.length);

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
      {/* Wrapped so the chevrons have something to position against that does
          not scroll with the tabs. The bar itself cannot be that element: it
          is the `fixed` one, and `inset-y-0` on a chevron inside it would
          include the safe-area padding. */}
      <div className="relative">
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
                  {Number(tab.badgeCount) > 0 ? (
                    <NavCountBadge
                      count={Number(tab.badgeCount)}
                      className="absolute -right-2.5 -top-1.5"
                    />
                  ) : (
                    tab.showNotification && (
                      <span
                        aria-hidden="true"
                        className="absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-card"
                      />
                    )
                  )}
                </span>
                {/* Drawn: the short label. Announced: the full one. The visible
                    text is hidden from assistive tech rather than added to it,
                    or the accessible name would read "Stats Statistics". */}
                <span
                  aria-hidden="true"
                  className="w-full truncate text-center text-[10px] font-medium leading-tight"
                >
                  {tab.shortLabel || tab.label}
                </span>
                <span className="sr-only">{tabAccessibleName(tab)}</span>
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

        <NavScrollChevron side="start" show={edges.start} scrollerRef={scrollerRef} />
        <NavScrollChevron side="end" show={edges.end} scrollerRef={scrollerRef} />
      </div>
    </nav>
  );
};

/**
 * The cog beside the account control. A `NavLink` to `/settings`, at every
 * width, rendered by the shell next to `LoginDropdown` for a signed-in viewer.
 *
 * Settings used to be an item inside the avatar's dropdown — two clicks, and
 * invisible until the first — and landed on a page outside the shell, with
 * its own header and a Back button, so getting *out* was a third. It is a
 * tab now (`FantasyFootballApp` renders it like any other), and this is its
 * one entry point: not in the tab list, because it is a utility rather than
 * a destination, but always on screen, in the corner where the account
 * already lives. Same active treatment as the header nav so the two agree
 * about what "you are here" looks like.
 */
const HEADER_ICON_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors pointer-coarse:min-w-11 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const HEADER_ICON_IDLE = 'text-muted-foreground hover:bg-accent/50 hover:text-foreground';

/**
 * `badgeCount` is the admin's pending approvals. The cog is Settings' one
 * entry point, and Approvals is two clicks inside it, so a member waiting for
 * an account is invisible until the admin happens to go looking — which is
 * the same failure the per-tab notification dots exist to prevent, on the one
 * destination that has no tab.
 *
 * A number rather than a dot, because "three people are waiting" and "one
 * person is waiting" are different amounts of owed work, and the count is
 * already in hand.
 */
export const SettingsLink = ({ active = false, badgeCount = 0, badgeLabel, className }) => {
  const count = Number(badgeCount) || 0;
  const label = count > 0 ? `Settings (${badgeLabel || `${count} pending`})` : 'Settings';

  return (
    <NavLink
      to="/settings"
      aria-label={label}
      title={label}
      className={cn(
        HEADER_ICON_BUTTON,
        'relative',
        active ? 'bg-accent text-accent-foreground' : HEADER_ICON_IDLE,
        className
      )}
    >
      <Settings className="h-[18px] w-[18px]" aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1',
            'bg-destructive text-[10px] font-semibold leading-none tabular text-white',
            // The ring separates the badge from the glyph under it; the cog's
            // teeth are exactly the kind of busy edge a bare dot disappears
            // against.
            'ring-2 ring-card'
          )}
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </NavLink>
  );
};

export const NEWSLETTER_URL = 'https://ogjits.substack.com/';

/**
 * The league newsletter, on Substack. It sits beside the cog in the same
 * icon-button face, but it leaves the app, so it is a plain anchor opening a
 * new tab and never has an active state. Public, like the league itself —
 * shown signed out too.
 */
export const NewsletterLink = ({ className }) => (
  <a
    href={NEWSLETTER_URL}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Newsletter (opens in a new tab)"
    title="Newsletter"
    className={cn(HEADER_ICON_BUTTON, HEADER_ICON_IDLE, className)}
  >
    <Newspaper className="h-[18px] w-[18px]" aria-hidden="true" />
  </a>
);

export default HeaderNav;
