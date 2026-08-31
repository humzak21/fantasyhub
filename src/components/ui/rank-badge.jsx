import * as React from 'react';
import { ChevronDown, ChevronUp, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * A rank, and which way it is moving.
 *
 * The badge this replaces carried six colour tiers, 2-3px borders, and — for
 * the top three — an icon *plus* a satellite number bubble pinned to its
 * corner, so a 40px medallion competed with the team name for the eye at card
 * width. Rank is an ordinal: the number is the content, and the only thing
 * worth encoding beyond it is the podium.
 *
 * `delta` is places gained since the previous week, so positive means the team
 * moved *up* the table.
 */
const SIZES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-11 w-11 text-base',
};

/** Podium tints. These are the ff-rank ramps, which are actual metals now. */
function podiumClasses(rank) {
  switch (rank) {
    case 1:
      return 'bg-ff-rank-gold-500/15 text-ff-rank-gold-400 ring-1 ring-ff-rank-gold-500/40';
    case 2:
      return 'bg-ff-rank-silver-400/15 text-ff-rank-silver-300 ring-1 ring-ff-rank-silver-400/40';
    case 3:
      return 'bg-ff-rank-bronze-500/15 text-ff-rank-bronze-400 ring-1 ring-ff-rank-bronze-500/40';
    default:
      return 'bg-muted text-muted-foreground ring-1 ring-border';
  }
}

const RankBadge = React.forwardRef(
  ({ rank, delta = null, size = 'md', showDelta = true, className, ...props }, ref) => {
    const hasDelta = showDelta && delta !== null && delta !== undefined && !Number.isNaN(Number(delta));
    const move = hasDelta ? Number(delta) : 0;

    return (
      <div ref={ref} className={cn('flex items-center gap-1.5', className)} {...props}>
        <span
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tabular',
            SIZES[size] ?? SIZES.md,
            podiumClasses(Number(rank))
          )}
        >
          {rank ?? '—'}
        </span>
        {hasDelta && (
          <span
            className={cn(
              'inline-flex items-center text-[11px] font-medium tabular',
              move > 0 && 'text-success',
              move < 0 && 'text-destructive',
              move === 0 && 'text-muted-foreground'
            )}
            title={
              move === 0
                ? 'No change from last week'
                : `${Math.abs(move)} ${Math.abs(move) === 1 ? 'place' : 'places'} ${move > 0 ? 'up' : 'down'} from last week`
            }
          >
            {move > 0 && <ChevronUp className="h-3 w-3" aria-hidden="true" />}
            {move < 0 && <ChevronDown className="h-3 w-3" aria-hidden="true" />}
            {move === 0 && <Minus className="h-3 w-3" aria-hidden="true" />}
            {move !== 0 && Math.abs(move)}
            <span className="sr-only">
              {move === 0
                ? 'unchanged from last week'
                : `${Math.abs(move)} places ${move > 0 ? 'up' : 'down'} from last week`}
            </span>
          </span>
        )}
      </div>
    );
  }
);
RankBadge.displayName = 'RankBadge';

export { RankBadge };
