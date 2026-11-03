import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ListOrdered } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { LiveDot } from '../../ui/live-dot';
import { NumberText, RecordText } from '../../ui/number-text';
import { SkeletonTable } from '../../ui/skeleton';
import { TeamAvatar } from '../../ui/team-identity';
import { cn, formatTime } from '../../../lib/utils';
import { getMaskedDivisionName, getMaskedTeamName } from '../../../utils/displayNameUtils';
import { faabOf, formatFaab } from '../../../utils/format';
import { StreakChip } from '../../ui/streak-chip';
import { ScrollTable } from '../../ui/scroll-table';
import { ROW_TONE, STICKY_CELL, STICKY_HEAD, VIEWER_RAIL } from '../../ui/table-tones';
import { teamRosterPath } from '../../teams/teamLink';
import { profilePath } from '../../profile/profileLink';
import { PathToPlayoffsButton } from '../../playoffs/path/PathToPlayoffsButton';
import { QualifierKey, RankMovement } from '../../standings/DrawerStandingsTable';
import { StandingsViewToggle } from '../../standings/StandingsViewToggle';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useDivisions, useLiveWeek, useStandings } from '../../../../hooks/queries/index.js';
import { liveStandingsWeek } from '../../../../utils/liveOverlay.js';
import { STANDINGS_VIEW, standingsForView } from '../../../../utils/standings/standingsView.js';
import { franchiseIdsByTeam } from '../../../../utils/viewerTeam.js';
import { usesSeededPlayoffs } from '../../../../utils/playoffSeeding.js';
import { showsPathToPlayoffs } from '../../../../utils/projectedBracket.js';
import { streakOf } from '../../../../utils/home/streak.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** One empty list, so a season with no schedule does not re-run the standings every render. */
const NO_GAMES = Object.freeze([]);

/**
 * The table's width: the team column (whatever the card has after the 9.25rem
 * of rank, record and points for and the chevron's 1.5rem, but never under
 * twelve letters of name — 11ch, since `ch` is a digit and letters run
 * narrower) plus every other column: 9.25rem shown by default, 19rem to the
 * right, and the seed's 3rem from 2026. Literal strings, so Tailwind generates
 * them.
 */
const TABLE_WIDTH = {
  seeded: 'w-[calc(max(11ch_+_2.75rem,100cqw_-_10.75rem)_+_31.25rem)]',
  plain: 'w-[calc(max(11ch_+_2.75rem,100cqw_-_10.75rem)_+_28.25rem)]'
};

/**
 * Each division as a compact table — rank, team, record, points for — with the
 * row tints the standings drawer uses: from 2026 a bye is yellow and a wild
 * card green, before that green is "top three in the division". The seeds are
 * the standings RPC's (`get_standings_by_division`), the same rows the drawer
 * renders, so the two cannot disagree. "Full standings" opens the drawer
 * itself rather than a second copy of it.
 *
 * Every column the drawer has, in a table wider than the card: rank, team,
 * record and points for fill the card by default, and points against,
 * differential, win %, streak, seed and FAAB are a swipe (or a scrollbar) to the
 * right, with the rank held in place (`ScrollTable`). The RPC has no FAAB, so
 * that one comes off the season's own teams. Divisions stack in
 * a narrow card and sit side by side in a wide one (a container query, `@xl`).
 * The whole row opens the team's roster.
 *
 * **Live · Official, the drawer's first two views, without its Week picker.**
 * While a week is in progress the card offers the drawer's toggle: Live plays
 * the week as if its games ended now and marks each row's movement against
 * Official (`RankMovement`, under the rank); Official is the RPC's own rows.
 * Both go through `standingsForView`, the one definition the drawer reads, so
 * the two surfaces cannot disagree. Live is the default while a game is on,
 * as in the drawer. With no week in progress there is no choice to offer and
 * the toggle is not drawn. Week N stays the drawer's: a home card is about
 * now.
 */
