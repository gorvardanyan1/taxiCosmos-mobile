import { ApiRequestError, type AuthSession } from '@taxikosmos/core';

import { SessionManager, type SessionEndReason } from '../session';
import { createMemoryTokenStore, type TokenStore } from '../storage';
import { loggingTokenStore, pair, sessionPayload } from './helpers';

const NOW = Date.parse('2026-10-16T10:00:00Z');
const unauthenticated = () => new ApiRequestError({ kind: 'unauthenticated', status: 401, message: null, code: null });
const network = () => new ApiRequestError({ kind: 'network', status: null, message: null, code: null });
const fresh = (n: number): AuthSession =>
  sessionPayload({
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    access_token_expires_at: '2099-01-01T00:00:00+00:00',
  });

function make(
  options: {
    store?: TokenStore;
    refresh?: (token: string) => Promise<AuthSession>;
    now?: () => number;
    onEnded?: (reason: SessionEndReason) => void;
  } = {},
) {
  const store = options.store ?? loggingTokenStore(pair());
  const refresh = jest.fn(options.refresh ?? (async () => fresh(2)));
  const onEnded = jest.fn(options.onEnded);
  const manager = new SessionManager({ store, refresh, onEnded, now: options.now ?? (() => NOW) });

  return { manager, store: store as ReturnType<typeof loggingTokenStore>, refresh, onEnded };
}

describe('SessionManager: loading', () => {
  it('starts "unknown", then signed in when the secure store holds a session', async () => {
    const { manager } = make();

    expect(manager.getSnapshot().status).toBe('unknown');
    await manager.load();

    expect(manager.getSnapshot().status).toBe('signed_in');
    expect(manager.isSignedIn).toBe(true);
  });

  it('is signed out when nothing is stored', async () => {
    const { manager } = make({ store: createMemoryTokenStore(null) });
    await manager.load();

    expect(manager.getSnapshot().status).toBe('signed_out');
    expect(await manager.accessToken()).toBeNull();
  });

  it('treats an unreadable store as signed out rather than crashing the app at launch', async () => {
    const broken: TokenStore = {
      read: async () => Promise.reject(new Error('keychain locked')),
      write: async () => undefined,
      clear: async () => undefined,
    };
    const { manager } = make({ store: broken });
    await manager.load();

    expect(manager.getSnapshot().status).toBe('signed_out');
  });

  it('reads the store once however many callers ask', async () => {
    const { manager, store } = make();
    await Promise.all([manager.load(), manager.load(), manager.accessToken(), manager.accessToken()]);

    expect(store.log.filter((entry) => entry === 'read')).toHaveLength(1);
  });

  it('lets a sign-in that happens while the store is still being read win over what was stored', async () => {
    let release: (value: ReturnType<typeof pair>) => void = () => undefined;
    const slow: TokenStore = {
      read: () => new Promise((resolve) => (release = resolve)),
      write: async () => undefined,
      clear: async () => undefined,
    };
    const { manager } = make({ store: slow });
    const loading = manager.load();
    await manager.start(fresh(9));
    release(pair({ accessToken: 'stale-from-disk' }));
    await loading;

    expect(await manager.accessToken()).toBe('access-9');
  });
});

describe('SessionManager: a sign-in racing the launch', () => {
  it("wins over the launch finding nobody signed in, even when the launch's cleanup finishes last", async () => {
    const cleanups: (() => void)[] = [];
    const manager = new SessionManager({
      store: createMemoryTokenStore(null),
      refresh: async () => fresh(2),
      onForget: () => new Promise<void>((resolve) => cleanups.push(resolve)),
      now: () => NOW,
    });
    const wait = async (condition: () => boolean) => {
      for (let i = 0; i < 50 && !condition(); i++) {
        await Promise.resolve();
      }
    };

    const launch = manager.load();
    await wait(() => cleanups.length === 1);
    const signIn = manager.start(fresh(3));
    await wait(() => cleanups.length === 2);

    cleanups[1]?.(); // the sign-in's cleanup finishes first: signed in
    await signIn;
    expect(manager.getSnapshot().status).toBe('signed_in');

    cleanups[0]?.(); // the launch's cleanup finishes last and must not sign the person out again
    await launch;

    expect(manager.getSnapshot().status).toBe('signed_in');
    expect(await manager.accessToken()).toBe('access-3');
  });
});

