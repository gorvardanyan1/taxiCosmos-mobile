import {
  RealtimeClient,
  createRealtimeClient,
  type RealtimeEvent,
  type RealtimeOptions,
  type SocketTransport,
  type TransportConfig,
} from '../realtime';

/** A socket that behaves like Socket.io's: `disconnect()` reports itself synchronously, and the test decides when the server answers. */
class FakeTransport implements SocketTransport {
  connected = false;
  readonly handlers = new Map<string, Set<(...args: unknown[]) => void>>();
  connectCalls = 0;
  disconnectCalls = 0;

  constructor(readonly config: TransportConfig) {}

  connect() {
    this.connectCalls++;
  }

  disconnect() {
    this.disconnectCalls++;
    const wasConnected = this.connected;
    this.connected = false;

    if (wasConnected) {
      this.emit('disconnect', 'io client disconnect');
    }
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler);
    this.handlers.set(event, set);
  }

  off(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.get(event)?.delete(handler);
  }

  listenerCount(event: string) {
    return this.handlers.get(event)?.size ?? 0;
  }

  emit(event: string, ...args: unknown[]) {
    [...(this.handlers.get(event) ?? [])].forEach((handler) => handler(...args));
  }

  serverAccepts() {
    this.connected = true;
    this.emit('connect');
  }

  serverDrops() {
    this.connected = false;
    this.emit('disconnect', 'transport close');
  }

  fail() {
    this.emit('connect_error', new Error('refused'));
  }
}

const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
};

function setup(options: Partial<RealtimeOptions> = {}) {
  const transports: FakeTransport[] = [];
  const timers: { callback: () => void; ms: number; cancelled: boolean }[] = [];
  let token: string | null = 'token-1';
  const getToken = jest.fn(async () => token);
  const client = new RealtimeClient({
    url: 'wss://realtime.example.test',
    app: 'rider',
    getToken,
    createTransport: (config) => {
      const transport = new FakeTransport(config);
      transports.push(transport);

      return transport;
    },
    random: () => 0,
    setTimer: (callback, ms) => {
      const timer = { callback, ms, cancelled: false };
      timers.push(timer);

      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cancelled: boolean }).cancelled = true;
    },
    ...options,
  });

  return {
    client,
    transports,
    timers,
    getToken,
    setToken: (value: string | null) => (token = value),
    last: () => transports[transports.length - 1] as FakeTransport,
    pending: () => timers.filter((timer) => !timer.cancelled),
    /** Runs the oldest pending reconnect timer. */
    fire: async () => {
      const timer = timers.find((entry) => !entry.cancelled);
      timer?.callback();
      if (timer) timer.cancelled = true;
      await flush();
    },
  };
}

const event = (id: string, type = 'trip.status_changed', overrides: Partial<RealtimeEvent> = {}): RealtimeEvent => ({
  event_id: id,
  type,
  version: 1,
  occurred_at: '2026-10-16T10:00:00.000Z',
  payload: { id },
  ...overrides,
});

describe('without a realtime address (the service does not exist yet)', () => {
  it('stays in polling mode: it never asks for a token and never opens a socket', async () => {
    const { client, getToken, transports } = setup({ url: null });
    client.start();
    await flush();

    expect(client.mode).toBe('polling');
    expect(client.status).toBe('polling');
    expect(getToken).not.toHaveBeenCalled();
    expect(transports).toHaveLength(0);
  });

  it('still tells screens to reconcile when the app returns to the foreground, and goes back to idle when stopped', async () => {
    const { client } = setup({ url: null });
    const reconcile = jest.fn();
    client.onReconnect(reconcile);
    client.start();
    client.foreground();
    client.stop();

    expect(reconcile).toHaveBeenCalledWith('foreground');
    expect(client.status).toBe('idle');
  });
});

