import type { AppClient } from '@taxikosmos/core';

import { socketIoTransport } from './socketio';
import type { ReconcileReason, RealtimeEvent, RealtimeStatus, SocketTransport, TransportFactory } from './types';

export interface RealtimeOptions {
  /** The realtime service address. `null` until the service exists: the client then stays in polling mode and never connects. */
  url: string | null;
  app: AppClient;
  /** The current access token (renewed when needed); `null` when signed out, which stops the connection. */
  getToken: () => Promise<string | null>;
  createTransport?: TransportFactory;
  /** First pause before a reconnect attempt. Default 1 s. */
  baseDelayMs?: number;
  /** Longest pause. Default 30 s. */
  maxDelayMs?: number;
  /** 0–1, the share of the pause that is randomised so thousands of apps do not reconnect in the same second. Default 0.25. */
  jitter?: number;
  random?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Event ids remembered for de-duplication. Default 500. */
  dedupeSize?: number;
  /** Event versions this app understands. Default `[1]`; newer ones are skipped (the contract says to ignore versions you do not know). */
  supportedVersions?: readonly number[];
}

type EventHandler = (event: RealtimeEvent) => void;

/**
 * One realtime connection per app session. It never is the source of truth: the screens re-fetch their state over REST every time it
 * says to (`onReconnect`: after each reconnect and when the app comes back to the foreground), because a socket event can be missed
 * while the connection was down.
 */
export class RealtimeClient {
  private readonly options: Required<Pick<RealtimeOptions, 'baseDelayMs' | 'maxDelayMs' | 'jitter' | 'dedupeSize'>> &
    RealtimeOptions;
  private readonly createTransport: TransportFactory;
  private readonly random: () => number;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly reconnectHandlers = new Set<(reason: ReconcileReason) => void>();
  private readonly statusListeners = new Set<() => void>();
  private readonly seen = new Set<string>();
  /** Event types the current transport already listens to. */
  private readonly listening = new Set<string>();
  private transport: SocketTransport | null = null;
  private detach: (() => void) | null = null;
  private timer: unknown = null;
  private attempts = 0;
  private hasConnected = false;
  private running = false;
  private currentStatus: RealtimeStatus = 'idle';
  private generation = 0;

  constructor(options: RealtimeOptions) {
    this.options = { baseDelayMs: 1_000, maxDelayMs: 30_000, jitter: 0.25, dedupeSize: 500, ...options };
    this.createTransport = options.createTransport ?? socketIoTransport;
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  }

  get status(): RealtimeStatus {
    return this.currentStatus;
  }

  /** `socket` once a service address is configured, `polling` while there is none. */
  get mode(): 'socket' | 'polling' {
    return this.options.url === null ? 'polling' : 'socket';
  }

