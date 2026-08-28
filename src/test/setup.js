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
