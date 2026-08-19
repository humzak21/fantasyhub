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
