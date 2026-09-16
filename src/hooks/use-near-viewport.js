import * as React from 'react';

/**
 * True once the element has come within `rootMargin` of the viewport, and
 * true from then on.
 *
 * For a section at the foot of a landing page whose data is expensive: the
 * fetch waits until the reader scrolls toward it instead of running on every
 * visit to the page. Where `IntersectionObserver` does not exist (jsdom) the
 * answer is true immediately, so nothing waits on an event that cannot come.
 *
 * @param {React.RefObject<Element>} ref
 * @param {{ rootMargin?: string }} [options]
 */
export function useNearViewport(ref, { rootMargin = '600px' } = {}) {
  const [isNear, setIsNear] = React.useState(() => typeof IntersectionObserver === 'undefined');

  React.useEffect(() => {
    const element = ref.current;
    if (isNear || !element) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNear(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [isNear, ref, rootMargin]);

  return isNear;
}
