import { useMemo } from 'react';
import { AlertCircle, Users } from 'lucide-react';

import { Card } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { badgeVariants } from '../ui/badge';
import { NumberText } from '../ui/number-text';
import { ScrollHint } from '../ui/scroll-hint';
import { TeamAvatar } from '../ui/team-identity';
import { cn } from '../../lib/utils';
import { useViewer } from '../../contexts/ViewerContext.jsx';
import { useAllPicks } from '../../../hooks/queries/index.js';
import { getMaskedOwnerName, getMaskedTeamName } from '../../utils/displayNameUtils';
import { isByeGame, summarizePickSplit } from './pickSplit.js';

/**
 * How the league picked this week: one box per team, two rows of seven, with
 * the share of the picks that team got under its name, and a W on each
 * matchup's winner once the week is scored.
 *
 * It appears in two places, one after the other in a week's life: on Make
 * Picks between the week's card and the TD parlay, from the moment the window
 * closes; then, because a scored week swaps Make Picks for Results, at the top
 * of the Results tab, where the winners are marked. Each page decides `closed`
 * — Make Picks from its own status, Results from `resultsAvailable` — and the
 * explainer (`LeaguePickSplitNote`) goes in that page's header card.
 *
 * **The wait is the page's, not the database's.** `pick_em_submissions` has
 * been public-read since the baseline, so holding the boxes back until the
 * window closes hides nothing from somebody reading PostgREST directly. It is
 * there so the split cannot steer anybody's picks while they can still be
 * changed.
 *
 * The boxes and their explainer render in different cards, so each calls
 * `useLeaguePickSplit`; both read the one `qk.pickems.allPicks` cache entry,
 * so that is one request, and it is not issued at all while the window is
 * open.
 */

/** One shared empty array, so the memo below does not see a new one each render. */
const EMPTY = [];

function useLeaguePickSplit({ pickEmWeek, games, closed }) {
  const list = games ?? EMPTY;
  const hasMatchups = list.some((game) => !isByeGame(game));
  const shown = Boolean(pickEmWeek) && Boolean(closed) && hasMatchups;

  const { data: picks = EMPTY, isLoading, isError } = useAllPicks(pickEmWeek?.id, {
    enabled: shown
  });

  const summary = useMemo(() => summarizePickSplit(list, picks), [list, picks]);

  return { shown, summary, isLoading, isError };
}

/**
 * The winner's mark: a green W, as a scoreboard would print it. One component
 * for the box and for the explainer that names it, so the two cannot drift.
 */
export function WinnerMark({ className }) {
  return (
    <span
      aria-hidden="true"
      className={cn(badgeVariants({ variant: 'success' }), 'px-1.5 font-semibold', className)}
    >
      W
    </span>
  );
}

/**
 * The explainer, as a small box inside the page's header card — directly
 * above the boxes it describes. Renders whenever they do, including while the
 * picks load, when it simply leaves out the count.
 *
 * @param {object} props
 * @param {object|null} props.pickEmWeek
 * @param {Array<object>} props.games - the week's games
 * @param {boolean} props.closed - the week's pick'em window has closed
 */
export function LeaguePickSplitNote({ pickEmWeek, games, closed, className }) {
  const { shown, summary, isLoading, isError } = useLeaguePickSplit({ pickEmWeek, games, closed });

  if (!shown) return null;

  const { submitted } = summary;
  const counted = !isLoading && !isError;
  const nobody = counted && submitted === 0;
  const scored = summary.matchups.every((matchup) => matchup.decided);

  let body;
  if (nobody) {
    body = 'Picks are locked, and nobody submitted any this week.';
  } else if (counted) {
    body =
      `Picks are locked, and ${submitted} ${submitted === 1 ? 'member' : 'members'} submitted. ` +
      'Each box below shows the percentage of those submissions that picked that team to win.';
  } else {
    body =
      'Picks are locked. Each box below shows the percentage of this week’s submissions ' +
      'that picked that team to win.';
  }

  return (
    <div className={cn('rounded-lg border border-border bg-muted/20 p-3 text-[13px]', className)}>
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Users className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        How the league picked
      </p>
      <p className="mt-1.5 text-muted-foreground">{body}</p>
      {!nobody && (
        <p className="mt-1.5 text-muted-foreground">
          {scored ? '' : 'Once the week is scored, '}
          <WinnerMark className="mx-0.5 align-baseline" />
          <span className="sr-only">{scored ? 'A W' : 'a W'}</span> marks each matchup’s winner.
        </p>
      )}
    </div>
  );
}