describe('connecting', () => {
  it('connects with the current token and the app, reports "connected", and does not call a first connection a reconnect', async () => {
    const { client, last, getToken } = setup();
    const reconnected = jest.fn();
    client.onReconnect(reconnected);
    client.start();
    expect(client.status).toBe('connecting');
    await flush();

    expect(last().config).toEqual({ url: 'wss://realtime.example.test', token: 'token-1', app: 'rider' });
    expect(last().connectCalls).toBe(1);
    expect(getToken).toHaveBeenCalledTimes(1);

    last().serverAccepts();
    expect(client.status).toBe('connected');
    expect(client.mode).toBe('socket');
    expect(reconnected).not.toHaveBeenCalled();
  });

  it('opens one connection however many times it is started', async () => {
    const { client, transports } = setup();
    client.start();
    client.start();
    await flush();

    expect(transports).toHaveLength(1);
  });

  it('stops without a connection when there is no token', async () => {
    const { client, transports, setToken } = setup();
    setToken(null);
    client.start();
    await flush();

    expect(transports).toHaveLength(0);
    expect(client.status).toBe('stopped');
  });

  it('tries again later when the token could not be read, instead of giving up', async () => {
    const setupResult = setup();
    const { client, transports, pending, fire } = setupResult;
    let calls = 0;
    (setupResult.getToken as jest.Mock).mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error('keychain busy');

      return 'token-2';
    });
    client.start();
    await flush();
    expect(transports).toHaveLength(0);
    expect(pending()).toHaveLength(1);

    await fire();

    expect(transports).toHaveLength(1);
    expect(transports[0]?.config.token).toBe('token-2');
  });
});

describe('losing the connection', () => {
  async function connected() {
    const harness = setup();
    harness.client.start();
    await flush();
    harness.last().serverAccepts();

    return harness;
  }

  it('reports "reconnecting" and waits before the next attempt, doubling the wait each time up to the cap', async () => {
    const { client, last, pending, fire } = await connected();
    last().serverDrops();
    expect(client.status).toBe('reconnecting');

    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      delays.push(pending()[0]?.ms ?? -1);
      await fire();
      last().fail();
    }
    delays.push(pending()[0]?.ms ?? -1);

    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000, 30_000]);
  });

  it('randomises each pause downwards by the jitter, never above the cap', async () => {
    const { last, pending } = await (async () => {
      const harness = setup({ random: () => 1 });
      harness.client.start();
      await flush();
      harness.last().serverAccepts();

      return harness;
    })();
    last().serverDrops();

    expect(pending()[0]?.ms).toBe(750);
  });

  it('schedules exactly one reconnect even though closing a socket reports a disconnect of its own', async () => {
    const { last, pending } = await connected();
    last().serverDrops();
    last().fail();
    last().serverDrops();

    expect(pending()).toHaveLength(1);
  });

  it('asks for the token again on every attempt, so a renewed token is used', async () => {
    const { last, fire, getToken, setToken, transports } = await connected();
    last().serverDrops();
    setToken('token-2');
    await fire();

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(transports[1]?.config.token).toBe('token-2');
  });

  it('resets the pause after a successful connection and tells the screens to reconcile', async () => {
    const { client, last, fire, pending } = await connected();
    const reconnected = jest.fn();
    client.onReconnect(reconnected);
    last().serverDrops();
    await fire();
    last().fail();
    await fire();
    last().serverAccepts();

    expect(client.status).toBe('connected');
    expect(reconnected).toHaveBeenCalledTimes(1);
    expect(reconnected).toHaveBeenCalledWith('reconnect');

    last().serverDrops();
    expect(pending()[0]?.ms).toBe(1_000);
  });

  it('keeps trying when the very first connection fails', async () => {
    const { client, last, pending, fire } = setup();
    client.start();
    await flush();
    last().fail();

    expect(client.status).toBe('reconnecting');
    expect(pending()[0]?.ms).toBe(1_000);

    await fire();
    expect(client.status).toBe('connecting');
    last().serverAccepts();
    expect(client.status).toBe('connected');
  });

  it('does not call the first successful connection after early failures a reconnect (nothing was missed)', async () => {
    const { client, last, fire } = setup();
    const reconnected = jest.fn();
    client.onReconnect(reconnected);
    client.start();
    await flush();
    last().fail();
    await fire();
    last().serverAccepts();

    expect(reconnected).not.toHaveBeenCalled();
  });

  it('ignores what an old connection says after it was replaced', async () => {
    const { client, transports, fire, last } = await connected();
    const old = last();
    old.serverDrops();
    await fire();
    expect(transports).toHaveLength(2);

    old.emit('connect');
    old.emit('disconnect', 'late');

    // The old socket is detached: what it reports now changes nothing. The new attempt is still to come.
    expect(client.status).toBe('reconnecting');
  });
});

