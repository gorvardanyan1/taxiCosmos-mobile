import { io } from 'socket.io-client';

import type { SocketTransport, TransportFactory } from './types';

/**
 * The Socket.io transport. Socket.io's own reconnection is switched off: `RealtimeClient` reconnects (with a fresh token each time and
 * its own backoff), so there is exactly one place that decides when to retry. WebSocket only: long-polling fallbacks would hide
 * a broken connection from the REST reconciliation.
 */
export const socketIoTransport: TransportFactory = ({ url, token, app }): SocketTransport => {
  const socket = io(url, {
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
    timeout: 10_000,
    auth: { token, app },
  });

  return {
    get connected() {
      return socket.connected;
    },
    connect: () => {
      socket.connect();
    },
    disconnect: () => {
      socket.disconnect();
    },
    on: (event, handler) => {
      socket.on(event, handler);
    },
    off: (event, handler) => {
      socket.off(event, handler);
    },
  };
};