describe('SessionManager: starting and ending', () => {
  it('saves the new tokens before the app sees itself as signed in', async () => {
    const { manager, store } = make({ store: loggingTokenStore(null) });
    const seen: string[] = [];
    manager.subscribe(() => seen.push(`${manager.getSnapshot().status}|${store.log.join(',')}`));
    await manager.start(fresh(1));

    expect(seen).toEqual(['signed_in|write:access-1']);
  });

  it('clears the tokens when signing out and tells subscribers once', async () => {
    const { manager, store } = make();
    await manager.load();
    const listener = jest.fn();
    manager.subscribe(listener);
    await manager.clear();

    expect(store.log).toContain('clear');
    expect(await manager.accessToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().status).toBe('signed_out');
  });

  it('does not wake subscribers when the status did not change, and stops after unsubscribing', async () => {
    const { manager } = make();
    await manager.load();
    const listener = jest.fn();
    const unsubscribe = manager.subscribe(listener);
    await manager.start(fresh(2));
    await manager.start(fresh(3));
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    await manager.clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it('end() signs out and reports why', async () => {
    const { manager, onEnded } = make();
    await manager.load();
    await manager.end('unauthorized');

    expect(manager.isSignedIn).toBe(false);
    expect(onEnded).toHaveBeenCalledWith('unauthorized');
  });
});

describe('SessionManager: renewing the session', () => {
  it('sends a refresh token once, saves the new pair, and then serves the new access token', async () => {
    const { manager, refresh, store } = make();
    await manager.load();
    await manager.renew('access-1');

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('refresh-1');
    expect(store.log).toEqual(['read', 'write:access-2']);
    expect(await manager.accessToken()).toBe('access-2');
  });

  it('shares one renewal between parallel callers: five requests refused at once cause one refresh', async () => {
    let release: (session: AuthSession) => void = () => undefined;
    const { manager, refresh } = make({ refresh: () => new Promise((resolve) => (release = resolve)) });
    await manager.load();
    const all = Promise.all(Array.from({ length: 5 }, () => manager.renew('access-1')));
    await Promise.resolve();
    release(fresh(2));
    await all;

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(await manager.accessToken()).toBe('access-2');
  });

  it('sends nothing when the refused token is no longer the current one (another request renewed already)', async () => {
    const { manager, refresh } = make();
    await manager.load();
    await manager.renew('access-1');
    await manager.renew('access-1');

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('never sends the same refresh token twice: after one was used, the next renewal sends the new one', async () => {
    let n = 1;
    const { manager, refresh } = make({ refresh: async () => fresh(++n) });
    await manager.load();
    await manager.renew('access-1');
    await manager.renew('access-2');

    expect(refresh.mock.calls.map(([token]) => token)).toEqual(['refresh-1', 'refresh-2']);
  });

  it('saves the new pair before the renewal completes, so nothing can run into the spent token', async () => {
    const order: string[] = [];
    const store = loggingTokenStore(pair());
    const write = store.write;
    store.write = async (value) => {
      order.push('write');

      return write(value);
    };
    const { manager } = make({ store });
    await manager.load();
    await manager.renew('access-1').then(() => order.push('renewed'));

    expect(order).toEqual(['write', 'renewed']);
  });

  it.each([['unauthenticated'], ['forbidden'], ['validation']] as const)(
    'ends the session when the server refuses the refresh token (%s)',
    async (kind) => {
      const refused = new ApiRequestError({
        kind,
        status: kind === 'unauthenticated' ? 401 : kind === 'forbidden' ? 403 : 422,
        message: null,
        code: null,
        ...(kind === 'validation' ? { fieldErrors: {} } : {}),
      } as never);
      const { manager, onEnded, store } = make({ refresh: async () => Promise.reject(refused) });
      await manager.load();
      await manager.renew('access-1');

      expect(onEnded).toHaveBeenCalledWith('refresh_rejected');
      expect(onEnded).toHaveBeenCalledTimes(1);
      expect(store.log).toContain('clear');
      expect(await manager.accessToken()).toBeNull();
    },
  );

  it('keeps the session and the tokens when the outcome is unknown (no connection): the next call tries again', async () => {
    const { manager, onEnded, store } = make({ refresh: async () => Promise.reject(network()) });
    await manager.load();

    await expect(manager.renew('access-1')).rejects.toBeInstanceOf(ApiRequestError);
    expect(onEnded).not.toHaveBeenCalled();
    expect(store.log).toEqual(['read']);
    expect(manager.isSignedIn).toBe(true);
  });

  it('can renew again after a failed renewal (the shared promise is released)', async () => {
    const refresh = jest.fn().mockRejectedValueOnce(network()).mockResolvedValueOnce(fresh(2));
    const { manager } = make({ refresh });
    await manager.load();
    await expect(manager.renew('access-1')).rejects.toBeInstanceOf(ApiRequestError);
    await manager.renew('access-1');

    expect(await manager.accessToken()).toBe('access-2');
  });

  it('rethrows an error that is not an API error instead of swallowing it', async () => {
    const { manager } = make({ refresh: async () => Promise.reject(new TypeError('bug')) });
    await manager.load();

    await expect(manager.renew('access-1')).rejects.toThrow('bug');
    expect(manager.isSignedIn).toBe(true);
  });

  it('does nothing when signed out', async () => {
    const { manager, refresh } = make({ store: createMemoryTokenStore(null) });
    await manager.renew('anything');

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('SessionManager: renewing before the token expires', () => {
  it('renews at most 30 seconds before expiry, without waiting for a 401', async () => {
    const expiring = pair({ accessTokenExpiresAt: new Date(NOW + 20_000).toISOString() });
    const { manager, refresh } = make({ store: loggingTokenStore(expiring) });

    expect(await manager.accessToken()).toBe('access-2');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('leaves a token with more than 30 seconds left alone', async () => {
    const { manager, refresh } = make({
      store: loggingTokenStore(pair({ accessTokenExpiresAt: new Date(NOW + 31_000).toISOString() })),
    });

    expect(await manager.accessToken()).toBe('access-1');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not guess when the expiry is unknown or unreadable', async () => {
    for (const accessTokenExpiresAt of [null, 'not a date']) {
      const { manager, refresh } = make({ store: loggingTokenStore(pair({ accessTokenExpiresAt })) });

      expect(await manager.accessToken()).toBe('access-1');
      expect(refresh).not.toHaveBeenCalled();
    }
  });

  it('still sends the old token when the early renewal gets no answer (the server may still accept it)', async () => {
    const expiring = pair({ accessTokenExpiresAt: new Date(NOW + 5_000).toISOString() });
    const { manager } = make({ store: loggingTokenStore(expiring), refresh: async () => Promise.reject(network()) });

    expect(await manager.accessToken()).toBe('access-1');
  });

  it('gives no token when the early renewal ends the session', async () => {
    const expiring = pair({ accessTokenExpiresAt: new Date(NOW - 1_000).toISOString() });
    const { manager } = make({
      store: loggingTokenStore(expiring),
      refresh: async () => Promise.reject(unauthenticated()),
    });

    expect(await manager.accessToken()).toBeNull();
  });
});