describe('the app returns to the foreground', () => {
  it('tells the screens to reconcile and leaves a healthy connection alone', async () => {
    const { client, last, transports } = setup();
    const reconnected = jest.fn();
    client.onReconnect(reconnected);
    client.start();
    await flush();
    last().serverAccepts();
    client.foreground();
    await flush();

    expect(reconnected).toHaveBeenCalledWith('foreground');
    expect(transports).toHaveLength(1);
  });

  it('reconnects at once, without waiting out the pause, when the connection was lost', async () => {
    const { client, last, transports, pending } = setup();
    client.start();
    await flush();
    last().serverAccepts();
    last().serverDrops();
    expect(pending()).toHaveLength(1);

    client.foreground();
    await flush();

    expect(pending()).toHaveLength(0);
    expect(transports).toHaveLength(2);
    expect(client.status).toBe('reconnecting');
  });

  it('does nothing before start or after stop', async () => {
    const { client, transports } = setup();
    const reconnected = jest.fn();
    client.onReconnect(reconnected);
    client.foreground();
    client.start();
    await flush();
    client.stop();
    client.foreground();

    expect(reconnected).not.toHaveBeenCalled();
    expect(transports).toHaveLength(1);
  });

  it('survives a screen whose reconcile handler throws', async () => {
    const { client } = setup({ url: null });
    const healthy = jest.fn();
    client.onReconnect(() => {
      throw new Error('screen bug');
    });
    client.onReconnect(healthy);
    client.start();
    client.foreground();

    expect(healthy).toHaveBeenCalledWith('foreground');
  });

  it('lets a screen ask for a reconcile itself and stop listening', () => {
    const { client } = setup({ url: null });
    const handler = jest.fn();
    const off = client.onReconnect(handler);
    client.reconcileNow();
    off();
    client.reconcileNow();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('manual');
  });
});

describe('stopping', () => {
  it('closes the connection, cancels a pending reconnect and ignores everything after', async () => {
    const { client, last, pending, transports } = setup();
    client.start();
    await flush();
    last().serverAccepts();
    last().serverDrops();
    client.stop();

    expect(client.status).toBe('stopped');
    expect(pending()).toHaveLength(0);

    const before = transports.length;
    last().fail();
    expect(transports).toHaveLength(before);
  });

  it('closes an open connection', async () => {
    const { client, last } = setup();
    client.start();
    await flush();
    const transport = last();
    transport.serverAccepts();
    client.stop();

    expect(transport.disconnectCalls).toBe(1);
    expect(transport.connected).toBe(false);
  });

  it('starts again from scratch: the next connection is a first connection', async () => {
    const { client, last } = setup();
    const reconnected = jest.fn();
    client.onReconnect(reconnected);
    client.start();
    await flush();
    last().serverAccepts();
    client.stop();
    client.start();
    await flush();
    last().serverAccepts();

    expect(reconnected).not.toHaveBeenCalled();
    expect(client.status).toBe('connected');
  });

  it('a connection that finishes after stop() is dropped', async () => {
    const { client, transports } = setup();
    client.start();
    client.stop();
    await flush();

    expect(transports).toHaveLength(0);
  });
});

