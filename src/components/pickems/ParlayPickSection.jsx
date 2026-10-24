import { useMemo } from 'react';
import { Crosshair } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { EmptyState } from '../ui/empty-state';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import {
  useDivisions,
  useParlayLive,
  useParlayWeekPicks,
  useSeasonTeams
} from '../../../hooks/queries/index.js';
import { getMaskedDivisionName, getMaskedUserName } from '../../utils/displayNameUtils';
import { groupPicksByDivision } from '../../utils/parlayDivisions';
import { getPositionColor } from '../../utils/positionColors';
import { ParlayPickStatus } from './LiveTdIndicator.jsx';
import { pickOutcome } from './liveTdOutcome.js';
import ParlayMyPick from './ParlayMyPick.jsx';

/**
 * The weekly TD parlay, at the foot of the pick'ems form.
 *
 * It is deliberately not its own page and not its own deadline. `status` is the
 * *same object* PickEmsSubmission computed for the pick'ems above — passing it
 * down rather than recomputing it is what guarantees the two windows cannot
 * drift apart, and returning null without a `pickEmWeek` is what makes "the
 * parlay exists only when pick'ems is activated" true rather than aspirational.
 *
 * Three things are the database's job, not this component's:
 *   - the deadline (`submit_td_parlay_pick` raises outside the window),
 *   - who may see whose pick (RLS on `td_parlay_picks` — everyone, always,
 *     since `20260902150000_parlay_picks_visible_as_submitted`),
 *   - the canonical player name on a matched pick.
 * So the UI here can be naive about all three, and a bug in it leaks nothing.
 *
 * The board below the picker shows the league's picks as they are submitted
 * rather than holding them to the deadline, in two columns — one per division,
 * because the league runs one parlay per division. The column a pick belongs in
 * is derived, not stored; see `utils/parlayDivisions.js`.
 */
/**
 * One shared empty array for the `data = []` defaults below.
 *
 * A fresh `[]` per render is a new identity every render, which re-runs the
 * grouping memo on every keystroke in the picker above it.
 */
const EMPTY = [];

const ParlayPickSection = ({ pickEmWeek, seasonYear = null, status, weekNumber }) => {
  const { user, isAdmin, teamOwnerNames } = useViewer();

  const isOpen = status?.status === 'open';
  const isRevealed = status?.status === 'closed' || status?.status === 'completed';

  // Everyone's picks, whatever the week's state. There is nothing to gate on:
  // the picks are public from the moment they are submitted, and the row filter
  // that used to withhold them is gone.
  const { data: leaguePicks = EMPTY } = useParlayWeekPicks(pickEmWeek?.id);

  // The division a pick sits in is derived from the member's name matching a
  // `teams.owner`, so the board needs both halves of the league's identity.
  // Both hooks share the cache entries `useLeagueData` has already filled at
  // the app root, so this costs no request of its own.
  const seasonId = pickEmWeek?.seasonId ?? null;
  const { data: teams = EMPTY } = useSeasonTeams(seasonId);
  const { data: divisions = EMPTY } = useDivisions(seasonId);

  const { groups, unassigned } = useMemo(
    () => groupPicksByDivision(leaguePicks, { teams, divisions }),
    [leaguePicks, teams, divisions]
  );

  // Live TD status, from ESPN's public scoreboard, once the picks are locked and
  // the games are being played. Unofficial and client-polled — it fills the gap
  // between the Thursday deadline and Tuesday's grade, and the official grade
  // wins the moment it exists. See `hooks/queries/useParlayLive.js`.
  const { data: liveData } = useParlayLive(pickEmWeek?.id, {
    seasonYear,
    weekNumber,
    enabled: isRevealed
  });
  const liveStatus = liveData?.status;

  // A week with no pick'em row has no parlay. Not an empty state — there is
  // nothing here to have a state about.
  if (!pickEmWeek) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Crosshair className="h-5 w-5" />
              Weekly TD Parlay
            </CardTitle>
            <CardDescription>
              Pick one player on your opponents team this week that you think will
              score a TD. Proceeds go to the league fund for anything and
              everything og jits.
            </CardDescription>
            <CardDescription className="mt-1.5">
              Parlays are separated into divisions, 7 picks per each parlay.
            </CardDescription>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant={isOpen ? 'default' : isRevealed ? 'outline' : 'secondary'}>
              {isOpen ? 'Open' : isRevealed ? 'Locked' : 'Not open yet'}
            </Badge>
            {liveData?.live && (
              <Badge variant="success" className="gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
                Live
              </Badge>
            )}
            {status?.timeInfo && (
              <span className="text-xs text-muted-foreground">{status.timeInfo}</span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* The viewer's own pick, its picker and its draft — the component the
            home page's widget renders too. */}
        <ParlayMyPick
          pickEmWeek={pickEmWeek}
          seasonYear={seasonYear}
          status={status}
          weekNumber={weekNumber}
          liveStatus={liveStatus}
        />

        <LeaguePicks
          groups={groups}
          unassigned={unassigned}
          total={leaguePicks.length}
          showGrades={isRevealed}
          liveStatus={liveStatus}
          viewer={{ user, isAdmin, teamOwnerNames }}
        />
      </CardContent>
    </Card>
  );
};

/**
 * The league's picks, in a column per division.
 *
 * Live, not revealed: a pick appears here the moment it is submitted, which is
 * what `20260902150000_parlay_picks_visible_as_submitted` made true in the only
 * place it could be true — the row filter. This component holds nothing back.
 *
 * Every division gets a column even before anybody has entered it, so the board
 * has the same shape on Tuesday morning as it does on Sunday, and a reader can
 * see at a glance who in *their* parlay is still missing.
 *
 * `unassigned` is rendered rather than dropped. It is a member whose display
 * name matches no `teams.owner` — a real state, since the name is theirs to
 * type — and putting them in a division we guessed at would misreport who is
 * competing with whom.
 */
const LeaguePicks = ({ groups, unassigned, total, showGrades, liveStatus, viewer }) => {
  const hasDivisions = groups.length > 0;

  return (
    <div className="border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-base font-semibold text-foreground">
          The league&rsquo;s picks
        </h4>
        <span className="text-xs text-muted-foreground">
          {total} {total === 1 ? 'pick' : 'picks'} in
        </span>
      </div>

      {total === 0 && !hasDivisions ? (
        <EmptyState
          icon={Crosshair}
          title="No picks yet"
          description="Picks show up here as they are submitted."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group, index) => (
            <DivisionColumn
              key={group.division?.id ?? index}
              title={getMaskedDivisionName(
                group.division,
                index,
                viewer.user,
                viewer.isAdmin,
                viewer.teamOwnerNames
              )}
              picks={group.picks}
              showGrades={showGrades}
              liveStatus={liveStatus}
              viewer={viewer}
              emptyText="Nobody in this division has picked yet."
            />
          ))}

          {unassigned.length > 0 && (
            <DivisionColumn
              // Full width under the two columns: it is a footnote about names
              // that did not match, not a third parlay.
              className="md:col-span-2"
              title="Not matched to a division"
              picks={unassigned}
              showGrades={showGrades}
              liveStatus={liveStatus}
              viewer={viewer}
            />
          )}
        </div>
      )}
    </div>
  );
};

