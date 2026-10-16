import { useEffect, useState } from 'react';

/** The value, but only after it stopped changing for `ms` (300 ms for a search box: one request per pause, not per keystroke). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);

    return () => clearTimeout(timer);
  }, [value, ms]);

  return debounced;
}
