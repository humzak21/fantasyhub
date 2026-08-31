import * as React from 'react';
import { cn } from '../../lib/utils';
import { parseStreak } from '../../utils/format';

/**
 * `W3` / `L1`, in the status colours.
 *
 * Renders nothing when there is no streak, rather than a dash: an empty cell
 * says "no streak" more quietly than a placeholder does, and this sits in a
 * table row that already has plenty competing for attention.
 *
 * @param {object} props
 * @param {{type?: string, length?: number}} props.streak
 */
const StreakChip = React.forwardRef(({ streak, className, ...props }, ref) => {
  const parsed = parseStreak(streak);
  if (!parsed) return null;

  return (
    <span
      ref={ref}
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-5 tabular',
        parsed.type === 'win' && 'border-success/20 bg-success/10 text-success',
        parsed.type === 'loss' && 'border-destructive/20 bg-destructive/10 text-destructive',
        parsed.type === 'tie' && 'border-border bg-muted text-muted-foreground',
        className
      )}
      {...props}
    >
      {parsed.label}
      <span className="sr-only">
        {' '}
        {parsed.length} game {parsed.type === 'win' ? 'winning' : parsed.type === 'loss' ? 'losing' : 'tied'} streak
      </span>
    </span>
  );
});
StreakChip.displayName = 'StreakChip';

export { StreakChip };
