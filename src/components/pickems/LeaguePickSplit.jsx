import { useMemo } from 'react';
import { AlertCircle, Users } from 'lucide-react';

import { Alert, AlertDescription } from '../ui/alert';
import { badgeVariants } from '../ui/badge';
import { cn } from '../../lib/utils';
import { useAllPicks } from '../../../hooks/queries/index.js';
import { isByeGame, summarizePickSplit } from './pickSplit.js';

/**
 * How the league picked this week, once the window has closed.
 *
 * Each matchup card shows its own split (`MatchupPickCard`), on Make Picks from
 * the close and on Results once the week is scored, where the winners are
 * marked. This is the shared read behind those cards, and the explainer for the
 * page's header card. Each page decides `closed`: Make Picks from its own
 * status, Results from `resultsAvailable`.
 *
 * **The wait is the page's, not the database's.** `pick_em_submissions` has
 * been public-read since the baseline, so holding the split back until the
 * window closes hides nothing from somebody reading PostgREST directly. It is
 * there so the split cannot steer anybody's picks while they can still be
 * changed.
 *
 * The cards and the explainer both read the one `qk.pickems.allPicks` cache
 * entry, so that is one request, and it is not issued at all while the window is
 * open.
 */

/** One shared empty array, so the memo below does not see a new one each render. */
const EMPTY = [];

export function useLeaguePickSplit({ pickEmWeek, games, closed }) {
  const list = games ?? EMPTY;
  const hasMatchups = list.some((game) => !isByeGame(game));
  const shown = Boolean(pickEmWeek) && Boolean(closed) && hasMatchups;

  const { data: picks = EMPTY, isLoading, isError } = useAllPicks(pickEmWeek?.id, {
    enabled: shown
  });

  const summary = useMemo(() => summarizePickSplit(list, picks), [list, picks]);
  const byGame = useMemo(
    () => (shown && !isLoading ? new Map(summary.matchups.map((matchup) => [matchup.gameId, matchup])) : null),
    [shown, isLoading, summary]
  );

  return { shown, summary, byGame, isLoading, isError };
}

/**
 * The winner's mark: a green W, as a scoreboard would print it. One component
 * for the card and for the explainer that names it, so the two cannot drift.
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
 * The explainer, as a small box inside the page's header card, above the cards
 * it describes. Renders whenever they show a split, including while the picks
 * load, when it simply leaves out the count.
 *
 * @param {object} props
 * @param {object|null} props.pickEmWeek
 * @param {Array<object>} props.games - the week's games
 * @param {boolean} props.closed - the week's pick'em window has closed
 */
export function LeaguePickSplitNote({ pickEmWeek, games, closed, className }) {
  const { shown, summary, isLoading, isError } = useLeaguePickSplit({ pickEmWeek, games, closed });

  if (!shown) return null;

  if (isError) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Could not load how the league picked this week.</AlertDescription>
      </Alert>
    );
  }

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
      'Each matchup below shows the percentage of those submissions that picked each team to win.';
  } else {
    body =
      'Picks are locked. Each matchup below shows the percentage of this week’s submissions ' +
      'that picked each team to win.';
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
