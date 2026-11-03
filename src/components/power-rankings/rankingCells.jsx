import { ChevronDown, ChevronUp } from 'lucide-react';

import { NumberText } from '../ui/number-text';
import { cn } from '../../lib/utils';

/**
 * Rank and the week's move in 48px. `RankBadge`'s circle plus its delta is
 * wider than the column a 375px row can spare, so this is the same two facts
 * — the number, and an up/down arrow coloured by direction — set inline.
 */
export function RankCell({ rank, delta }) {
  const move = Number(delta);
  const moved = delta != null && Number.isFinite(move) && move !== 0;
  return (
    <span className="flex items-center gap-0.5 font-semibold tabular">
      {rank}
      {moved && (
        <span
          className={cn('inline-flex items-center text-[10px] font-medium', move > 0 ? 'text-success' : 'text-destructive')}
          title={`${Math.abs(move)} ${Math.abs(move) === 1 ? 'place' : 'places'} ${move > 0 ? 'up' : 'down'} from last week`}
        >
          {move > 0 ? <ChevronUp className="h-3 w-3" aria-hidden="true" /> : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
          <span className="sr-only">{move > 0 ? 'up' : 'down'}</span>
          {Math.abs(move)}
        </span>
      )}
    </span>
  );
}

/**
 * Playoff odds, whole percent. The calculator reads 100 only when clinched
 * and 0 only when eliminated, so those two are words.
 */
export function OddsCell({ odds }) {
  if (odds === null || odds === undefined || odds === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  const value = Number(odds);
  if (value >= 100) return <span className="font-medium text-success">Clinched</span>;
  if (value <= 0) return <span className="text-muted-foreground">Out</span>;
  return <NumberText value={value} variant="percent" decimals={0} />;
}
