import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronRight, ExternalLink, LogOut, Newspaper, Settings, UserRound } from 'lucide-react';

import { cn } from '../../lib/utils';
import { getUserDisplayName } from '../../utils/displayNameUtils.js';
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '../ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { buttonVariants } from '../ui/button';
import { NEWSLETTER_URL } from './navConstants.js';

/**
 * The count or dot on a menu tile or row. `aria-hidden`: the reason lives in
 * the link's accessible name, as it does in both navs.
 */
const MenuBadge = ({ count = 0, dot = false, className }) => {
  if (count > 0) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 min-w-4 items-center justify-center rounded-full px-1',
          'bg-destructive text-[10px] font-semibold leading-none tabular text-white ring-2 ring-background',
          className
        )}
      >
        {count > 9 ? '9+' : count}
      </span>
    );
  }
  if (dot) {
    return (
      <span
        aria-hidden="true"
        className={cn('h-2 w-2 rounded-full bg-destructive ring-2 ring-background', className)}
      />
    );
  }
  return null;
};

const tileName = (tab) => {
  const count = Number(tab.badgeCount) || 0;
  if (count > 0) return `${tab.label}, ${count} unread`;
  if (tab.showNotification) return `${tab.label}, needs your attention`;
  return tab.label;
};

const ROW =
  'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const ROW_IDLE = 'text-foreground hover:bg-accent/50 active:bg-accent/60';

/**
 * Everything the phone tab bar does not hold: the rest of the tabs, and the
 * account — profile, Settings, the newsletter and Log out. Below lg those are
 * not in the header any more; the header keeps the bell, and the Login button
 * for a signed-out viewer.
 *
 * A vaul drawer, so it slides up from the bar it was opened from and slides
 * back down when closed — by a link, the backdrop, Escape, or a flick down.
 * Every link closes it as it navigates, so the page underneath is the one the
 * reader asked for.
 *
 * Log out asks first. The confirmation is a separate dialog that opens as the
 * drawer closes: both are the same Radix dialog instance underneath (vaul
 * dedupes to our `@radix-ui/react-dialog`), so the body's pointer-events and
 * scroll lock are counted across the two and neither strands the other.
 *
 * @param {boolean} open
 * @param {Function} onOpenChange
 * @param {Array} tabs - the visible tabs that are not in the bar
 * @param {string} activeTab
 * @param {object|null} user - the signed-in account, or null
 * @param {boolean} showNewsletter - approved members only, like the members-only tabs
 * @param {number} settingsBadgeCount - the admin's pending approvals
 * @param {string} [settingsBadgeLabel]
 * @param {Function} [onSignOut]
 */
export function TabBarMenu({
  open,
  onOpenChange,
  tabs = [],
  activeTab,
  user = null,
  showNewsletter = false,
  settingsBadgeCount = 0,
  settingsBadgeLabel,
  onSignOut,
}) {
  const [confirmLogout, setConfirmLogout] = useState(false);
  const close = () => onOpenChange(false);

  const name = getUserDisplayName(user) || user?.email || 'Member';
  const initial = name.charAt(0).toUpperCase();
  const settingsCount = Number(settingsBadgeCount) || 0;
  const settingsName =
    settingsCount > 0 ? `Settings (${settingsBadgeLabel || `${settingsCount} pending`})` : 'Settings';

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent>
          <DrawerHeader className="pb-2">
            <DrawerTitle>Menu</DrawerTitle>
            <DrawerDescription className="sr-only">More tabs and your account</DrawerDescription>
          </DrawerHeader>

          <DrawerBody className="space-y-5 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {/* The account, and Profile — which has no page yet. It reads as
                the row it will become, marked "Soon", rather than as a link
                whose only outcome is nothing. */}
            {user && (
              <div
                aria-disabled="true"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.035)]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
                >
                  {initial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                  {user.email && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
                </div>
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                  Profile
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    Soon
                  </span>
                </span>
              </div>
            )}

            {tabs.length > 0 && (
              <nav aria-label="More" className="grid grid-cols-3 gap-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <NavLink
                      key={tab.id}
                      to={`/${tab.id}`}
                      onClick={close}
                      className={cn(
                        'relative flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground active:bg-accent/60'
                      )}
                    >
                      <span className="relative">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                        <MenuBadge
                          count={Number(tab.badgeCount) || 0}
                          dot={tab.showNotification}
                          className="absolute -right-2.5 -top-1.5"
                        />
                      </span>
                      <span aria-hidden="true" className="w-full truncate text-center text-xs font-medium">
                        {tab.label}
                      </span>
                      <span className="sr-only">{tileName(tab)}</span>
                    </NavLink>
                  );
                })}
              </nav>
            )}

            {user && (
              <div className="space-y-1 border-t border-border pt-3">
                <NavLink
                  to="/settings"
                  onClick={close}
                  aria-label={settingsName}
                  className={cn(
                    ROW,
                    activeTab === 'settings' ? 'bg-accent text-accent-foreground' : ROW_IDLE
                  )}
                >
                  <Settings className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">Settings</span>
                  <MenuBadge count={settingsCount} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </NavLink>

                {showNewsletter && (
                  <a
                    href={NEWSLETTER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Newsletter (opens in a new tab)"
                    onClick={close}
                    className={cn(ROW, ROW_IDLE)}
                  >
                    <Newspaper className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="flex-1">Newsletter</span>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => {
                    close();
                    setConfirmLogout(true);
                  }}
                  className={cn(ROW, 'text-destructive hover:bg-destructive/10 active:bg-destructive/15')}
                >
                  <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="flex-1">Log out</span>
                </button>
              </div>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log out?</AlertDialogTitle>
            <AlertDialogDescription>
              You will need to sign in again to make your picks and see the members-only tabs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => onSignOut?.()}
            >
              Log out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default TabBarMenu;
