import { NumberText, RecordText } from '../../ui/number-text';
import { TeamAvatar } from '../../ui/team-identity';
import { TeamLink } from '../../ui/team-link';
import { cn } from '../../../lib/utils';
import { getMaskedDivisionName } from '../../../utils/displayNameUtils';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { ROW_TONE, VIEWER_RAIL } from '../../ui/table-tones';
import { QualifierKey, RankMovement } from '../../standings/DrawerStandingsTable';

const CELL = 'h-9 border-b border-border/40 group-last:border-0';

/**
 * The scenario as a table: each division in `computeStandings`' order, with the
 * standings' own tints, the seed and the move from today's place. The rows are
 * the caller's, so this has no opinion about what a scenario counts.
 *
 * @param {object} props
 * @param {{ divisions: Array<object> }} props.standings
 * @param {Array<{ id: *, name: string }>} props.divisions - for each division's order
 * @param {Map<*, object>} props.teamsById - each row's franchise identity
 * @param {(team: object) => string} props.nameOf
 * @param {*} props.focusId
 */
export function ScenarioStandings({ standings, divisions, teamsById, nameOf, focusId }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  const place = (division) => {
    const index = divisions.findIndex((candidate) => candidate.id === division.divisionId);
    return index === -1 ? divisions.length : index;
  };
  const inOrder = [...standings.divisions].sort((a, b) => place(a) - place(b));

  return (
    <div className="@container space-y-4">
      <QualifierKey />
      {inOrder.map((division, index) => {
        const label = getMaskedDivisionName(
          { name: division.divisionName ?? `Division ${index + 1}` },
          index,
          user,
          isAdmin,
          teamOwnerNames
        );

        return (
          <div key={division.divisionId} className="min-w-0">
            <h3 className="pb-1.5 text-sm font-semibold">{label}</h3>
            <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
              <caption className="sr-only">{label} in this scenario</caption>
              <colgroup>
                <col className="w-11" />
                <col />
                <col className="w-[3.25rem]" />
                <col className="w-14" />
                <col className="w-9" />
              </colgroup>
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="border-b border-border/60 py-1.5 pl-2 text-left font-medium">
                    <span className="sr-only">Division rank</span>#
                  </th>
                  <th scope="col" className="border-b border-border/60 px-1.5 py-1.5 text-left font-medium">Team</th>
                  <th scope="col" className="border-b border-border/60 px-1 py-1.5 text-center font-medium">W-L</th>
                  <th scope="col" className="border-b border-border/60 px-1 py-1.5 text-right font-medium">PF</th>
                  <th scope="col" className="border-b border-border/60 py-1.5 pr-2 text-center font-medium">Seed</th>
                </tr>
              </thead>
              <tbody>
                {division.teams.map((row) => {
                  const team = teamsById.get(row.id);
                  const focused = row.id === focusId;
                  const tone = row.isBye ? ROW_TONE.bye : row.isPlayoffSpot ? ROW_TONE.qualifier : ROW_TONE.base;
                  return (
                    <tr key={row.id} className={cn('group', tone, focused && ROW_TONE.viewer)}>
                      <td className={cn(CELL, 'pl-2 font-semibold tabular text-muted-foreground', focused && VIEWER_RAIL)}>
                        <span className="flex items-baseline gap-1">
                          {row.divisionRank}
                          <RankMovement movement={row.movement} />
                        </span>
                      </td>
                      <td className={cn(CELL, 'px-1.5')}>
                        <span className="flex min-w-0 items-center gap-2">
                          {/* The name matters more than the chip in a phone's card. */}
                          <TeamAvatar team={team} size="xs" className="hidden @sm:flex" />
                          <TeamLink team={team} className="truncate font-medium">{nameOf(team)}</TeamLink>
                        </span>
                      </td>
                      <td className={cn(CELL, 'px-1 text-center text-[13px]')}>
                        <RecordText wins={row.wins} losses={row.losses} ties={row.ties} />
                      </td>
                      <td className={cn(CELL, 'px-1 text-right text-[13px]')}>
                        <NumberText value={row.pointsFor} />
                      </td>
                      <td className={cn(CELL, 'pr-2 text-center text-[13px] tabular text-muted-foreground')}>
                        {row.playoffSeed ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

export default ScenarioStandings;
