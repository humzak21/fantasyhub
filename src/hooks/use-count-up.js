import * as React from 'react';

/** True when the viewer has asked for less motion, or the question cannot be asked. */
export function prefersReducedMotion() {
  try {
    return typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

const easeOut = (t) => 1 - (1 - t) ** 3;

/**
 * A number that counts up to `target` the first time it is known, then
 * follows it without animating.
 *
 * Motion that reveals, once: the hero's totals and the record cards' figures
 * arrive by counting up over `duration`, and a refetch that changes the value
 * afterwards simply shows the new one — a number that re-runs every time the
 * data moves is a number nobody can read. With `prefers-reduced-motion` (or
 * no `requestAnimationFrame`) it is the target from the first paint.
 *
 * A non-finite target (null, the em dash) passes straight through: there is
 * nothing to count.
 *
 * @param {number|null|undefined} target
 * @param {{ duration?: number }} [options]
 * @returns {number|null|undefined}
 */
export function useCountUp(target, { duration = 600 } = {}) {
  const animatable = Number.isFinite(target);
  // Starts at 0 when it is going to count, so the first paint is not the
  // final figure flashing before the count begins.
  const [state, setState] = React.useState(() => ({
    value: animatable && !prefersReducedMotion() ? 0 : target,
    played: false
  }));
  const frame = React.useRef(0);

  // A layout effect for the same reason: a value that arrives after the first
  // render is reset to 0 before the browser paints it.
  React.useLayoutEffect(() => {
    if (!animatable) return undefined;

    if (state.played || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setState((current) => (current.value === target && current.played ? current : { value: target, played: true }));
      return undefined;
    }

    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setState({ value: target * easeOut(t), played: t >= 1 });
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    setState({ value: 0, played: false });
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // `state.played` is read, not reacted to: the count runs once, and the
    // effect re-runs only for a new target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, animatable, duration]);

  return animatable ? state.value : target;
}

export default useCountUp;
