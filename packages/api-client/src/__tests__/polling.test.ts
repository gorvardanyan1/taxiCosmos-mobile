import { createPoller } from '../realtime';

describe('createPoller', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('polls at once, then at the interval', async () => {
    const task = jest.fn(async () => undefined);
    const poller = createPoller({ task, intervalMs: 4_000 });
    poller.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3_999);
    expect(task).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(task).toHaveBeenCalledTimes(3);
    expect(poller.running).toBe(true);
    poller.stop();
  });

  it('can wait the first interval instead of polling at once', async () => {
    const task = jest.fn(async () => undefined);
    const poller = createPoller({ task, intervalMs: 1_000, immediate: false });
    poller.start();
    await jest.advanceTimersByTimeAsync(999);
    expect(task).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(task).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('never runs two polls at once: the next pause starts when the slow poll ends', async () => {
    let finish: () => void = () => undefined;
    const task = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const poller = createPoller({ task, intervalMs: 1_000 });
    poller.start();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(task).toHaveBeenCalledTimes(1);

    poller.trigger();
    expect(task).toHaveBeenCalledTimes(1);
    finish();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(task).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('waits longer after failures, up to the limit, and goes back to normal after a success', async () => {
    const outcomes = [false, false, false, false, true, true];
    const times: number[] = [];
    const start = Date.now();
    const task = jest.fn(async () => {
      times.push(Date.now() - start);
      if (outcomes.shift() === false) throw new Error('offline');
    });
    const poller = createPoller({ task, intervalMs: 1_000, maxIntervalMs: 4_000 });
    poller.start();
    await jest.advanceTimersByTimeAsync(30_000);
    poller.stop();

    // Each failure doubles the pause (interval × 2^failures, capped at 4 s); the first success brings it back to 1 s.
    expect(times.slice(0, 7)).toEqual([0, 2_000, 6_000, 10_000, 14_000, 15_000, 16_000]);
  });

  it('stops for good: no more polls and no timer left behind, and a late result is ignored', async () => {
    const task = jest.fn(async () => undefined);
    const poller = createPoller({ task, intervalMs: 1_000 });
    poller.start();
    await jest.advanceTimersByTimeAsync(1_000);
    poller.stop();
    const calls = task.mock.calls.length;
    await jest.advanceTimersByTimeAsync(10_000);

    expect(task).toHaveBeenCalledTimes(calls);
    expect(jest.getTimerCount()).toBe(0);
    expect(poller.running).toBe(false);
  });

  it('does not poll twice when started twice', async () => {
    const task = jest.fn(async () => undefined);
    const poller = createPoller({ task, intervalMs: 1_000 });
    poller.start();
    poller.start();
    await jest.advanceTimersByTimeAsync(0);

    expect(task).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('polls on demand and then waits a full interval again', async () => {
    const task = jest.fn(async () => undefined);
    const poller = createPoller({ task, intervalMs: 5_000 });
    poller.start();
    await jest.advanceTimersByTimeAsync(4_000);
    poller.trigger();
    await jest.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);

    await jest.advanceTimersByTimeAsync(4_999);
    expect(task).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('ignores trigger() when stopped', async () => {
    const task = jest.fn(async () => undefined);
    const poller = createPoller({ task, intervalMs: 1_000 });
    poller.trigger();
    await jest.advanceTimersByTimeAsync(0);

    expect(task).not.toHaveBeenCalled();
  });

  it('can use its own timers', async () => {
    const callbacks: (() => void)[] = [];
    const cleared: unknown[] = [];
    const task = jest.fn(async () => undefined);
    const poller = createPoller({
      task,
      intervalMs: 1_000,
      setTimer: (cb) => callbacks.push(cb),
      clearTimer: (h) => cleared.push(h),
    });
    poller.start();
    await jest.advanceTimersByTimeAsync(0);
    poller.stop();

    expect(callbacks).toHaveLength(1);
    expect(cleared).toHaveLength(1);
  });
});
