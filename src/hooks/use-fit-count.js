import * as React from 'react';

/**
 * How many of a list's optional items fit in the room a box has left.
 *
 * The box is a filler: a `flex-1` region whose height is the slack a stretched
 * card has under its content, and the list sits in it absolutely positioned,
 * so what the list holds never changes the box's height. That is what makes
 * the question answerable — the room is decided by the page (the other column,
 * on the home page), and the list only fills it.
 *
 * The answer is found by trying. Render one more item; if the last item's
 * bottom is past the box's, take it back and stop. Both happen in a layout
 * effect, so the item that did not fit is never painted. A resize of the box
 * (the other column grew, the window changed) starts the probe again, from the
 * count it had.
 *
 * Measured, never assumed: jsdom reports zero for every box, so there the
 * answer is 0 and nothing optional renders. A test that wants more has to stub
 * the metrics.
 *
 * @param {number} max - how many optional items there are to offer
 * @param {unknown} [watch] - re-probe when this changes (the items' ids, say),
 *   since a different item can be a different height
 * @returns {{ count: number, boxRef: React.RefObject<HTMLElement>, listRef: React.RefObject<HTMLElement> }}
 *   `boxRef` on the filler, `listRef` on the element whose children are the
 *   rendered items
 */
export function useFitCount(max, watch) {
  const boxRef = React.useRef(null);
  const listRef = React.useRef(null);
  const [count, setCount] = React.useState(0);
  const [probe, setProbe] = React.useState(0);
  // After a take-back, adding again would only overflow again. Stay put until
  // the box changes size or the items do.
  const settled = React.useRef(false);

  React.useEffect(() => {
    settled.current = false;
    setProbe((n) => n + 1);
  }, [max, watch]);

  React.useEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    let lastHeight = null;
    const observer = new ResizeObserver(() => {
      const height = box.clientHeight;
      if (height === lastHeight) return;
      lastHeight = height;
      settled.current = false;
      setProbe((n) => n + 1);
    });
    observer.observe(box);
    return () => observer.disconnect();
    // Re-subscribed with the items: the box is not in the tree while its card
    // is still a skeleton, and the items arriving is what puts it there.
  }, [max, watch]);

  React.useLayoutEffect(() => {
    const box = boxRef.current;
    const list = listRef.current;
    if (!box || !list) return;

    if (count > max) {
      setCount(max);
      return;
    }

    const room = box.getBoundingClientRect();
    const items = list.children;
    const last = items[items.length - 1];
    // Content bottom: the last rendered item, or the box's own top with none.
    const bottom = last ? last.getBoundingClientRect().bottom : room.top;

    if (count > 0 && bottom > room.bottom + 0.5) {
      settled.current = true;
      setCount(count - 1);
      return;
    }

    if (!settled.current && count < max && room.bottom - bottom > 0.5) {
      setCount(count + 1);
    }
  }, [count, max, probe]);

  return { count: Math.min(count, max), boxRef, listRef };
}

export default useFitCount;