describe('events', () => {
  async function ready(options: Partial<RealtimeOptions> = {}) {
    const harness = setup(options);
    harness.client.start();
    await flush();
    harness.last().serverAccepts();

    return harness;
  }

  it('delivers an event to the handlers of its type only', async () => {
    const { client, last } = await ready();
    const status = jest.fn();
    const location = jest.fn();
    client.subscribe('trip.status_changed', status);
    client.subscribe('driver.location_updated', location);
    last().emit('trip.status_changed', event('e1'));

    expect(status).toHaveBeenCalledWith(event('e1'));
    expect(location).not.toHaveBeenCalled();
  });

  it('handles an event once even when the service delivers it twice (at-least-once delivery)', async () => {
    const { client, last } = await ready();
    const handler = jest.fn();
    client.subscribe('trip.status_changed', handler);
    last().emit('trip.status_changed', event('same'));
    last().emit('trip.status_changed', event('same'));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('remembers only the latest ids, so the memory cannot grow without end', async () => {
    const { client, last } = await ready({ dedupeSize: 3 });
    const handler = jest.fn();
    client.subscribe('trip.status_changed', handler);

    for (const id of ['a', 'b', 'c', 'd']) {
      last().emit('trip.status_changed', event(id));
    }
    last().emit('trip.status_changed', event('d'));
    last().emit('trip.status_changed', event('a'));

    expect(handler.mock.calls.map(([e]) => e.event_id)).toEqual(['a', 'b', 'c', 'd', 'a']);
  });

  it('skips a payload version it does not know', async () => {
    const { client, last } = await ready();
    const handler = jest.fn();
    client.subscribe('trip.status_changed', handler);
    last().emit('trip.status_changed', event('v2', 'trip.status_changed', { version: 2 }));
    last().emit('trip.status_changed', event('v1'));

    expect(handler.mock.calls.map(([e]) => e.event_id)).toEqual(['v1']);
  });

  it('accepts the versions the app says it understands', async () => {
    const { client, last } = await ready({ supportedVersions: [1, 2] });
    const handler = jest.fn();
    client.subscribe('trip.status_changed', handler);
    last().emit('trip.status_changed', event('v2', 'trip.status_changed', { version: 2 }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, 'text', {}, { event_id: 7, type: 'x' }, { event_id: 'x' }])(
    'ignores a malformed message: %p',
    async (message) => {
      const { client, last } = await ready();
      const handler = jest.fn();
      client.subscribe('trip.status_changed', handler);
      last().emit('trip.status_changed', message);

      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('keeps delivering when one handler throws', async () => {
    const { client, last } = await ready();
    const healthy = jest.fn();
    client.subscribe('trip.status_changed', () => {
      throw new Error('screen bug');
    });
    client.subscribe('trip.status_changed', healthy);
    last().emit('trip.status_changed', event('e1'));

    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribing', async () => {
    const { client, last } = await ready();
    const handler = jest.fn();
    const off = client.subscribe('trip.status_changed', handler);
    off();
    last().emit('trip.status_changed', event('e1'));

    expect(handler).not.toHaveBeenCalled();
  });

  it('listens to the socket once per event type however many screens subscribe', async () => {
    const { client, last } = await ready();
    client.subscribe('trip.status_changed', jest.fn());
    client.subscribe('trip.status_changed', jest.fn());

    expect(last().listenerCount('trip.status_changed')).toBe(1);
  });

  it('keeps its subscriptions on the new connection after a reconnect, and detaches them from the old one', async () => {
    const { client, last, fire } = await ready();
    const handler = jest.fn();
    client.subscribe('trip.status_changed', handler);
    const first = last();
    first.serverDrops();
    await fire();
    last().serverAccepts();

    expect(first.listenerCount('trip.status_changed')).toBe(0);
    last().emit('trip.status_changed', event('after'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('can subscribe before the connection exists', async () => {
    const harness = setup();
    const handler = jest.fn();
    harness.client.subscribe('trip.offer', handler);
    harness.client.start();
    await flush();
    harness.last().serverAccepts();
    harness.last().emit('trip.offer', event('offer-1', 'trip.offer'));

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('status', () => {
  it('wakes subscribers on a change of status only', async () => {
    const { client, last } = setup();
    const listener = jest.fn();
    const off = client.subscribeStatus(listener);
    client.start();
    await flush();
    last().serverAccepts();
    last().connected = true;
    last().emit('connect');
    off();
    last().serverDrops();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(client.getSnapshot()).toBe('reconnecting');
  });
});

describe('real timers', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('uses setTimeout by default and can be created with the factory function', async () => {
    const transports: FakeTransport[] = [];
    const client = createRealtimeClient({
      url: 'wss://realtime.example.test',
      app: 'driver',
      getToken: async () => 'token',
      createTransport: (config) => {
        const transport = new FakeTransport(config);
        transports.push(transport);

        return transport;
      },
      random: () => 0,
    });
    client.start();
    await jest.advanceTimersByTimeAsync(0);
    transports[0]?.serverAccepts();
    transports[0]?.serverDrops();
    await jest.advanceTimersByTimeAsync(999);
    expect(transports).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(2);

    expect(transports).toHaveLength(2);
    client.stop();
    expect(jest.getTimerCount()).toBe(0);
  });
});
