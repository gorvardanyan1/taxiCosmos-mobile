import { io } from 'socket.io-client';

import { socketIoTransport } from '../realtime';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));

describe('socketIoTransport', () => {
  const socket = { connected: false, connect: jest.fn(), disconnect: jest.fn(), on: jest.fn(), off: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (io as jest.Mock).mockReturnValue(socket);
  });

  it('opens a WebSocket-only connection with the token and app in the handshake, and leaves reconnecting to the client', () => {
    socketIoTransport({ url: 'wss://realtime.example.test', token: 'tok', app: 'driver' });

    expect(io).toHaveBeenCalledWith('wss://realtime.example.test', {
      autoConnect: false,
      reconnection: false,
      transports: ['websocket'],
      timeout: 10_000,
      auth: { token: 'tok', app: 'driver' },
    });
  });

  it('passes connect, disconnect, listeners and the connected flag straight through', () => {
    const transport = socketIoTransport({ url: 'wss://x.test', token: 'tok', app: 'rider' });
    const handler = jest.fn();
    transport.connect();
    transport.on('trip.offer', handler);
    transport.off('trip.offer', handler);
    transport.disconnect();
    socket.connected = true;

    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(socket.on).toHaveBeenCalledWith('trip.offer', handler);
    expect(socket.off).toHaveBeenCalledWith('trip.offer', handler);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(transport.connected).toBe(true);
  });
});
