import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Columns that do not push each other around.
 *
 * A CSS grid lays out *rows*. Every cell in a row is as tall as the tallest
 * one, and the next row cannot begin until that row ends — so a card that
 * grows (a matchup expanding to show both lineups) drags everything below it
 * down, and leaves a stretch of dead space beside it. `items-start` stops the
 * short cell being *stretched*, but it cannot stop the row from growing; that
 * is what a row is.
 *
 * This splits the items into real column elements, each an ordinary block
 * flow. Expanding a card now moves only the cards beneath it *in its own
 * column*.
 *
 * Two details that matter:
 *
 *   - The split is by half, not alternating. Below the breakpoint the column
 *     wrappers are `display: contents`, so the items flow back into the parent
 *     in DOM order — with a halved split that is 1, 2, 3…, which is the right
 *     reading order on a phone. Alternating would give 1, 3, 5, 2, 4.
 *   - The assignment is fixed by index, so nothing ever changes column. CSS
 *     multi-column would do the layout in one line, but it *balances*: a card
 *     growing can shuffle other cards between columns under the reader's
 *     cursor, which is worse than the problem being solved.
 *
 * @param {any[]} items
 * @param {(item: any, index: number) => React.ReactNode} children - render one item
 * @param {(item: any, index: number) => React.Key} itemKey
 * @param {number} [columns=2] - column count above the breakpoint
 */
export function IndependentColumns({
  items = [],
  children,
  itemKey = (_item, i) => i,
  columns = 2,
  className,
  columnClassName,
}) {
  const buckets = React.useMemo(() => {
    const perColumn = Math.ceil(items.length / columns) || 1;
    return Array.from({ length: columns }, (_, c) =>
      items.slice(c * perColumn, (c + 1) * perColumn).map((item, i) => ({
        item,
        index: c * perColumn + i,
      }))
    ).filter((bucket) => bucket.length > 0);
  }, [items, columns]);

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-5',
        columns === 3 ? 'md:grid-cols-2 xl:grid-cols-3' : 'lg:grid-cols-2',
        className
      )}
    >
      {buckets.map((bucket, c) => (
        <div
          key={c}
          className={cn(
            // `contents` below the breakpoint: the wrapper disappears from
            // layout so the parent grid lays the items out itself, in order.
            'contents',
            columns === 3 ? 'md:flex md:flex-col md:gap-5' : 'lg:flex lg:flex-col lg:gap-5',
            columnClassName
          )}
        >
          {bucket.map(({ item, index }) => (
            <React.Fragment key={itemKey(item, index)}>{children(item, index)}</React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

export default IndependentColumns;
