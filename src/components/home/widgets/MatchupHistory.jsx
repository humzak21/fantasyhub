import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../../lib/utils';
import { formatScore } from '../../../utils/format';
import { useMatchupHistory } from '../../../../hooks/queries/index.js';
import { summarizeMatchup } from '../../history/headtohead/matchupSummary';
import { describeSeries, meetingResult } from '../../../../utils/home/matchup.js';

const RESULT_TONE = {
  W: 'text-success',
  L: 'text-destructive',
  T: 'text-muted-foreground'
};

/**
 * The viewer's all-time series against this week's opponent.
 *
 * Reads `useMatchupHistory` — the same cache entry History's head-to-head
 * detail reads — with the viewer's franchise first, so every row is oriented
 * with the viewer as team 1 and `summarizeMatchup`'s `sides[0]` is them. The
 * sentences come from `describeSeries`; this only lays them out.
 */
export function MatchupHistory({ viewerFranchiseId, opponentFranchiseId }) {
  const { data: meetings, isPending, isError, refetch } = useMatchupHistory(
    viewerFranchiseId,
    opponentFranchiseId
  );

  const summary = useMemo(() => summarizeMatchup(meetings ?? []), [meetings]);
  const series = useMemo(() => describeSeries(summary), [summary]);

  if (!viewerFranchiseId || !opponentFranchiseId) {
    return <p className="text-sm text-muted-foreground">No franchise history to compare.</p>;
  }

  if (isPending) {
    return (
      <div role="status" aria-label="Loading series history" className="space-y-2.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <div className="flex gap-2" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 flex-1" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Couldn&apos;t load the series.{' '}
        <button type="button" onClick={() => refetch()} className="font-medium text-foreground underline underline-offset-2">
          Retry
        </button>
      </p>
    );
  }

  if (!series) {
    return <p className="text-sm text-muted-foreground">This is your first meeting.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-[15px] font-semibold leading-snug">{series.headline}</p>
        {series.phases.length > 1 && (
          <p className="text-[13px] text-muted-foreground tabular">
            {series.phases.map((phase) => `${phase.label} ${phase.record}`).join(' · ')}
          </p>
        )}
        {series.streak && <p className="text-[13px] text-muted-foreground">{series.streak}</p>}
      </div>

      <div>
        <h4 className="mb-2 text-[13px] font-medium text-muted-foreground">Last meetings</h4>
        {/* Newest first. A wrapping list, never a sideways scroller: five
            chips fit two-up at 375px and the reader keeps every one. */}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {summary.recent.map((game) => {
            const result = meetingResult(game);
            return (
              <li
                key={`${game.year}-${game.week}`}
                className="rounded-lg border border-border bg-muted/30 px-2.5 py-2"
              >
                <p className="flex items-baseline gap-1.5 text-[13px] tabular">
                  <span className={cn('font-semibold', RESULT_TONE[result])}>{result}</span>
                  <span className="truncate">
                    {formatScore(game.team1Score)}–{formatScore(game.team2Score)}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground tabular">
                  Wk {game.week} · {game.year}
                </p>
              </li>
            );
          })}
        </ol>
      </div>

      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        {summary.highestCombined && (
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">Highest-scoring</dt>
            <dd className="tabular">
              {formatScore(summary.highestCombined.value)} combined · Wk {summary.highestCombined.game.week},{' '}
              {summary.highestCombined.game.year}
            </dd>
          </div>
        )}
        {summary.closest && (
          <div className="flex flex-wrap gap-x-1.5">
            <dt className="text-muted-foreground">Closest</dt>
            <dd className="tabular">
              {formatScore(summary.closest.value)} · Wk {summary.closest.game.week}, {summary.closest.game.year}
            </dd>
          </div>
        )}
      </dl>

      <Link
        to="/history"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
      >
        Full history
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

export default MatchupHistory;
