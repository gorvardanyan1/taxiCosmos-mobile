import type { AppClient } from '@taxikosmos/core';

/**
 * Every message the realtime service pushes carries this envelope (docs/realtime-events.md in the backend). Delivery is at-least-once,
 * so the same `event_id` can arrive twice.
 */
export interface RealtimeEvent<TPayload = unknown> {
  event_id: string;
  /** e.g. `trip.status_changed`, `driver.location_updated`, `trip.offer`. */
  type: string;
  /** Payload schema version of that type. */
  version: number;
  occurred_at: string;
  payload: TPayload;
}

export type RealtimeStatus =
  /** Not started. */
  | 'idle'
  /** No socket address is configured: the screens poll over REST instead. */
  | 'polling'
  | 'connecting'
  | 'connected'
  /** Lost the connection; trying again after a growing pause. */
  | 'reconnecting'
  | 'stopped';

/** Why the screens should fetch their state over REST again. */
export type ReconcileReason = 'reconnect' | 'foreground' | 'manual';

/** The slice of a socket this package uses: small enough to fake in tests, and what a Socket.io client offers. */
export interface SocketTransport {
  readonly connected: boolean;
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
}

export interface TransportConfig {
  url: string;
  /** The access token to authenticate the connection with, fresh for every attempt. */
  token: string;
  app: AppClient;
}

export type TransportFactory = (config: TransportConfig) => SocketTransport;
