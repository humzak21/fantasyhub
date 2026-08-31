import { useEffect, useState } from 'react';

/**
 * `value`, but only after it has stopped changing for `delay` ms.
 *
 * For search inputs, where the thing being typed into is controlled state that
 * updates per keystroke and the thing being *queried* should not be. Keeping
 * the two separate is what lets the query key be the debounced term: keying on
 * the live one would give the cache an entry per keystroke, each of them a
 * prefix nobody will ever type again.
 */
export function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export default useDebouncedValue;
