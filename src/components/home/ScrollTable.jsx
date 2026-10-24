import { forwardRef, useImperativeHandle, useRef } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '../../lib/utils';
import { useScrollEdges } from '../../hooks/use-scroll-edges.js';

/**
 * A table that is wider than its card, on purpose.
 *
 * The home page's standings and rankings show the columns a reader wants
 * first and keep the rest one swipe to the right. The rank column is
 * `sticky`, so every row keeps its place in the table as it scrolls; the team
 * scrolls with its figures. The header is sticky too, for a table that also
 * scrolls vertically. A desktop gets a thin
 * scrollbar; touch gets its native one.
 *
 * The viewport is an `@container`, so a column can be sized with `cqw` —
 * "whatever the card has left" — which is how the default view lands exactly
 * on the columns it should, at any card width. While there is more to the
 * right a chevron sits at the top edge (`useScrollEdges`, as the nav's): a
 * scroller whose next column starts flush with the card edge reads as a table
 * that ends. It is a mouse affordance, hidden from assistive technology —
 * the table itself is reachable by keyboard (`tabIndex`) and scrolls with the
 * arrow keys.
 *
 * Not `ui/scroll-hint.jsx`: that prints a caption under content that happens
 * to overflow. Here the overflow is the design, on every table, and a caption
 * under each would be noise.
 */
export const ScrollTable = forwardRef(function ScrollTable(
  { label, className, viewportClassName, children },
  ref
) {
  const viewportRef = useRef(null);
  useImperativeHandle(ref, () => viewportRef.current, []);
  const edges = useScrollEdges(viewportRef);

  const scrollRight = () => {
    const el = viewportRef.current;
    if (el) el.scrollBy({ left: el.clientWidth * 0.6, behavior: 'smooth' });
  };

  return (
    <div className={cn('relative min-w-0', className)}>
      <div
        ref={viewportRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className={cn(
          '@container overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          '[scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]',
          viewportClassName
        )}
      >
        {children}
      </div>

      {edges.end && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={scrollRight}
          className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-popover/95 text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/0.4)] transition-colors hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

export default ScrollTable;
