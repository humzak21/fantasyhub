import React, { useState } from 'react';
import { Filter } from 'lucide-react';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from './drawer';
import { TeamAvatar } from './team-identity';
import { useIsMobile } from '../../hooks/use-mobile';
import { getMaskedTeamName } from '../../utils/displayNameUtils';

/**
 * Which teams the charts show.
 *
 * This used to be a floating control in the literal sense: a circular button
 * the reader dragged around the page, opening a resizable panel positioned at
 * a hardcoded `{x: 20, y: 450}` that could land on top of the chart it was
 * filtering, over 150 lines of pointer-drag and resize bookkeeping, with an
 * inline `scrollbarColor` of a light track on a dark page. It was also
 * rendered last in the document, so on a phone the button controlling the
 * charts sat four chart-heights below them.
 *
 * It sits in the chart toolbar now, next to the week range, and opens where
 * it stands: a popover on a pointer device, a bottom sheet on touch. The
 * `useIsMobile` fork stays — those two are structurally different components,
 * which is exactly the case the hook exists for — but everything else went.
 */
const FloatingTeamFilter = ({
  rankings = [],
  selectedTeams = [],
  onToggleTeam,
  onToggleAllTeams,
  user,
  isAdmin,
  teamOwnerNames,
}) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);

  if (!rankings || rankings.length === 0) return null;

  const allSelected = selectedTeams.length === rankings.length;
  // No selection means no filter, which shows every team — saying "0 of 14"
  // would describe an empty chart the reader is not looking at.
  const isFiltered = selectedTeams.length > 0 && !allSelected;

  const trigger = (
    <Button variant="outline" className="w-full gap-2 sm:w-auto">
      <Filter className="h-4 w-4" aria-hidden="true" />
      Teams
      {isFiltered && (
        <span className="rounded bg-primary/15 px-1.5 py-px text-xs font-medium tabular text-primary">
          {selectedTeams.length}
        </span>
      )}
    </Button>
  );

  const list = (
    <TeamCheckboxList
      rankings={rankings}
      selectedTeams={selectedTeams}
      onToggleTeam={onToggleTeam}
      onToggleAllTeams={onToggleAllTeams}
      allSelected={allSelected}
      user={user}
      isAdmin={isAdmin}
      teamOwnerNames={teamOwnerNames}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Teams</DrawerTitle>
            <p className="text-sm text-muted-foreground">
              {isFiltered ? `Showing ${selectedTeams.length} of ${rankings.length}` : 'Showing all teams'}
            </p>
          </DrawerHeader>
          <DrawerBody className="px-4 pb-4">{list}</DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="max-h-[22rem] overflow-y-auto overscroll-contain">{list}</div>
      </PopoverContent>
    </Popover>
  );
};

/** The list itself — identical in both presentations, so it lives in one place. */
const TeamCheckboxList = ({
  rankings,
  selectedTeams,
  onToggleTeam,
  onToggleAllTeams,
  allSelected,
  user,
  isAdmin,
  teamOwnerNames,
}) => (
  <div>
    <button
      type="button"
      onClick={onToggleAllTeams}
      className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs font-medium text-primary transition-colors hover:bg-accent"
    >
      {allSelected ? 'Clear all' : 'Select all'}
    </button>

    {rankings.map((team) => {
      const id = `team-filter-${team.id}`;
      return (
        <label
          key={team.id}
          htmlFor={id}
          // `min-h-11` on touch only: a 32px checkbox row is a coin-flip tap.
          className="flex w-full cursor-pointer items-center gap-2.5 rounded p-2 text-sm transition-colors hover:bg-accent pointer-coarse:min-h-11"
        >
          <Checkbox
            id={id}
            checked={selectedTeams.includes(team.id)}
            onCheckedChange={() => onToggleTeam(team.id)}
          />
          <TeamAvatar team={team} size="xs" />
          <span className="min-w-0 flex-1 truncate">
            {getMaskedTeamName(team, user, isAdmin, teamOwnerNames)}
          </span>
        </label>
      );
    })}
  </div>
);

export default FloatingTeamFilter;
