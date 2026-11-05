import { Skeleton } from '../../ui/skeleton.jsx';
import { cn } from '../../../lib/utils';
import { EMPTY, formatFraction, formatPoints } from '../../../utils/format';
import { SURFACE, rankLine, yearSpan } from './sectionFormat.js';

function Tile({ label, figure, footer, testId }) {
  return (
    <div data-testid={testId} className={cn('min-w-0 rounded-xl border border-border bg-card p-3', SURFACE)}>
      <div className="truncate text-[13px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-display text-2xl leading-tight tracking-[-0.01em] text-foreground tabular">{figure}</div>
      <div className="mt-0.5 min-h-4 truncate text-xs text-muted-foreground tabular">{footer}</div>
    </div>
  );
}

/**
 * Six headline figures over his whole league career. The season bar below
 * them narrows the sections, not these.
 */
export default function HeadlineTiles({ profile, ranking, rankingQuery }) {
  const career = profile.career ?? {};
  const entry = ranking?.byPlayerId?.[profile.player.id] ?? null;
  const loadingRank = !ranking && (rankingQuery?.isLoading || rankingQuery?.isPending) && !rankingQuery?.isError;
  const ppg = entry?.pointsPerGame ?? career.pointsPerGame ?? null;
  const best = career.best ?? null;

  return (
    <div className="grid grid-cols-2 gap-2 @md:grid-cols-3 @md:gap-3 @3xl:grid-cols-6">
      <Tile
        testId="tile-ppg"
        label="OG Jits PPG"
        figure={formatPoints(ppg)}
        footer={loadingRank
          ? <Skeleton className="mt-1 h-3 w-20" />
          : rankLine({ entry, ranking, rankingQuery, gamesPlayed: career.gamesPlayed })}
      />
      <Tile
        label="League start %"
        figure={formatFraction(career.startPct, 0)}
        footer={career.weeksRostered ? `Started ${career.weeksStarted} of ${career.weeksRostered} weeks` : null}
      />
      <Tile
        label="Games played"
        figure={career.gamesPlayed ?? EMPTY}
        footer={career.weeksRostered ? `of ${career.weeksRostered} weeks rostered` : null}
      />
      <Tile
        label="Total points"
        figure={formatPoints(career.totalPoints)}
        footer={career.startedPoints != null ? `${formatPoints(career.startedPoints)} as a starter` : null}
      />
      <Tile
        label="Best week"
        figure={formatPoints(best?.actualPoints)}
        footer={best ? `${best.year} · ${best.label}` : null}
      />
      <Tile
        label="Seasons"
        figure={career.seasonsPlayed ?? EMPTY}
        footer={yearSpan(career.firstYear, career.lastYear)}
      />
    </div>
  );
}
