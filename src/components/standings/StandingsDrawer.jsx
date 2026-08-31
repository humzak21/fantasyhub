import React from 'react';
import { ListOrdered } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import DrawerStandingsTable from './DrawerStandingsTable';

/**
 * Standings, as an overlay.
 *
 * This was a hand-rolled panel: `position: fixed`, a swipe handler, its own
 * escape-key listener, and `document.body.style.overflow = 'hidden'` on open
 * with `'unset'` on cleanup — which clobbers rather than restores, so two
 * overlapping overlays unlocked scroll for each other. It rendered no backdrop
 * at all (the `backdropRef` and `handleBackdropClick` it declared were dead
 * code, and the `X` it imported was never rendered, so there was no close
 * button either), had no `role="dialog"`, no focus trap and no focus return.
 *
 * Radix does all of that correctly, and `ui/sheet.jsx` — already in this repo,
 * already `dvh`-sized — was sitting unused.
 *
 * The trigger moved too. It was a 56px trophy FAB pinned to the bottom-right
 * corner, which is the one spot a thumb reaches easily, spent on a secondary
 * view while primary navigation sat in the opposite corner behind a hamburger.
 * Navigation has that corner now; standings is a button in the header.
 */
const StandingsDrawer = ({
  open,
  onOpenChange,
  teams,
  divisions,
  standings,
  currentWeek,
  loading,
  isAuthenticated,
  onDivisionRename,
  onTeamDivisionChange,
  onCreateDivision,
  games = [],
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // Wider than the primitive's default: this is a table, and the default
        // `max-w-sm` would put the points columns into a horizontal scroll.
        className="w-[92vw] max-w-[690px] sm:w-[690px]"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-xl tracking-tight">Standings</SheetTitle>
          <SheetDescription>
            {currentWeek ? `Through week ${currentWeek}` : 'Current league standings'}
          </SheetDescription>
        </SheetHeader>

        <DrawerStandingsTable
          teams={teams}
          divisions={divisions}
          standings={standings}
          currentWeek={currentWeek}
          loading={loading}
          isAuthenticated={isAuthenticated}
          onDivisionRename={onDivisionRename}
          onTeamDivisionChange={onTeamDivisionChange}
          onCreateDivision={onCreateDivision}
          onClose={() => onOpenChange(false)}
          games={games}
          user={user}
          isAdmin={isAdmin}
          teamOwnerNames={teamOwnerNames}
        />
      </SheetContent>
    </Sheet>
  );
};

/**
 * The header button that opens the standings.
 *
 * Not a trophy: that glyph already means the rankings tab and a playoff week
 * inside the week picker. A ranked list is what this shows.
 */
export const StandingsTrigger = ({ onClick, className }) => (
  <Button
    variant="ghost"
    size="icon"
    onClick={onClick}
    aria-label="Open standings"
    title="Standings"
    className={cn('shrink-0', className)}
  >
    <ListOrdered className="h-5 w-5" aria-hidden="true" />
  </Button>
);

export default StandingsDrawer;
