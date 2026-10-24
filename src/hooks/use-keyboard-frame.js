import * as React from 'react';

/** Below this, a shrunken visual viewport is browser chrome moving, not a keyboard. */
const KEYBOARD_MIN_PX = 80;

/** The gap left above a sheet that fills what the keyboard leaves. */
export const KEYBOARD_TOP_GAP_PX = 8;

/**
 * Where the on-screen keyboard leaves room for a bottom sheet, from the
 * visual viewport. Pure, so the arithmetic is tested without a phone.
 *
 * iOS does not resize the layout viewport for the keyboard: `innerHeight`
 * stays put, the visual viewport shrinks, and Safari pans it (`offsetTop`) to
 * bring the focused field into view. A `position: fixed; bottom: 0` sheet is
 * pinned to the layout viewport, so it ends up under the keyboard, then is
 * panned up with everything else. The visible strip runs from `offsetTop` to
 * `offsetTop + height` in layout coordinates, so a sheet sitting on the
 * keyboard needs `bottom` = whatever lies below that strip, and a height
 * that fits inside it.
 *
 * Android Chrome resizes the layout viewport instead, so there the visual
 * viewport matches `innerHeight` and this returns null: `dvh` already shrank.
 *
 * @returns {{ bottom: number, height: number } | null} null with no keyboard
 */
export function keyboardFrame({ innerHeight, viewportHeight, viewportOffsetTop = 0 }) {
  if (!innerHeight || !viewportHeight) return null;
  if (innerHeight - viewportHeight < KEYBOARD_MIN_PX) return null;
  return {
    bottom: Math.max(0, Math.round(innerHeight - viewportOffsetTop - viewportHeight)),
    height: Math.max(0, Math.round(viewportHeight - KEYBOARD_TOP_GAP_PX)),
  };
}

/**
 * The keyboard's frame while `active`, following the visual viewport's resize
 * and pan. Null when inactive, when no keyboard is up, or where the browser
 * has no `visualViewport`.
 */
export function useKeyboardFrame(active) {
  const [frame, setFrame] = React.useState(null);

  React.useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) {
      setFrame(null);
      return undefined;
    }
    const measure = () => {
      const next = keyboardFrame({ innerHeight: window.innerHeight, viewportHeight: vv.height, viewportOffsetTop: vv.offsetTop });
      setFrame((prev) => (prev?.bottom === next?.bottom && prev?.height === next?.height ? prev : next));
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
    };
  }, [active]);

  return frame;
}