/**
 * One division's parlay: its name, and the picks entered against it.
 *
 * A labelled `<section>` rather than a `<div>`, so each column is a named
 * region — a screen reader reaching "Bijan Robinson" can be told which parlay
 * it belongs to, which is the only thing the two-column layout conveys and the
 * one thing a linear read of a flat list would lose.
 */
const DivisionColumn = ({ className, title, picks, showGrades, liveStatus, viewer, emptyText }) => (
  <section
    aria-label={title}
    className={cn('rounded-lg border border-border bg-muted/20 p-3', className)}
  >
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <h5 className="truncate text-sm font-semibold text-foreground">{title}</h5>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{picks.length}</span>
    </div>

    {picks.length === 0 ? (
      <p className="py-2 text-sm text-muted-foreground">{emptyText}</p>
    ) : (
      <ul className="divide-y divide-border">
        {picks.map((pick) => {
          // The whole row goes green once a TD is on the board and red once the
          // game is final with none — a faster read than the trailing icon
          // alone. Undecided rows stay neutral (see `pickOutcome`). The
          // negative margin lets the tint reach the column's padded edges so it
          // reads as a filled row rather than an inset chip.
          const outcome = pickOutcome({ scoredTd: pick.scoredTd, live: liveStatus?.[pick.id] });
          return (
          <li
            key={pick.id}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm',
              outcome === 'hit' && '-mx-3 bg-success/15 px-3',
              outcome === 'miss' && '-mx-3 bg-destructive/15 px-3'
            )}
          >
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {getMaskedUserName(
                pick.displayName,
                pick.userId,
                viewer.user,
                viewer.isAdmin,
                viewer.teamOwnerNames
              )}
            </span>
            <span className="truncate font-medium">{pick.playerNameRaw}</span>
            {pick.player?.position && (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
                  getPositionColor(pick.player.position)
                )}
              >
                {pick.player.position}
              </span>
            )}
            {/* Official grade wins; a live overlay fills the gap before it, and
                a pending dash shows once the picks are locked. The component
                keeps that precedence so a game in progress never reads as a
                settled result. */}
            <ParlayPickStatus
              scoredTd={pick.scoredTd}
              live={liveStatus?.[pick.id]}
              compact
              showPendingDash={showGrades}
            />
          </li>
          );
        })}
      </ul>
    )}
  </section>
);

export default ParlayPickSection;
