import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Loading placeholders in the shape of what is coming.
 *
 * CLAUDE.md documented this file for months before it existed: `RouteLoading`
 * replaced the route-level use and the primitive was never written, so every
 * component that wanted a skeleton hand-rolled its own pulsing bars. These
 * three are the shared vocabulary — a bar, a table, a row of cards — and the
 * rule they exist for is the one in the docs: loading is a skeleton, never
 * `return null` (a blank region) and never a bare spinner where the shape is
 * known.
 *
 * Every placeholder is `aria-hidden`; the wrapper carries one `role="status"`
 * with a name, so a screen reader hears "Loading" once rather than a pulse
 * per bar.
 */

const Skeleton = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    aria-hidden="true"
    className={cn('animate-pulse rounded-md bg-muted', className)}
    {...props}
  />
));
Skeleton.displayName = 'Skeleton';

/**
 * A table's worth of bars: `rows` rows of `columns` cells. The first column is
 * the widest because it is nearly always the name.
 */
const SkeletonTable = React.forwardRef(
  ({ rows = 5, columns = 4, label = 'Loading', className, ...props }, ref) => (
    <div ref={ref} role="status" aria-label={label} className={cn('space-y-2.5', className)} {...props}>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex h-8 items-center gap-3" aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <Skeleton
              key={column}
              className={cn('h-3.5', column === 0 ? 'flex-[3]' : 'flex-1')}
            />
          ))}
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
);
SkeletonTable.displayName = 'SkeletonTable';

/** `count` card-shaped blocks in a responsive row. */
const SkeletonCards = React.forwardRef(
  ({ count = 3, label = 'Loading', className, cardClassName, ...props }, ref) => (
    <div
      ref={ref}
      role="status"
      aria-label={label}
      className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}
      {...props}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={cn('space-y-3 rounded-xl border border-border bg-card p-4', cardClassName)}
        >
          <Skeleton className="h-3.5 w-2/5" />
          <Skeleton className="h-7 w-3/5" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
);
SkeletonCards.displayName = 'SkeletonCards';

export { Skeleton, SkeletonTable, SkeletonCards };
