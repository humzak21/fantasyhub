import * as React from 'react';

/**
 * Which way a horizontal scroller still has content, as booleans.
 *
 * A scroller with no visible scrollbar — which is every scroller on a touch
 * screen until you touch it, and every one in this app, which hides the bar
 * on purpose — is indistinguishable from an element whose content simply
 * ends. That is fine for a bracket, where the clipped edge is obviously mid
 * content; it is not fine for the nav, where the last visible tab looks like
 * the last tab. Whoever renders the affordance needs to know *which* edge has
 * more behind it, so the marker points at something true rather than
 * decorating both sides forever.
 *
 * Measured, never assumed: `{ start: false, end: false }` is the answer for
 * content that fits, so nothing renders. jsdom reports zero for every box, so
 * the same is true there — a test cannot assert on these without stubbing the
 * metrics, which is honest, because a browser is the only thing that knows.
 *
 * @param {React.RefObject<HTMLElement>} ref the scrolling element
 * @param {unknown} [watch] re-measure when this changes — the child count,
 *   usually, since a scroller's own box does not resize when its contents do
 * @returns {{ start: boolean, end: boolean }}
 */
export function useScrollEdges(ref, watch) {
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const measure = () => {
      // A pixel of slack is not "more to see". Fractional layout widths leave
      // a sub-pixel remainder on an element that plainly fits, and a chevron
      // that never goes away is a chevron nobody believes.
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
      const next = { start: el.scrollLeft > 1, end: remaining > 1 };
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    };

    measure();
    el.addEventListener('scroll', measure, { passive: true });

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
      for (const child of el.children) observer.observe(child);
    }

    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [ref, watch]);

  return edges;
}

export default useScrollEdges;
