/**
 * Where a bottom sheet sits while the on-screen keyboard is up. iOS keeps the
 * layout viewport and pans a shrunken visual viewport, so the sheet has to be
 * lifted by whatever lies below the visible strip and fit inside it.
 */

import { describe, it, expect } from 'vitest';
import { keyboardFrame, KEYBOARD_TOP_GAP_PX } from '../use-keyboard-frame.js';

describe('keyboardFrame', () => {
  it('is null with no keyboard, or only browser chrome moving', () => {
    expect(keyboardFrame({ innerHeight: 667, viewportHeight: 667 })).toBeNull();
    expect(keyboardFrame({ innerHeight: 667, viewportHeight: 620 })).toBeNull();
    expect(keyboardFrame({ innerHeight: 0, viewportHeight: 0 })).toBeNull();
  });

  it('sits on the keyboard and fits in what it leaves', () => {
    expect(keyboardFrame({ innerHeight: 667, viewportHeight: 360, viewportOffsetTop: 0 }))
      .toEqual({ bottom: 307, height: 360 - KEYBOARD_TOP_GAP_PX });
  });

  it('follows the strip Safari has panned to, not the bottom of the page', () => {
    // Panned up 200px: the visible strip is 200..560, so 107px lie below it.
    expect(keyboardFrame({ innerHeight: 667, viewportHeight: 360, viewportOffsetTop: 200 }))
      .toEqual({ bottom: 107, height: 360 - KEYBOARD_TOP_GAP_PX });
  });

  it('never lifts by a negative amount', () => {
    expect(keyboardFrame({ innerHeight: 667, viewportHeight: 360, viewportOffsetTop: 400 }).bottom).toBe(0);
  });
});
