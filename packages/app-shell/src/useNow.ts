import { useEffect, useState } from 'react';

/**
 * The current time (epoch milliseconds) as state, refreshed once a second until `until` has passed, so a countdown or an expiry can be drawn
 * from it with pure functions. It is read again whenever `until` changes, so a new deadline is measured from that moment, not from the last tick.
 */
export function useNow(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Right away (the clock may have stood still since the last deadline), then every second until this one.
    const first = setTimeout(() => setNow(Date.now()), 0);

    if (until === null || Date.now() >= until) {
      return () => clearTimeout(first);
    }

    const timer = setInterval(() => {
      setNow(Date.now());

      if (Date.now() >= until) {
        clearInterval(timer);
      }
    }, 1000);

    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);

  return now;
}
