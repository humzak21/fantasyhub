import React, { useState } from 'react';
import { ListOrdered } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useSeasons,
  useSeasonTeams,
  useSeasonGames,
  useDivisions,
  useStandings,
  useLeagueMutations,
} from '../../../hooks/queries/index.js';
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
 *
 * **The admin can point it at another season.** Divisions are per-season rows
 * (`divisions.season_id`, `teams.season_id`), and Manage mode is the only
 * place in the app that moves a team between them — but the drawer was wired
 * to the active season alone, so fixing 2024's divisions meant SQL. The
 * picker in the table's header row is admin-only, and choosing a season other than the
 * active one hands the table that season's teams, divisions and standings,
 * with mutations scoped to that season's id so the writes and the cache
 * invalidations both land on the year being edited. The active season keeps
 * its prop-fed path: it is what everybody sees, and it should not gain a
 * second set of queries for the sake of a control only one person has.
 */
const StandingsDrawer = ({
  open,
  onOpenChange,
  /** The active season's id — what the props below describe. */
  seasonId = null,
  teams,
  divisions,
  standings,
  currentWeek,
  seasonYear = null,
  loading,
  isAuthenticated,
  onDivisionRename,
  onTeamDivisionChange,
  onCreateDivision,
  onDivisionDelete,
  games = [],
}) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  // `null` means "the active season", which is what the drawer opens on. Kept
  // across open/close so the admin does not lose their place mid-edit.
  const [pickedSeasonId, setPickedSeasonId] = useState(null);
  const { data: seasons = [] } = useSeasons({ enabled: Boolean(isAdmin && open) });

  const editingSeasonId =
    isAdmin && pickedSeasonId != null && pickedSeasonId !== seasonId ? pickedSeasonId : null;
  const editingSeason = editingSeasonId
    ? seasons.find((season) => String(season.id) === String(editingSeasonId)) ?? null
    : null;

  const showSeasonPicker = isAdmin && seasons.length > 1;
  const pickerValue = String(editingSeasonId ?? seasonId ?? '');

  let description;
  if (editingSeason) {
    description = editingSeason.isCompleted
      ? `${editingSeason.year} season · final`
      : `${editingSeason.year} season`;
  } else {
    description = currentWeek ? `Through week ${currentWeek}` : 'Current league standings';
  }

  // The admin's season picker. It renders inside the table's header row, in
  // the controls cluster next to Manage — the drawer used to carry a second
  // header of its own above the table (title, description, then this control
  // on a line by itself), so "Standings" appeared twice and the picker sat in
  // the gap between them. The sheet's own title and description are still
  // rendered, visually hidden, because they are what labels the dialog.
  const seasonPicker = showSeasonPicker ? (
    <div className="flex items-center gap-2">
      <Label htmlFor="standings-season" className="sr-only">
        Season
      </Label>
      <Select
        value={pickerValue}
        onValueChange={(value) => {
          const season = seasons.find((s) => String(s.id) === value);
          setPickedSeasonId(season ? season.id : null);
        }}
      >
        <SelectTrigger id="standings-season" className="h-8 w-auto min-w-[7.5rem] text-xs">
          <SelectValue placeholder="Season" />
        </SelectTrigger>
        <SelectContent>
          {seasons.map((season) => (
            <SelectItem key={season.id} value={String(season.id)}>
              {season.year}
              {String(season.id) === String(seasonId) ? ' (active)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        // From the left, the side the standings trigger sits on in the header,
        // so the panel slides out from under the control that opened it.
        side="left"
        // The table's header row carries the close button.
        hideClose
        // Wider than the primitive's default: this is a table, and the default
        // `max-w-sm` would put the points columns into a horizontal scroll.
        className="w-[92vw] max-w-[725px] sm:w-[725px]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Standings</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        {editingSeasonId ? (
          <SeasonStandings
            seasonId={editingSeasonId}
            season={editingSeason}
            onClose={() => onOpenChange(false)}
            user={user}
            isAdmin={isAdmin}
            teamOwnerNames={teamOwnerNames}
            seasonPicker={seasonPicker}
          />
        ) : (
          <DrawerStandingsTable
            teams={teams}
            divisions={divisions}
            standings={standings}
            currentWeek={currentWeek}
            seasonYear={seasonYear}
            loading={loading}
            isAuthenticated={isAuthenticated}
            onDivisionRename={onDivisionRename}
            onTeamDivisionChange={onTeamDivisionChange}
            onCreateDivision={onCreateDivision}
            onDivisionDelete={onDivisionDelete}
            onClose={() => onOpenChange(false)}
            games={games}
            user={user}
            isAdmin={isAdmin}
            teamOwnerNames={teamOwnerNames}
            seasonPicker={seasonPicker}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};

/**
 * One season's standings, read and written by that season's id.
 *
 * Every query key and every mutation here carries `seasonId`, so moving a
 * 2024 team invalidates 2024's standings and not the active season's — and
 * `assignTeamToDivision` in the data layer refuses a division from any other
 * season, so the picker cannot be used to cross the years even by accident.
 */
function SeasonStandings({ seasonId, season, onClose, user, isAdmin, teamOwnerNames, seasonPicker }) {
  const teamsQuery = useSeasonTeams(seasonId);
  const divisionsQuery = useDivisions(seasonId);
  const standingsQuery = useStandings(seasonId);
  const gamesQuery = useSeasonGames(seasonId);
  const { createDivision, renameDivision, deleteDivision, assignTeamToDivision } =
    useLeagueMutations(seasonId);

  return (
    <DrawerStandingsTable
      teams={teamsQuery.data ?? []}
      divisions={divisionsQuery.data ?? []}
      standings={standingsQuery.data ?? { divisions: [], unassigned: [] }}
      // No week badge: a past season's standings are the whole season's.
      currentWeek={null}
      seasonYear={season?.year ?? null}
      loading={teamsQuery.isPending || divisionsQuery.isPending || standingsQuery.isPending}
      isAuthenticated={isAdmin}
      onDivisionRename={(divisionId, name) => renameDivision.mutateAsync({ divisionId, name })}
      onTeamDivisionChange={(teamId, divisionId) =>
        assignTeamToDivision.mutateAsync({ teamId, divisionId })
      }
      onCreateDivision={(name, displayOrder) => createDivision.mutateAsync({ name, displayOrder })}
      onDivisionDelete={(divisionId) => deleteDivision.mutateAsync(divisionId)}
      onClose={onClose}
      games={gamesQuery.data ?? []}
      user={user}
      isAdmin={isAdmin}
      teamOwnerNames={teamOwnerNames}
      seasonPicker={seasonPicker}
    />
  );
}

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
