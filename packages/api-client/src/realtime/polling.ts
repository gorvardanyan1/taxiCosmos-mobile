export interface PollerOptions {
  /** One poll: fetch the state over REST. A rejection counts as a failed poll. */
  task: () => Promise<unknown>;
  /** Pause between polls. */
  intervalMs: number;
  /** After failed polls the pause doubles up to this. Default 8× the interval. */
  maxIntervalMs?: number;
  /** Poll right away on `start()`. Default true. */
  immediate?: boolean;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface Poller {
  start(): void;
  stop(): void;
  /** Poll now (the pause starts again after it). */
  trigger(): void;
  readonly running: boolean;
}

/**
 * Keeps a screen's state fresh over REST while no realtime connection exists. Never two polls at once, a pause that grows after failures
 * (a dead network is not hammered) and returns to normal after a success.
 */
export function createPoller({
  task,
  intervalMs,
  maxIntervalMs = intervalMs * 8,
  immediate = true,
  setTimer = (cb, ms) => setTimeout(cb, ms),
  clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}: PollerOptions): Poller {
  let running = false;
  let busy = false;
  let timer: unknown = null;
  let failures = 0;

  const schedule = () => {
    if (!running) {
      return;
    }

    const pause = Math.min(maxIntervalMs, intervalMs * 2 ** failures);
    timer = setTimer(() => {
      timer = null;
      void poll();
    }, pause);
  };

  const poll = async () => {
    if (!running || busy) {
      return;
    }

    busy = true;

    try {
      await task();
      failures = 0;
    } catch {
      failures++;
    } finally {
      busy = false;
      schedule();
    }
  };

  return {
    start() {
      if (running) {
        return;
      }

      running = true;
      failures = 0;

      if (immediate) {
        void poll();
      } else {
        schedule();
      }
    },
    stop() {
      running = false;

      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
    trigger() {
      if (!running || busy) {
        return;
      }

      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }

      void poll();
    },
    get running() {
      return running;
    },
  };
}
