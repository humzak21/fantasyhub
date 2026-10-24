import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Flame } from 'lucide-react';

import { Badge } from '../../ui/badge';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../../lib/utils';
import { formatScore } from '../../../utils/format';
import { useMatchupHistory } from '../../../../hooks/queries/index.js';
import { phaseOf, summarizeMatchup } from '../../history/headtohead/matchupSummary';
import { describeSeries, meetingResult } from '../../../../utils/home/matchup.js';

const RESULT = {
  W: { label: 'W', tone: 'bg-success/15 text-success ring-success/30' },
  L: { label: 'L', tone: 'bg-destructive/15 text-destructive ring-destructive/30' },
  T: { label: 'T', tone: 'bg-muted text-muted-foreground ring-border' }
};

const STANDING_LABEL = { lead: 'You lead', trail: 'You trail', level: 'Level' };
const PHASE_LABEL = { playoff: 'Playoffs', consolation: 'Consolation' };

/**
 * The viewer's all-time series against this week's opponent.
 *
 * Reads `useMatchupHistory` — the same cache entry History's head-to-head
 * detail reads — with the viewer's franchise first, so every row is oriented
 * with the viewer as team 1 and `summarizeMatchup`'s `sides[0]` is them. The
 * sentences come from `describeSeries`; this only lays them out.
 *
 * Two columns from `lg`: the series on the left (the record, set large, its
 * split by phase, the streak, the two games worth remembering), the meetings
 * on the right, newest first and one per row with the season leading — the
 * year is what a reader scans for. "Full history" opens the same pairing on
 * History → Head-to-Head (`historyHref`, by franchise id).
 */
export function MatchupHistory({ viewerFranchiseId, opponentFranchiseId, historyHref = null }) {
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
      <div role="status" aria-label="Loading series history" className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="space-y-2.5" aria-hidden="true">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-16 w-full" />
        </div>
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8">
      <section aria-label="Series" className="space-y-4">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground">All-time series</p>
          <p className="mt-1 flex items-baseline gap-3">
            <span className="font-display text-[44px] font-semibold leading-none tracking-[-0.01em] tabular">
              {series.record}
            </span>
            <span
              className={cn(
                'text-sm font-medium',
                series.standing === 'lead' && 'text-success',
                series.standing === 'trail' && 'text-destructive',
                series.standing === 'level' && 'text-muted-foreground'
              )}
            >
              {STANDING_LABEL[series.standing]}
            </span>
          </p>
          {series.streak && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
              <Flame className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
              {series.streak}
            </p>
          )}
        </div>

        {series.phases.length > 1 && (
          <dl className="divide-y divide-border/60 rounded-lg border border-border/60 text-sm">
            {series.phases.map((phase) => (
              <div key={phase.label} className="flex items-center justify-between px-3 py-2">
                <dt className="text-muted-foreground">{phase.label}</dt>
                <dd className="font-medium tabular">{phase.record}</dd>
              </div>
            ))}
          </dl>
        )}

        <dl className="grid grid-cols-2 gap-2">
          {summary.highestCombined && (
            <Notable
              label="Highest-scoring"
              value={formatScore(summary.highestCombined.value)}
              game={summary.highestCombined.game}
            />
          )}
          {summary.closest && (
            <Notable label="Closest" value={formatScore(summary.closest.value)} game={summary.closest.game} />
          )}
        </dl>
      </section>

      <section aria-labelledby="home-meetings-title" className="min-w-0">
        <h4 id="home-meetings-title" className="mb-1.5 text-[13px] font-medium text-muted-foreground">
          Last meetings
        </h4>
        <ol className="divide-y divide-border/60">
          {summary.recent.map((game) => {
            const result = RESULT[meetingResult(game)];
            const phase = phaseOf(game);
            return (
              <li key={`${game.year}-${game.week}`} className="flex min-h-12 items-center gap-3 py-1.5">
                <span className="w-14 shrink-0">
                  <span className="block font-display text-xl font-semibold leading-none tabular">{game.year}</span>
                  <span className="block text-[11px] text-muted-foreground tabular">Week {game.week}</span>
                </span>
                <span
                  className={cn(
                    'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold ring-1 ring-inset',
                    result.tone
                  )}
                  aria-label={result.label === 'W' ? 'Win' : result.label === 'L' ? 'Loss' : 'Tie'}
                >
                  {result.label}
                </span>
                {PHASE_LABEL[phase] && (
                  <Badge variant="outline" className="hidden shrink-0 px-1.5 py-0 text-[10px] sm:inline-flex">
                    {PHASE_LABEL[phase]}
                  </Badge>
                )}
                <span className="ml-auto shrink-0 text-right text-sm tabular">
                  <span className="font-semibold">{formatScore(game.team1Score)}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    – {formatScore(game.team2Score)}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        {historyHref && (
          <Link
            to={historyHref}
            className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
          >
            Full head-to-head
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </section>
    </div>
  );
}

/** A game worth remembering: its figure, and when. */
function Notable({ label, value, game }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span className="block font-display text-lg font-semibold leading-none tabular">{value}</span>
        <span className="mt-1 block text-[11px] text-muted-foreground tabular">
          <span className="font-medium text-foreground">{game.year}</span> · Week {game.week}
        </span>
      </dd>
    </div>
  );
}

export default MatchupHistory;
