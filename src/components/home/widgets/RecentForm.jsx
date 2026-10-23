import { lazy, Suspense, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';

import HomeWidget from '../HomeWidget';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../../lib/utils';
import { formatDelta, formatOrdinal, formatPoints } from '../../../utils/format';
import { getMaskedTeamName } from '../../../utils/displayNameUtils';
import { useViewer } from '../../../contexts/ViewerContext.jsx';
import { useRankingsHistory } from '../../../../hooks/queries/index.js';
import { buildLightSeasonIndex, recentForm } from '../../../../utils/home/recentForm.js';
import { franchiseIdOf } from '../../../../utils/viewerTeam.js';

// The page's only recharts consumer, so the chart alone is a chunk of its own.
const RecentFormChart = lazy(() => import('./RecentFormChart.jsx'));

const RESULT_TONE = { W: 'text-success', L: 'text-destructive', T: 'text-muted-foreground' };
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * The viewer's last three scored weeks: each game, a small chart of points
 * for against the league average, and how the standing and the power rank
 * moved — `recentForm` over a light season index built from what the shell
 * already holds, plus the rank snapshots (shared with Statistics).
 *
 * Tapping a game opens the Schedule on that week.
 */
export default function RecentForm({ ctx }) {
  const { seasonId, season, actualWeek, viewerTeam, openWeek } = ctx;
  const { user, isAdmin, teamOwnerNames } = useViewer();
  const ranksQuery = useRankingsHistory(seasonId);

  const form = useMemo(() => {
    const index = buildLightSeasonIndex(season, season?.teams ?? [], season?.schedule ?? [], ranksQuery.data ?? []);
    return recentForm(index, franchiseIdOf(viewerTeam), actualWeek);
  }, [season, ranksQuery.data, viewerTeam, actualWeek]);

  const teamName = (teamId) => {
    const team = season?.teams?.find((t) => sameId(t.id, teamId));
    return team ? getMaskedTeamName(team, user, isAdmin, teamOwnerNames) : 'Unknown team';
  };

  return (
    <HomeWidget
      id="recent-form"
      icon={TrendingUp}
      title={form?.rows.length === 1 ? 'Last week' : `Last ${form?.rows.length ?? 3} weeks`}
      loading={ranksQuery.isPending}
      skeleton={<FormSkeleton />}
      empty={!form && <p className="text-sm text-muted-foreground">No games played yet.</p>}
    >
      {form && (
        <div className="space-y-4">
          <ol className="divide-y divide-border/60">
            {[...form.rows].reverse().map((row) => (
              <li key={row.week}>
                <Link
                  to="/schedule"
                  onClick={() => openWeek?.(row.week)}
                  className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 text-sm transition-colors hover:bg-accent/40"
                >
                  <span className={cn('w-4 shrink-0 font-semibold', RESULT_TONE[row.result])}>{row.result}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">vs {teamName(row.opponentId)}</span>
                    <span className="block text-xs text-muted-foreground tabular">Week {row.week}</span>
                  </span>
                  <span className="shrink-0 text-right tabular">
                    <span className="block">
                      {formatPoints(row.pointsFor)}–{formatPoints(row.pointsAgainst)}
                    </span>
                    <span className={cn('block text-xs', RESULT_TONE[row.result])}>
                      {formatDelta(row.margin)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <Suspense fallback={<Skeleton className="h-[120px] w-full" />}>
            <RecentFormChart rows={form.rows} team={viewerTeam} />
          </Suspense>

          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Movement label="Standing" span={form.standing} format={formatOrdinal} />
            <Movement label="Power" span={form.powerRank} format={(n) => `#${n}`} />
          </dl>
        </div>
      )}
    </HomeWidget>
  );
}

/**
 * "Standing 6th → 4th", coloured by direction: a smaller number is a climb.
 * Absent when there is nothing to compare (no snapshots before 2025).
 */
function Movement({ label, span, format }) {
  if (span.from == null || span.to == null) return null;
  const climbed = span.to < span.from;
  const fell = span.to > span.from;
  const Icon = climbed ? TrendingUp : fell ? TrendingDown : ArrowRight;
  return (
    <div className="flex items-center gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 tabular">
        {format(span.from)}
        <ArrowRight className="h-3 w-3 text-muted-foreground" aria-label="to" />
        <span className={cn('font-semibold', climbed && 'text-success', fell && 'text-destructive')}>
          {format(span.to)}
        </span>
        {(climbed || fell) && (
          <Icon
            className={cn('h-3.5 w-3.5', climbed ? 'text-success' : 'text-destructive')}
            aria-label={climbed ? 'up' : 'down'}
          />
        )}
      </dd>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div role="status" aria-label="Loading recent form" className="space-y-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
      <Skeleton className="h-[120px] w-full" />
    </div>
  );
}