  getSnapshot = (): RealtimeStatus => this.currentStatus;

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);

    return () => {
      this.statusListeners.delete(listener);
    };
  };

  /** Starts the connection (or polling mode when there is no address). Calling it again does nothing. */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;

    if (this.options.url === null) {
      this.setStatus('polling');

      return;
    }

    void this.connect();
  }

  /** Closes the connection for good (sign-out, app closed). `start()` begins again from scratch. */
  stop(): void {
    this.running = false;
    this.generation++;
    this.cancelTimer();
    this.dropTransport();
    this.attempts = 0;
    this.hasConnected = false;
    this.setStatus(this.options.url === null ? 'idle' : 'stopped');
  }

  /** Listens for one event type. Returns the way to stop listening. */
  subscribe<TPayload = unknown>(type: string, handler: (event: RealtimeEvent<TPayload>) => void): () => void {
    const set = this.handlers.get(type) ?? new Set<EventHandler>();
    set.add(handler as EventHandler);
    this.handlers.set(type, set);

    if (set.size === 1 && !this.listening.has(type)) {
      this.listening.add(type);
      this.transport?.on(type, this.onEvent);
    }

    return () => {
      set.delete(handler as EventHandler);
    };
  }

  /** Called when the screens must fetch their state over REST again: after every reconnect and on `foreground()`. */
  onReconnect(handler: (reason: ReconcileReason) => void): () => void {
    this.reconnectHandlers.add(handler);

    return () => {
      this.reconnectHandlers.delete(handler);
    };
  }

  /**
   * The app came back to the foreground. The screens reconcile at once (events may have been missed while the phone slept), and a
   * connection that was lost is retried now instead of after its pause.
   */
  foreground(): void {
    if (!this.running) {
      return;
    }

    this.notifyReconcile('foreground');

    if (this.options.url !== null && this.currentStatus !== 'connected' && this.currentStatus !== 'connecting') {
      this.cancelTimer();
      this.attempts = 0;
      void this.connect();
    }
  }

  // ---- connection ----

  private async connect(): Promise<void> {
    const generation = ++this.generation;
    this.setStatus(this.hasConnected ? 'reconnecting' : 'connecting');
    let token: string | null;

    try {
      token = await this.options.getToken();
    } catch {
      // The token could not be read this time (not "signed out"): try again after the usual pause.
      if (generation === this.generation && this.running) {
        this.onLost(generation);
      }

      return;
    }

    if (generation !== this.generation || !this.running) {
      return;
    }

    if (token === null) {
      // Signed out: there is nobody to connect for.
      this.running = false;
      this.setStatus('stopped');

      return;
    }

    this.dropTransport();
    this.listening.clear();
    const transport = this.createTransport({ url: this.options.url as string, token, app: this.options.app });
    this.transport = transport;
    const connected = () => this.onConnect(generation);
    const lost = () => this.onLost(generation);
    transport.on('connect', connected);
    transport.on('disconnect', lost);
    transport.on('connect_error', lost);

    for (const type of this.handlers.keys()) {
      this.listening.add(type);
      transport.on(type, this.onEvent);
    }

    // Taken off again before the transport is closed: a real socket reports its own disconnect() synchronously.
    this.detach = () => {
      transport.off('connect', connected);
      transport.off('disconnect', lost);
      transport.off('connect_error', lost);

      for (const type of this.handlers.keys()) {
        transport.off(type, this.onEvent);
      }
    };

    transport.connect();
  }

  private onConnect(generation: number): void {
    if (generation !== this.generation) {
      return;
    }

    const reconnected = this.hasConnected;
    this.hasConnected = true;
    this.attempts = 0;
    this.setStatus('connected');

    if (reconnected) {
      this.notifyReconcile('reconnect');
    }
  }

  private onLost(generation: number): void {
    if (generation !== this.generation || !this.running) {
      return;
    }

    this.dropTransport();
    this.setStatus('reconnecting');
    const delay = this.nextDelay();
    this.attempts++;
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.connect();
    }, delay);
  }

  /** `base × 2^attempt`, capped, with the jitter taken off the top so the cap is never exceeded. */
  private nextDelay(): number {
    const { baseDelayMs, maxDelayMs, jitter } = this.options;
    const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** this.attempts);

    return Math.round(ceiling * (1 - jitter * this.random()));
  }

  private readonly onEvent = (...args: unknown[]): void => {
    const event = args[0] as Partial<RealtimeEvent> | undefined;

    if (!event || typeof event.event_id !== 'string' || typeof event.type !== 'string') {
      return;
    }

    if (!(this.options.supportedVersions ?? [1]).includes(event.version as number)) {
      return;
    }

    // At-least-once delivery: the same event can arrive twice (after a crash or a reconnect). Handle each id once.
    if (this.seen.has(event.event_id)) {
      return;
    }

    this.seen.add(event.event_id);

    if (this.seen.size > this.options.dedupeSize) {
      const oldest = this.seen.values().next().value;

      if (oldest !== undefined) {
        this.seen.delete(oldest);
      }
    }

    for (const handler of this.handlers.get(event.type) ?? []) {
      try {
        handler(event as RealtimeEvent);
      } catch {
        // One screen's bug must not stop the others from hearing the event.
      }
    }
  };

  private notifyReconcile(reason: ReconcileReason): void {
    for (const handler of [...this.reconnectHandlers]) {
      try {
        handler(reason);
      } catch {
        // Same: a failing screen does not break the rest.
      }
    }
  }

  /** Ask every screen to reconcile now, e.g. after a manual pull-to-refresh of the trip. */
  reconcileNow(): void {
    this.notifyReconcile('manual');
  }

  private dropTransport(): void {
    const transport = this.transport;
    this.transport = null;
    this.detach?.();
    this.detach = null;
    transport?.disconnect();
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.currentStatus === status) {
      return;
    }

    this.currentStatus = status;
    this.statusListeners.forEach((listener) => listener());
  }
}

export function createRealtimeClient(options: RealtimeOptions): RealtimeClient {
  return new RealtimeClient(options);
}
