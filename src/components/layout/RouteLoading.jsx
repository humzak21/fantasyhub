import { cn } from '../../lib/utils';

/**
 * What a route shows while its chunk is in flight.
 *
 * This replaces a `SkeletonTable` used as the fallback for *every* tab. A
 * skeleton is the right idea when it stands in for a shape the page is
 * actually about to render — the rankings table uses one, correctly, and the
 * layout does not jump when the data lands. As a route-level fallback it was
 * the wrong shape everywhere: History, Statistics, Playoffs and Pick'ems are
 * not tables, so an eight-row, six-column grid of pale bars flashed up and
 * then vanished, reading as a handful of odd boxes rather than as loading.
 *
 * A chunk fetch is short and its result is unpredictable, so the honest
 * placeholder is a quiet one that claims nothing about what is coming. The
 * height is reserved so the footer and the tab bar do not jump when the page
 * arrives.
 */
export function RouteLoading({ className }) {
  return (
    <div
      role="status"
      aria-live="polite"
      // Named, not just live. A bare `role="status"` takes its accessible name
      // from aria-label — not from its contents — so without this it is an
      // anonymous region: announced on change, but impossible to refer to.
      aria-label="Loading"
      className={cn('flex min-h-[45dvh] items-center justify-center', className)}
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-muted-foreground"
      />
      <span className="sr-only">Loading</span>
    </div>
  );
}

export default RouteLoading;
