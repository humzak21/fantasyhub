import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useCountUp } from '../use-count-up.js';

const setReducedMotion = (reduce) => {
  window.matchMedia = (query) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {}
  });
};

afterEach(() => {
  vi.useRealTimers();
  setReducedMotion(false);
});

describe('useCountUp', () => {
  it('is the target at once when the viewer asks for less motion', () => {
    setReducedMotion(true);
    const { result } = renderHook(() => useCountUp(102.6));
    expect(result.current).toBe(102.6);
  });

  it('passes a missing value straight through', () => {
    const { result } = renderHook(() => useCountUp(null));
    expect(result.current).toBeNull();
  });

  it('counts up from 0 to the target, then follows it without counting', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const { result, rerender } = renderHook(({ value }) => useCountUp(value, { duration: 600 }), {
      initialProps: { value: 100 }
    });

    expect(result.current).toBe(0);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);
    act(() => vi.advanceTimersByTime(400));
    expect(result.current).toBe(100);

    rerender({ value: 120 });
    expect(result.current).toBe(120);
  });
});
