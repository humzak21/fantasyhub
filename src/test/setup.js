import '@testing-library/jest-dom';

/**
 * jsdom has no layout, so it has no `ResizeObserver`. Recharts'
 * `ResponsiveContainer` constructs one in an effect and throws without it,
 * which surfaces as an unhandled exception *after* the test that mounted the
 * chart has already passed — the worst kind of red.
 *
 * Zero dimensions are the honest answer here: nothing in these tests asserts on
 * chart geometry.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * jsdom implements no media queries either, and `window.matchMedia` is simply
 * absent — so `useIsMobile`, the one sanctioned render-branching hook, throws
 * on mount. Default to the desktop branch (`matches: false`); a test that
 * wants the phone branch overrides this mock for its own scope.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

/**
 * jsdom implements no Pointer Events API, so `Element.hasPointerCapture` is
 * absent — and Radix's `Select` calls it on pointer-down to decide whether to
 * follow the pointer into the listbox. Without these three, opening any
 * `ui/select.jsx` in a test throws `target.hasPointerCapture is not a
 * function`, and it throws *outside* the assertion, so the failure reads as an
 * unhandled exception rather than as "the dropdown did not open".
 *
 * `scrollIntoView` is the same gap one layer down: the item Radix focuses on
 * open asks to be scrolled to.
 */
if (typeof window !== 'undefined') {
  if (typeof Element.prototype.hasPointerCapture !== 'function') {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {};
  }
}