/**
 * The boxes themselves: one per team, two rows of seven, each column one
 * matchup — team 1 on top, team 2 beneath, so a team's opponent is the box
 * under or over it and every column's shares add up to 100.
 *
 * The list stays in matchup order (team 1, team 2, next matchup…), which is
 * the order a screen reader gets, and `grid-flow-col` with two rows is what
 * pours that order down the columns rather than across the rows.
 *
 * From `lg` the seven columns share the width equally; below it each keeps a
 * readable minimum and the grid scrolls in its own container, both rows
 * together, with ScrollHint saying so. Stacking the columns instead would put
 * over a thousand pixels of boxes between a phone's week card and its parlay.
 *
 * @param {object} props
 * @param {object|null} props.pickEmWeek
 * @param {Array<object>} props.games - the week's games; byes are skipped
 * @param {boolean} props.closed - the week's pick'em window has closed
 * @param {number} props.week
 */
export default function LeaguePickSplit({ pickEmWeek, games, closed, week }) {
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const { shown, summary, isLoading, isError } = useLeaguePickSplit({ pickEmWeek, games, closed });

  if (!shown) return null;

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Could not load how the league picked this week.</AlertDescription>
      </Alert>
    );
  }

  // Nobody submitted. The note above says so in a sentence, and fourteen boxes
  // of em dashes would only say it fourteen more times.
  if (!isLoading && summary.submitted === 0) return null;

  const viewer = { user, isAdmin, teamOwnerNames };

  return (
    <ScrollHint snap>
      <ul
        aria-label={`How the league picked week ${week}`}
        aria-busy={isLoading || undefined}
        // `pb-1` keeps the cards' drop shadow inside the scroller, which clips
        // on both axes once it scrolls on one. The rows sit a little closer
        // than the columns, so the two boxes of a matchup read as a pair.
        className="grid grid-flow-col grid-rows-2 auto-cols-[minmax(8.5rem,1fr)] gap-x-3 gap-y-2 pb-1 lg:auto-cols-[minmax(0,1fr)]"
      >
        {summary.matchups.flatMap((matchup) =>
          matchup.sides.map((side, index) => (
            <li key={`${matchup.gameId}:${index}`} className="snap-start">
              {isLoading ? <TeamBoxSkeleton /> : <TeamBox side={side} viewer={viewer} />}
            </li>
          ))
        )}
      </ul>
    </ScrollHint>
  );
}

/**
 * One team and its share, stacked and centred: the mark, the team, the owner,
 * then the number.
 *
 * The name keeps a two-line slot whatever its length, so every box's figures
 * sit on one line across the row. The side with fewer picks is muted rather
 * than the leader coloured: which team the league backed is a matter of
 * weight, and the share has no good or bad direction to colour. The W is the
 * one thing here that is a result, so it is the one thing in a status colour.
 */
const TeamBox = ({ side, viewer }) => {
  const name = getMaskedTeamName(side.team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames);
  const owner = getMaskedOwnerName(side.team, viewer.user, viewer.isAdmin, viewer.teamOwnerNames);

  return (
    <Card className="relative flex h-full flex-col items-center px-2.5 py-3.5 text-center">
      {side.won && (
        <>
          <WinnerMark className="absolute right-2 top-2" />
          <span className="sr-only">Won: </span>
        </>
      )}

      {/* Initials from the masked owner, as Schedule does, so a viewer who
          sees masked names is not handed the owner's initials instead. */}
      <TeamAvatar team={{ ...side.team, name, ownerName: owner }} size="md" />

      <div className="mt-2 flex min-h-[2.5em] w-full items-center justify-center text-sm leading-tight">
        <span className="line-clamp-2 break-words font-semibold text-foreground">{name}</span>
      </div>
      <span className="mt-0.5 w-full truncate text-xs text-muted-foreground" title={owner}>
        {owner}
      </span>

      <NumberText
        variant="percent"
        value={side.share}
        display
        className={cn(
          'mt-2 text-[26px] leading-none',
          side.share === null || side.trails ? 'text-muted-foreground' : 'text-foreground'
        )}
      />
      <span className="sr-only"> of picks</span>
    </Card>
  );
};

/**
 * The same box with bars where the words go. Built from the same slots — each
 * bar is its line's own type size around a non-breaking space — so it is the
 * real box's height by construction and the grid does not jump when the picks
 * arrive.
 */
const TeamBoxSkeleton = () => (
  <Card aria-hidden="true" className="flex h-full animate-pulse flex-col items-center px-2.5 py-3.5">
    <span className="h-9 w-9 rounded-full bg-muted" />
    <div className="mt-2 flex min-h-[2.5em] w-full items-center justify-center text-sm leading-tight">
      <span className="w-3/4 rounded bg-muted">&nbsp;</span>
    </div>
    <span className="mt-0.5 w-1/2 rounded bg-muted text-xs">&nbsp;</span>
    <span className="mt-2 w-12 rounded bg-muted text-[26px] leading-none">&nbsp;</span>
  </Card>
);
