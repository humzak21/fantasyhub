import { cn } from "../../lib/utils"

/**
 * A block that occupies the space its content will occupy.
 *
 * Prefer this over a centred spinner for anything with a known shape: the
 * layout does not jump when the data lands, which on a phone is the difference
 * between a page settling and a page flickering.
 */
function Skeleton({ className, ...props }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />
}

/**
 * The loading shape for a table, matching what `ResponsiveDataTable` renders:
 * a card stack below `md`, rows above it. Sized from the same `rows`/`columns`
 * the real table will use, so the page does not resize when data lands.
 *
 * Four loading idioms coexisted before this — a centred spinner, a bare
 * `return null` that left the whole tab blank, hand-rolled pulse divs in one
 * drawer, and a fixed toast in the corner of the history tab. Two of those
 * tell the reader nothing about what is arriving.
 */
function SkeletonTable({ rows = 6, columns = 5, className, ...props }) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-label="Loading" {...props}>
      {/* Card stack — phones and landscape phones. */}
      <div className="space-y-2 md:hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-6 w-14" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
              {Array.from({ length: 4 }).map((__, j) => (
                <Skeleton key={j} className="h-3 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Real table. */}
      <div className="hidden rounded-lg border md:block">
        <div className="flex items-center gap-4 border-b px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className={cn('h-3', i === 0 ? 'w-24' : 'flex-1')} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
            {Array.from({ length: columns }).map((__, j) => (
              <Skeleton key={j} className={cn('h-4', j === 0 ? 'w-24' : 'flex-1')} />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  )
}

export { Skeleton, SkeletonTable }
