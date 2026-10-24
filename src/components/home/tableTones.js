/**
 * Class names for the home page's scrolling tables (`ScrollTable`).
 */

/**
 * Row backgrounds that are opaque, because sticky cells inherit them and a
 * translucent tint under a sticky cell lets the scrolled columns show through.
 * Each is the tint mixed over the card colour; literal class names, so
 * Tailwind generates them.
 */
export const ROW_TONE = {
  base: 'bg-card',
  bye: 'bg-[color-mix(in_oklab,var(--warning)_15%,var(--card))]',
  qualifier: 'bg-[color-mix(in_oklab,var(--success)_10%,var(--card))]',
  viewer: 'bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]'
};

/** The viewer's rail: on the first cell, as the shared `ff-viewer-row` does. */
export const VIEWER_RAIL = 'shadow-[inset_3px_0_0_var(--primary)]';

/** A sticky body cell: it carries the row's own (opaque) background, and a
 *  hairline on its right edge, so the columns scrolling under it read as
 *  passing behind the rank rather than running into it. */
export const STICKY_CELL = 'sticky z-[1] bg-inherit border-r border-border/50';

/** A sticky header cell, over the scrolled cells and the sticky body cells. */
export const STICKY_HEAD = 'sticky top-0 z-[2] bg-card';
