import { Link } from 'react-router-dom';
import { ListOrdered } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { Button } from '../../ui/button';
import { NumberText, RecordText } from '../../ui/number-text';
import { SkeletonTable } from '../../ui/skeleton';
import { TeamAvatar } from '../../ui/team-identity';
import { cn } from '../../../lib/utils';
import { getMaskedDivisionName, getMaskedTeamName } from '../../../utils/displayNameUtils';
import { getUserTeamHighlightClasses } from '../../../utils/userTeamUtils';
import { teamRosterPath } from '../../teams/teamLink';
import { QualifierKey } from '../../standings/DrawerStandingsTable';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useDivisions, useStandings } from '../../../../hooks/queries/index.js';
import { usesSeededPlayoffs } from '../../../../utils/playoffSeeding.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * Each division as a compact table — rank, team, record, points for — with the
 * row tints the standings drawer uses: from 2026 a bye is yellow and a wild
 * card green, before that green is "top three in the division". The seeds are
 * the standings RPC's (`get_standings_by_division`), the same rows the drawer
 * renders, so the two cannot disagree. "Full standings" opens the drawer
 * itself rather than a second copy of it.
 *
 * Four columns is a plain table at every width — the `ResponsiveDataTable`
 * threshold is about four. Divisions stack in a narrow card and sit side by
 * side in a wide one (a container query, `@xl`).
 */
export default function StandingsMini({ ctx }) {
  const { seasonId, season, viewerTeam, onOpenStandings } = ctx;
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const standings = useStandings(seasonId);
  const divisionsQuery = useDivisions(seasonId);

  const seeded = usesSeededPlayoffs(season?.year);
  const divisions = (divisionsQuery.data ?? [])
    .map((division, index) => ({
      ...division,
      label: getMaskedDivisionName(division, index, user, isAdmin, teamOwnerNames),
      teams:
        standings.data?.divisions?.find((d) => sameId(d.divisionId, division.id))?.teams ?? []
    }))
    .filter((division) => division.teams.length > 0);

  const tint = (team) => {
    if (seeded && team.isBye) return 'bg-warning/15';
    return team.isPlayoffSpot ? 'bg-success/10' : '';
  };

  return (
    <HomeWidget
      id="standings"
      icon={ListOrdered}
      title="Standings"
      aside={
        onOpenStandings && (
          <Button variant="ghost" size="sm" onClick={onOpenStandings} className="h-9 text-[13px]">
            Full standings
          </Button>
        )
      }
      loading={standings.isPending || divisionsQuery.isPending}
      skeleton={<SkeletonTable rows={7} columns={4} label="Loading standings" />}
      error={standings.isError || divisionsQuery.isError}
      onRetry={() => {
        standings.refetch();
        divisionsQuery.refetch();
      }}
      empty={divisions.length === 0 && <p className="text-sm text-muted-foreground">No standings yet.</p>}
    >
      <div className="@container space-y-4">
        {seeded && <QualifierKey />}
        {/* By the card's width, not the viewport's: side by side once the
            card can hold two tables, whichever column it sits in. */}
        <div className="grid gap-5 @xl:grid-cols-2 @xl:gap-6">
          {divisions.map((division) => (
            <table key={division.id} className="w-full table-fixed text-sm">
              <caption className="pb-1.5 text-left text-sm font-semibold">{division.label}</caption>
              <colgroup>
                <col className="w-8" />
                <col />
                <col className="w-14" />
                <col className="w-16" />
              </colgroup>
              <thead>
                <tr className="border-b border-border/60 text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pl-2 text-left font-medium">
                    <span className="sr-only">Division rank</span>#
                  </th>
                  <th scope="col" className="px-1.5 py-1.5 text-left font-medium">Team</th>
                  <th scope="col" className="px-1 py-1.5 text-center font-medium">W-L</th>
                  <th scope="col" className="py-1.5 pl-1 pr-2 text-right font-medium">PF</th>
                </tr>
              </thead>
              <tbody>
                {division.teams.map((team, index) => {
                  const isViewer = viewerTeam && sameId(team.id, viewerTeam.id);
                  const name = getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
                  return (
                    <tr
                      key={team.id}
                      className={cn(
                        'relative h-11 border-b border-border/40 last:border-0',
                        tint(team),
                        getUserTeamHighlightClasses(isViewer)
                      )}
                    >
                      <td className="pl-2 font-semibold tabular text-muted-foreground">
                        {team.divisionRank ?? index + 1}
                      </td>
                      <td className="px-1.5">
                        <Link
                          to={teamRosterPath(team.id)}
                          title={name}
                          className="flex min-w-0 items-center gap-2 outline-none after:absolute after:inset-0 focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring"
                        >
                          <TeamAvatar team={team} size="xs" />
                          <span className="truncate font-medium">{name}</span>
                          {team.isBye && <span className="sr-only">First-round bye</span>}
                          {team.isWildcard && <span className="sr-only">Wild card</span>}
                        </Link>
                      </td>
                      <td className="px-1 text-center text-[13px]">
                        <RecordText wins={team.wins} losses={team.losses} ties={team.ties} />
                      </td>
                      <td className="pl-1 pr-2 text-right text-[13px] text-muted-foreground">
                        <NumberText value={team.pointsFor} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        </div>
      </div>
    </HomeWidget>
  );
}
