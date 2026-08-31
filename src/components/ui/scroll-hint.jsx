import * as React from 'react'

import { cn } from '../../lib/utils'

/**
 * A horizontal scroller that says so.
 *
 * Some content has no sane narrow form — an N×N head-to-head matrix, a playoff
 * bracket, a 15-week strip of chips. For those the honest answer is to let the
 * content be wide and let the *container* scroll, which is different in kind
 * from the root `overflow-x: hidden` this codebase used to rely on: that hid
 * the overflow and left the content unreachable.
 *
 * The hint underneath is the part people forget. A scroller with no visible
 * scrollbar — which is every scroller on iOS until you touch it — looks
 * exactly like a clipped element. The pattern is lifted from
 * ExpandedWeekModal, which got this right first.
 *
 * @param {boolean} snap        scroll-snap children to their start edge.
 * @param {string}  hint        the line shown below on touch screens.
 * @param {string}  desktopHint the line shown when a mouse is present.
 */
export const ScrollHint = React.forwardRef(function ScrollHint(
  {
    children,
    className,
    contentClassName,
    snap = false,
    hint = 'Swipe to see more',
    desktopHint = 'Scroll horizontally to see more',
    ...props
  },
  ref
) {
  const viewportRef = React.useRef(null)
  const [isScrollable, setIsScrollable] = React.useState(false)

  // Only claim there is more to see when there actually is. A hint under
  // content that already fits is noise, and it is the reason a generic
  // "scroll for more" caption gets ignored everywhere it appears.
  React.useEffect(() => {
    const el = viewportRef.current
    if (!el || typeof ResizeObserver === 'undefined') return

    const measure = () => setIsScrollable(el.scrollWidth > el.clientWidth + 1)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    return () => observer.disconnect()
  }, [children])

  return (
    <div ref={ref} className={cn('min-w-0', className)} {...props}>
      <div
        ref={viewportRef}
        className={cn(
          'overflow-x-auto overscroll-x-contain scrollbar-mobile mobile-scroll',
          snap && 'snap-x snap-mandatory',
          contentClassName
        )}
      >
        {children}
      </div>

      {isScrollable && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          <span className="sm:hidden">{hint}</span>
          <span className="hidden sm:inline">{desktopHint}</span>
        </p>
      )}
    </div>
  )
})

export default ScrollHint