export default function StandingsMini({ ctx }) {
  const { seasonId, season, config, actualWeek = null, viewerTeam, onOpenStandings, openTab, canOpenTab } = ctx;
  const { isApproved } = useViewer();
  const franchiseIds = franchiseIdsByTeam(season?.teams);
  const faabByTeam = new Map((season?.teams ?? []).map((team) => [team.id, faabOf(team)]));
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const navigate = useNavigate();
  const standings = useStandings(seasonId);
  const divisionsQuery = useDivisions(seasonId);

  const games = season?.schedule ?? NO_GAMES;
  const liveWeek = liveStandingsWeek({ actualWeek, games });
  const { data: live } = useLiveWeek(seasonId, liveWeek, { actualWeek });

  // `null` is "the default": Live while a game is on, Official otherwise. A
  // choice lasts while the page does.
  const [pickedMode, setPickedMode] = useState(null);
  const wanted = pickedMode ?? (live?.live ? STANDINGS_VIEW.LIVE : STANDINGS_VIEW.OFFICIAL);
  // A Live choice outlives the live week (the last score landing) and falls back.
  const mode = wanted === STANDINGS_VIEW.LIVE && !live ? STANDINGS_VIEW.OFFICIAL : wanted;

  const shownStandings = useMemo(
    () =>
      standings.data
        ? standingsForView({
            mode,
            official: standings.data,
            teams: season?.teams ?? [],
            games,
            divisions: divisionsQuery.data ?? [],
            live,
            year: season?.year
          })
        : standings.data,
    [mode, standings.data, season?.teams, season?.year, games, divisionsQuery.data, live]
  );

  const asOf = mode === STANDINGS_VIEW.LIVE && live?.refreshedAt ? formatTime(live.refreshedAt) : null;

  const seeded = usesSeededPlayoffs(season?.year);
  const showPath =
    canOpenTab?.('playoffs') &&
    showsPathToPlayoffs({
      year: season?.year,
      games: season?.schedule,
      regularSeasonWeeks: config?.regularSeasonWeeks || undefined
    });
  const divisions = (divisionsQuery.data ?? [])
    .map((division, index) => ({
      ...division,
      label: getMaskedDivisionName(division, index, user, isAdmin, teamOwnerNames),
      teams:
        shownStandings?.divisions?.find((d) => sameId(d.divisionId, division.id))?.teams ?? []
    }))
    .filter((division) => division.teams.length > 0);

  // The drawer's tints, made opaque (see `table-tones.js`).
  const tone = (team) => {
    if (seeded && team.isBye) return ROW_TONE.bye;
    return team.isPlayoffSpot ? ROW_TONE.qualifier : ROW_TONE.base;
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
        {/* In the card and not its header, where two buttons beside the title
            leave no room at phone width. The toggle only appears with a week
            in progress: one choice is no choice. */}
        {live && (
          <div className="flex flex-wrap items-center gap-2">
            <StandingsViewToggle
              mode={mode}
              onModeChange={setPickedMode}
              hasLive
              gameOn={Boolean(live.live)}
              weeks={[]}
              week={null}
              onWeekChange={() => {}}
            />
            {asOf && (
              <Badge variant="success" className="gap-1.5 text-xs">
                <LiveDot done={!live.live} />
                As of {asOf}
              </Badge>
            )}
          </div>
        )}
        {(seeded || showPath) && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            {seeded && <QualifierKey />}
            {showPath && <PathToPlayoffsButton teamId={viewerTeam?.id} onClick={openTab} />}
          </div>
        )}
        {/* By the card's width, not the viewport's: side by side once the
            card can hold two tables, whichever column it sits in. */}
        <div className="grid gap-5 @xl:grid-cols-2 @xl:gap-6">
          {divisions.map((division) => (
            <div key={division.id} className="min-w-0">
              <h3 className="pb-1.5 text-sm font-semibold">{division.label}</h3>
              <ScrollTable label={`${division.label} standings table`}>
                <table
                  className={cn(
                    'table-fixed border-separate border-spacing-0 text-sm',
                    seeded ? TABLE_WIDTH.seeded : TABLE_WIDTH.plain
                  )}
                >
                  <colgroup>
                    <col className="w-9" />
                    {/* Whatever the card has left after rank, record and
                        points for — so the default view is those four
                        columns exactly — and never so little that a name
                        loses its first twelve letters. */}
                    <col className="w-[max(11ch_+_2.75rem,100cqw_-_10.75rem)]" />
                    <col className="w-[3.25rem]" />
                    <col className="w-[3.75rem]" />
                    <col className="w-16" />
                    <col className="w-[4.25rem]" />
                    <col className="w-[3.75rem]" />
                    <col className="w-14" />
                    {seeded && <col className="w-12" />}
                    <col className="w-14" />
                  </colgroup>
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className={cn(STICKY_HEAD, 'left-0 z-[3] border-b border-r border-border/60 py-1.5 pl-2 text-left font-medium')}>
                        <span className="sr-only">Division rank</span>#
                      </th>
                      <th scope="col" className={cn(STICKY_HEAD, 'border-b border-border/60 px-1.5 py-1.5 text-left font-medium')}>
                        Team
                      </th>
                      {['W-L', 'PF', 'PA', 'Diff', 'Win%', 'Streak', ...(seeded ? ['Seed'] : []), 'FAAB'].map((label) => (
                        <th
                          key={label}
                          scope="col"
                          className={cn(
                            STICKY_HEAD,
                            'border-b border-border/60 px-1.5 py-1.5 font-medium',
                            label === 'W-L' || label === 'Streak' || label === 'Seed' ? 'text-center' : 'text-right'
                          )}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {division.teams.map((team, index) => {
                      const isViewer = viewerTeam && sameId(team.id, viewerTeam.id);
                      const name = getMaskedTeamName(team, user, isAdmin, teamOwnerNames);
                      // The row and the name go to one place: the profile, or
                      // the roster for a viewer who cannot open one.
                      const franchiseId = franchiseIds.get(team.id);
                      const to = isApproved && franchiseId ? profilePath(franchiseId) : teamRosterPath(team.id);
                      const cell = 'h-11 border-b border-border/40 group-last:border-0';
                      return (
                        <tr
                          key={team.id}
                          onClick={() => navigate(to)}
                          className={cn('group cursor-pointer', tone(team), isViewer && ROW_TONE.viewer)}
                        >
                          <td className={cn(cell, STICKY_CELL, 'left-0 pl-2 font-semibold tabular text-muted-foreground', isViewer && VIEWER_RAIL)}>
                            {/* The movement sits under the number: the column
                                is 2.25rem, and the row has the height. */}
                            <span className="flex flex-col items-start leading-none">
                              <span>{team.divisionRank ?? index + 1}</span>
                              <RankMovement movement={team.movement} />
                            </span>
                          </td>
                          <td className={cn(cell, 'px-1.5')}>
                            <Link
                              to={to}
                              title={name}
                              onClick={(event) => event.stopPropagation()}
                              className="flex min-w-0 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <TeamAvatar team={team} size="xs" />
                              <span className="truncate font-medium">{name}</span>
                              {team.isBye && <span className="sr-only">First-round bye</span>}
                              {team.isWildcard && <span className="sr-only">Wild card</span>}
                            </Link>
                          </td>
                          <td className={cn(cell, 'px-1.5 text-center text-[13px]')}>
                            <RecordText wins={team.wins} losses={team.losses} ties={team.ties} />
                          </td>
                          <td className={cn(cell, 'px-1.5 text-right text-[13px]')}>
                            <NumberText value={team.pointsFor} />
                          </td>
                          <td className={cn(cell, 'px-1.5 text-right text-[13px] text-muted-foreground')}>
                            <NumberText value={team.pointsAgainst} />
                          </td>
                          <td className={cn(cell, 'px-1.5 text-right text-[13px]')}>
                            <NumberText value={team.pointDifferential} variant="delta" emphasis="signed" />
                          </td>
                          <td className={cn(cell, 'px-1.5 text-right text-[13px] text-muted-foreground')}>
                            <NumberText value={team.winPercentage == null ? null : team.winPercentage * 100} variant="percent" />
                          </td>
                          <td className={cn(cell, 'px-1.5 text-center')}>
                            <StreakChip streak={streakOf(team, season?.schedule ?? [])} />
                          </td>
                          {seeded && (
                            <td className={cn(cell, 'px-1.5 text-center text-[13px] tabular text-muted-foreground')}>
                              {team.playoffSeed ?? '—'}
                            </td>
                          )}
                          <td className={cn(cell, 'px-1.5 text-right text-[13px] tabular text-muted-foreground')}>
                            {formatFaab(faabByTeam.get(team.id))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollTable>
            </div>
          ))}
        </div>
      </div>
    </HomeWidget>
  );
}
