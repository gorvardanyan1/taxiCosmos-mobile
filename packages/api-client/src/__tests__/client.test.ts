import { ApiRequestError, fieldError, getApiError, retryAfterSecondsOf } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';

import { isAbortError } from '../transport';
import {
  createMemoryKeyValueStorage,
  createMemoryOperationStore,
  createMemoryTokenStore,
  createStorageOperationStore,
  type OperationStore,
} from '../storage';
import { BASE_URL, empty, makeClient, ok, pair, replyWith, sessionPayload } from './helpers';

const unauthenticated = replyWith(fixtures.errorUnauthenticated);
const refreshed = (n: number) =>
  ok(
    sessionPayload({
      access_token: `access-${n}`,
      refresh_token: `refresh-${n}`,
      access_token_expires_at: '2099-01-01T00:00:00+00:00',
    }),
  );
const caught = async (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

describe('request basics', () => {
  it('calls /api/v1 on the configured origin with the bearer token, JSON accept and the interface language', async () => {
    const { client, server } = makeClient([ok({ user: { id: 1 } })], {
      baseUrl: `${BASE_URL}/`,
      getLocale: () => 'hy',
    });
    await client.get('/me', { query: { page: 2 } });

    expect(server.requests[0]).toMatchObject({
      method: 'GET',
      url: `${BASE_URL}/api/v1/me?page=2`,
      headers: { authorization: 'Bearer access-1', accept: 'application/json', 'accept-language': 'hy' },
    });
  });

  it('sends no Authorization header for the sign-in calls and none when signed out', async () => {
    const withoutAuth = makeClient([ok({}, 202)]);
    await withoutAuth.client.post('/auth/otp/request', { auth: false, body: { phone: '+37491234567', app: 'rider' } });
    const signedOut = makeClient([ok({})], { signedIn: null });
    await signedOut.client.get('/geo/reverse');

    expect(withoutAuth.server.requests[0]?.headers.authorization).toBeUndefined();
    expect(signedOut.server.requests[0]?.headers.authorization).toBeUndefined();
  });

  it('does not send an Accept-Language header when no language provider is configured', async () => {
    const { client, server } = makeClient([ok({})]);
    await client.get('/me');

    expect(server.requests[0]?.headers['accept-language']).toBeUndefined();
  });

  it('puts no idempotency key on a read', async () => {
    const { client, server } = makeClient([ok({})]);
    const response = await client.get('/me');

    expect(server.requests[0]?.headers['idempotency-key']).toBeUndefined();
    expect(response.idempotencyKey).toBeNull();
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'puts a time-ordered UUID v7 Idempotency-Key on every %s',
    async (method) => {
      const { client, server } = makeClient([ok({})], { newKey: undefined as never });
      const response = await client[method]('/x');

      expect(server.requests[0]?.headers['idempotency-key']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(response.idempotencyKey).toBe(server.requests[0]?.headers['idempotency-key']);
    },
  );

  it('honours a key the caller made', async () => {
    const { client, server } = makeClient([ok({})]);
    await client.post('/x', { idempotencyKey: 'caller-key-123' });

    expect(server.requests[0]?.headers['idempotency-key']).toBe('caller-key-123');
  });

  it("passes a screen's cancel through as an AbortError, never as an API error", async () => {
    const controller = new AbortController();
    const { client } = makeClient(['hang']);
    const pending = caught(client.get('/me', { signal: controller.signal }));
    await Promise.resolve();
    controller.abort();
    const error = await pending;

    expect(isAbortError(error)).toBe(true);
  });

  it('applies the per-call time limit', async () => {
    jest.useFakeTimers();
    try {
      const { client } = makeClient(['hang']);
      const pending = caught(client.get('/me', { timeoutMs: 3_000 }));
      await jest.advanceTimersByTimeAsync(3_001);

      expect(getApiError(await pending)).toMatchObject({ kind: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('an expired token is renewed once, transparently', () => {
  it('retries the refused request after a refresh, with the new token, and the caller sees only the success', async () => {
    const { client, server, tokens } = makeClient([unauthenticated, refreshed(2), ok({ user: { id: 1 } })]);
    const response = await client.get<{ user: { id: number } }>('/me');

    expect(response.data).toEqual({ user: { id: 1 } });
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /me', 'POST /auth/refresh', 'GET /me']);
    expect(server.requests[0]?.headers.authorization).toBe('Bearer access-1');
    expect(server.requests[1]?.body).toEqual({ refresh_token: 'refresh-1' });
    expect(server.requests[1]?.headers.authorization).toBeUndefined();
    expect(server.requests[2]?.headers.authorization).toBe('Bearer access-2');
    expect(tokens.log).toContain('write:access-2');
  });

  it('sends the retried write with the same Idempotency-Key as the refused one', async () => {
    const { client, server } = makeClient([unauthenticated, refreshed(2), ok({ data: { id: 9 } }, 201)]);
    await client.post('/support-tickets', { body: { subject: 'x' } });

    expect(server.requests[2]?.headers['idempotency-key']).toBe(server.requests[0]?.headers['idempotency-key']);
    expect(server.requests[0]?.headers['idempotency-key']).toBeDefined();
  });

  it('causes one refresh when five requests are refused at the same time', async () => {
    const script = [
      ...Array.from({ length: 5 }, () => unauthenticated),
      refreshed(2),
      ...Array.from({ length: 5 }, (_, n) => ok({ n })),
    ];
    const { client, server } = makeClient(script);
    const answers = await Promise.all(Array.from({ length: 5 }, (_, n) => client.get<{ n: number }>(`/resource-${n}`)));

    expect(server.requests.filter((r) => r.path === '/auth/refresh')).toHaveLength(1);
    expect(answers).toHaveLength(5);
    expect(server.requests.filter((r) => r.headers.authorization === 'Bearer access-2')).toHaveLength(5);
  });

  it('does not renew again for a slow request that is refused with a token another request already replaced', async () => {
    const releaseSlow: { current: (response: Response) => void } = { current: () => undefined };
    const seen: string[] = [];
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const fetchStub = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname.replace('/api/v1', '');
      const bearer = new Headers(init?.headers).get('authorization');
      seen.push(`${path}|${bearer ?? '-'}`);

      if (path === '/auth/refresh') {
        return json(
          200,
          sessionPayload({
            access_token: 'access-2',
            refresh_token: 'refresh-2',
            access_token_expires_at: '2099-01-01T00:00:00+00:00',
          }),
        );
      }

      if (bearer === 'Bearer access-2') {
        return json(200, { path });
      }

      // Everything sent with the old token is refused; /slow is held back until the session was renewed.
      return path === '/slow'
        ? new Promise<Response>((resolve) => (releaseSlow.current = resolve))
        : json(401, { message: 'Unauthenticated.' });
    }) as unknown as typeof fetch;

    const { client } = makeClient([], { fetch: fetchStub });
    const slow = client.get<{ path: string }>('/slow');
    await client.get('/fast');
    releaseSlow.current(json(401, { message: 'Unauthenticated.' }));

    await expect(slow).resolves.toMatchObject({ data: { path: '/slow' } });
    expect(seen.filter((entry) => entry.startsWith('/auth/refresh'))).toHaveLength(1);
    expect(seen).toContain('/slow|Bearer access-2');
  });

  it('asks for a refresh a second time only if the second request is refused too, and then ends the session', async () => {
    const onSessionEnded = jest.fn();
    const { client, server, tokens } = makeClient([unauthenticated, refreshed(2), unauthenticated], { onSessionEnded });
    const error = await caught(client.get('/me'));

    expect(getApiError(error)).toMatchObject({ kind: 'unauthenticated' });
    expect(server.requests.filter((r) => r.path === '/auth/refresh')).toHaveLength(1);
    expect(onSessionEnded).toHaveBeenCalledWith('unauthorized');
    expect(tokens.log.at(-1)).toBe('clear');
  });

  it('ends the session and reports "unauthenticated" when the server refuses the refresh token', async () => {
    const onSessionEnded = jest.fn();
    const { client, tokens } = makeClient(
      [unauthenticated, { status: 401, body: { message: 'The session has ended. Please sign in again.' } }],
      { onSessionEnded },
    );
    const error = await caught(client.get('/me'));

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(getApiError(error)).toMatchObject({ kind: 'unauthenticated', status: 401 });
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
    expect(onSessionEnded).toHaveBeenCalledWith('refresh_rejected');
    expect(tokens.log).toContain('clear');
    expect(client.session.isSignedIn).toBe(false);
  });

  it('keeps the session and surfaces the network error when the connection drops during the refresh', async () => {
    const onSessionEnded = jest.fn();
    const { client, tokens } = makeClient([unauthenticated, 'network-error'], { onSessionEnded });
    const error = await caught(client.get('/me'));

    expect(getApiError(error)).toMatchObject({ kind: 'network' });
    expect(onSessionEnded).not.toHaveBeenCalled();
    expect(tokens.log).not.toContain('clear');
    expect(client.session.isSignedIn).toBe(true);
  });

  it('never tries to refresh for a call that carries no bearer token (the sign-in endpoints)', async () => {
    const { client, server } = makeClient([
      { status: 401, body: { message: 'The sign-in token could not be verified.' } },
    ]);
    const error = await caught(client.post('/auth/social/google', { auth: false, body: {} }));

    expect(getApiError(error)).toMatchObject({
      kind: 'unauthenticated',
      message: 'The sign-in token could not be verified.',
    });
    expect(server.requests).toHaveLength(1);
  });

  it('never tries to refresh when there is no session', async () => {
    const { client, server } = makeClient([unauthenticated], { signedIn: null });
    const error = await caught(client.get('/me'));

    expect(getApiError(error)).toMatchObject({ kind: 'unauthenticated' });
    expect(server.requests).toHaveLength(1);
  });

  it('renews a token that is about to expire before sending, so the request is never refused', async () => {
    const expiring = pair({ accessTokenExpiresAt: new Date(Date.now() + 5_000).toISOString() });
    const { client, server } = makeClient([refreshed(2), ok({ n: 1 })], { signedIn: expiring });
    await client.get('/me');

    expect(server.requests.map((r) => r.path)).toEqual(['/auth/refresh', '/me']);
    expect(server.requests[1]?.headers.authorization).toBe('Bearer access-2');
  });

  it('does not treat a 403 as a reason to refresh', async () => {
    const { client, server } = makeClient([replyWith(fixtures.errorDriverNotVerified)]);
    const error = await caught(client.post('/driver/availability', { body: { availability: 'online' } }));

    expect(getApiError(error)).toMatchObject({ kind: 'forbidden', code: 'driver_not_verified' });
    expect(server.requests).toHaveLength(1);
  });
});

describe('a write retried after a dropped connection reuses the same idempotency key', () => {
  it('within one call: the extra attempts of a request that asked for retries carry the same key', async () => {
    const { client, server, sleeps } = makeClient([
      'network-error',
      { status: 503, body: { message: 'Server Error' } },
      ok({ data: { id: 1 } }, 201),
    ]);
    const response = await client.post('/support-tickets', { body: { subject: 'x' }, retries: 2 });
    const keys = server.requests.map((r) => r.headers['idempotency-key']);

    expect(response.status).toBe(201);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBeDefined();
    expect(sleeps).toEqual([500, 1000]);
  });

  it('across calls: an action named by `operation` keeps its key until the server accepts it', async () => {
    const { client, server } = makeClient(['network-error', ok({ data: { id: 1 } }, 201)]);
    const first = await caught(
      client.post('/support-tickets', { body: { subject: 'x' }, operation: 'ticket:draft-1' }),
    );
    const second = await client.post('/support-tickets', { body: { subject: 'x' }, operation: 'ticket:draft-1' });

    expect(getApiError(first)).toMatchObject({ kind: 'network' });
    expect((first as ApiRequestError).idempotencyKey).toBe(server.requests[0]?.headers['idempotency-key']);
    expect(server.requests[1]?.headers['idempotency-key']).toBe(server.requests[0]?.headers['idempotency-key']);
    expect(second.replayed).toBe(false);
  });

  it('survives the app being closed: a new client over the same stored records sends the same key', async () => {
    const operations = createMemoryOperationStore();
    const tokens = createMemoryTokenStore(pair());
    const before = makeClient(['network-error'], { operations, tokens });
    await caught(before.client.post('/trips', { operation: 'trip:draft-5' }));
    const after = makeClient([ok({ data: { id: 5 } }, 201)], { operations, tokens });
    await after.client.post('/trips', { operation: 'trip:draft-5' });

    expect(after.server.requests[0]?.headers['idempotency-key']).toBe(
      before.server.requests[0]?.headers['idempotency-key'],
    );
  });

  it('keeps the key after a server failure and after a throttle: the action may or may not have been applied', async () => {
    const { client, server } = makeClient([
      { status: 500, body: {} },
      replyWith(fixtures.errorRateLimited),
      ok({}, 201),
    ]);
    await caught(client.post('/x', { operation: 'op' }));
    await caught(client.post('/x', { operation: 'op' }));
    await client.post('/x', { operation: 'op' });

    expect(new Set(server.requests.map((r) => r.headers['idempotency-key'])).size).toBe(1);
  });

  it('starts a new action with a new key after a final refusal (the input was wrong)', async () => {
    const { client, server } = makeClient([replyWith(fixtures.errorValidation), ok({}, 201)]);
    await caught(client.post('/x', { operation: 'op', body: { a: 1 } }));
    await client.post('/x', { operation: 'op', body: { a: 2 } });

    expect(server.requests[1]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('gives different actions different keys', async () => {
    const { client, server } = makeClient([ok({}, 201), ok({}, 201)]);
    await client.post('/x', { operation: 'a' });
    await client.post('/x', { operation: 'b' });

    expect(server.requests[0]?.headers['idempotency-key']).not.toBe(server.requests[1]?.headers['idempotency-key']);
  });

  it('forgets an old record: after the retention time the same name is a new action', async () => {
    let now = 1_000_000;
    const operations = createMemoryOperationStore();
    const { client, server } = makeClient(['network-error', ok({}, 201)], {
      operations,
      now: () => now,
      operationTtlMs: 60_000,
    });
    await caught(client.post('/x', { operation: 'op' }));
    now += 61_000;
    await client.post('/x', { operation: 'op' });

    expect(server.requests[1]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it("never leaves the server's answers of a successful action pending: the record is marked as succeeded", async () => {
    const operations = createMemoryOperationStore();
    const { client } = makeClient([ok({ data: { id: 1 } }, 201)], { operations });
    const response = await client.post('/x', { operation: 'op' });

    expect(await operations.get('op')).toMatchObject({
      key: response.idempotencyKey,
      state: 'succeeded',
      response: { status: 201, data: { data: { id: 1 } } },
    });
  });
});

describe('a signed-out person leaves no actions behind on the device', () => {
  /** Operation records live on a storage we can look into. */
  function lookable() {
    const storage = createMemoryKeyValueStorage();

    return {
      storage,
      operations: createStorageOperationStore(storage),
      keys: async () => await storage.getItem('taxikosmos.operation.index'),
    };
  }

  it('signing out removes the stored answers of finished actions (they can hold names, addresses and bank details)', async () => {
    const { operations, keys, storage } = lookable();
    const { client } = makeClient([ok({ data: { holder: 'Private Name' } }, 201), empty()], { operations });
    await client.post('/driver/bank-accounts', { operation: 'bank:1' });
    expect(await keys()).not.toBeNull();

    await client.session.clear();

    expect(await keys()).toBeNull();
    expect(await storage.getItem('taxikosmos.operation.bank_3a_1')).toBeNull();
  });

  it('the server ending the session does the same', async () => {
    const { operations, keys } = lookable();
    const { client } = makeClient(
      [
        ok({}, 201),
        unauthenticated,
        { status: 401, body: { message: 'The session has ended. Please sign in again.' } },
      ],
      { operations },
    );
    await client.post('/x', { operation: 'op' });
    await caught(client.get('/me'));

    expect(client.session.isSignedIn).toBe(false);
    expect(await keys()).toBeNull();
  });

  it("a new sign-in forgets the previous person's actions", async () => {
    const { operations, keys } = lookable();
    const { client } = makeClient([ok({}, 201)], { operations });
    await client.post('/x', { operation: 'op' });
    expect(await keys()).not.toBeNull();

    await client.session.start(sessionPayload());

    expect(await keys()).toBeNull();
  });

  it('records left by an earlier run are removed when the app starts and finds nobody signed in', async () => {
    const { operations, keys } = lookable();
    await operations.set('leftover', {
      key: 'k',
      state: 'succeeded',
      createdAt: Date.now(),
      response: { status: 201, data: { holder: 'Private Name' } },
    });
    const { client } = makeClient([], { operations, signedIn: null });
    await client.session.load();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await keys()).toBeNull();
  });

  it('keeps them while the same person stays signed in, also across an app restart', async () => {
    const { operations, keys } = lookable();
    const tokens = createMemoryTokenStore(pair());
    const first = makeClient([ok({}, 201)], { operations, tokens });
    await first.client.post('/x', { operation: 'op' });
    const second = makeClient([], { operations, tokens });
    await second.client.session.load();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await keys()).not.toBeNull();
  });

  it('an action that finishes after the person signed out does not write its answer back', async () => {
    const { operations, keys } = lookable();
    let release: (response: Response) => void = () => undefined;
    const slow = jest.fn(() => new Promise<Response>((resolve) => (release = resolve))) as unknown as typeof fetch;
    const { client } = makeClient([], { operations, fetch: slow });
    const pending = client.post('/driver/bank-accounts', { operation: 'bank:2' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await client.session.clear();
    release(new Response(JSON.stringify({ data: { holder: 'Private Name' } }), { status: 201 }));
    await pending;

    expect(await keys()).toBeNull();
  });
});

describe('a failing store never changes what the request does', () => {
  type Failure = 'read' | 'write-pending' | 'write-succeeded' | 'delete' | 'all';

  /** An operation store that behaves like a locked or damaged keychain for the chosen calls. */
  function brokenStore(failures: Failure[]): OperationStore {
    const broken = (kind: Failure) => failures.includes(kind) || failures.includes('all');
    const refuse = async (): Promise<never> => Promise.reject(new Error('keychain unavailable'));

    return {
      get: async () => (broken('read') ? refuse() : null),
      set: async (_operation, record) =>
        broken(record.state === 'pending' ? 'write-pending' : 'write-succeeded') ? refuse() : undefined,
      delete: async () => (broken('delete') ? refuse() : undefined),
      clear: async () => (broken('all') ? refuse() : undefined),
    };
  }

  it.each(['read', 'write-pending', 'write-succeeded', 'all'] as const)(
    'sends the request once and returns the real answer when the store fails (%s)',
    async (failure) => {
      const { client, server } = makeClient([ok({ data: { id: 1 } }, 201)], { operations: brokenStore([failure]) });
      const response = await client.post<{ data: { id: number } }>('/driver/vehicles', { operation: 'vehicle:1' });

      expect(response).toMatchObject({ status: 201, data: { data: { id: 1 } }, replayed: false });
      expect(server.requests).toHaveLength(1);
    },
  );

  it('does not report an action the server accepted as failed just because its record could not be saved (no duplicate vehicle on retry)', async () => {
    const { client, server } = makeClient([ok({ data: { id: 1 } }, 201), ok({ data: { id: 2 } }, 201)], {
      operations: brokenStore(['write-succeeded']),
    });
    const first = await client.post('/driver/vehicles', { operation: 'vehicle:1' });
    const again = await client.post('/driver/vehicles', { operation: 'vehicle:1' });

    // The answer of the first call is remembered for this run even though the store refused it: the repeat is not sent.
    expect(first.replayed).toBe(false);
    expect(again.replayed).toBe(true);
    expect(server.requests).toHaveLength(1);
  });

  it('still reuses the key for a retry in the same run when nothing can be stored', async () => {
    const { client, server } = makeClient(['network-error', ok({ data: { id: 1 } }, 201)], {
      operations: brokenStore(['all']),
    });
    const failed = await caught(client.post('/support-tickets', { operation: 'ticket:1' }));
    await client.post('/support-tickets', { operation: 'ticket:1' });

    expect(getApiError(failed)).toMatchObject({ kind: 'network' });
    expect(server.requests[1]?.headers['idempotency-key']).toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('still lets a final refusal end the action when the store cannot delete it', async () => {
    const { client, server } = makeClient([replyWith(fixtures.errorValidation), ok({}, 201)], {
      operations: brokenStore(['delete']),
    });
    const refused = await caught(client.post('/x', { operation: 'op' }));
    await client.post('/x', { operation: 'op' });

    expect(getApiError(refused)).toMatchObject({ kind: 'validation' });
    expect(server.requests[1]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it("keeps reporting real failures as API errors, never as the store's own error", async () => {
    const { client } = makeClient([replyWith(fixtures.errorRateLimited)], { operations: brokenStore(['all']) });
    const error = await caught(client.post('/x', { operation: 'op' }));

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(getApiError(error)).toMatchObject({ kind: 'rate_limited' });
  });

  it('forgets the in-memory copies at sign-out too, even when the store fails', async () => {
    const { client, server } = makeClient([ok({ data: { id: 1 } }, 201), empty(), ok({ data: { id: 2 } }, 201)], {
      operations: brokenStore(['all']),
    });
    await client.post('/driver/vehicles', { operation: 'vehicle:1' });
    await client.session.clear();
    await client.session.start(sessionPayload());
    const next = await client.post('/driver/vehicles', { operation: 'vehicle:1' });

    expect(next.replayed).toBe(false);
    expect(server.requests.filter((r) => r.path === '/driver/vehicles')).toHaveLength(2);
  });

  it('does not reuse an in-memory copy older than the repeat window', async () => {
    let now = 1_000_000;
    const { client, server } = makeClient(['network-error', ok({}, 201)], {
      operations: brokenStore(['all']),
      now: () => now,
      operationTtlMs: 60_000,
    });
    await caught(client.post('/x', { operation: 'old' }));
    now += 61_000;
    await client.post('/x', { operation: 'old' });

    expect(server.requests[1]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('keeps at most fifty actions in memory, the newest ones, so a long session cannot grow it without end', async () => {
    const script = [
      'network-error' as const,
      ...Array.from({ length: 50 }, () => ok({}, 201)),
      ok({}, 201),
      ok({}, 201),
    ];
    const { client, server } = makeClient(script, { operations: brokenStore(['all']) });
    await caught(client.post('/x', { operation: 'first' }));
    for (let n = 0; n < 50; n++) {
      await client.post('/x', { operation: `other-${n}` });
    }

    // The first action was pushed out: it starts again with a new key. The most recent one is still remembered.
    await client.post('/x', { operation: 'first' });
    const recent = await client.post('/x', { operation: 'other-49' });

    expect(server.requests[51]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
    expect(recent.replayed).toBe(true);
  });
});

describe("a store that works but fails one call never makes an old record win over this run's knowledge", () => {
  /** A store that keeps data like the real one, but refuses one kind of call. */
  function partlyBroken(refuse: 'set-succeeded' | 'delete'): OperationStore {
    const inner = createMemoryOperationStore();
    const refused = (): Promise<never> => Promise.reject(new Error('keychain unavailable'));

    return {
      get: (operation) => inner.get(operation),
      set: (operation, record) =>
        refuse === 'set-succeeded' && record.state === 'succeeded' ? refused() : inner.set(operation, record),
      delete: (operation) => (refuse === 'delete' ? refused() : inner.delete(operation)),
      clear: () => inner.clear(),
    };
  }

  it('an accepted action whose record could not be saved is not sent again when the user taps again (no duplicate on a backend that does not dedupe)', async () => {
    const { client, server } = makeClient([ok({ data: { id: 1 } }, 201), ok({ data: { id: 2 } }, 201)], {
      operations: partlyBroken('set-succeeded'),
    });
    const first = await client.post('/driver/vehicles', { operation: 'vehicle:1' });
    const again = await client.post('/driver/vehicles', { operation: 'vehicle:1' });

    expect(server.requests).toHaveLength(1);
    expect(again).toMatchObject({ replayed: true, data: first.data });
  });

  it('a refused input whose record could not be deleted gets a new key for the corrected input', async () => {
    const { client, server } = makeClient([replyWith(fixtures.errorValidation), ok({}, 201)], {
      operations: partlyBroken('delete'),
    });
    const refused = await caught(client.post('/x', { operation: 'op', body: { a: 1 } }));
    await client.post('/x', { operation: 'op', body: { a: 2 } });

    expect(getApiError(refused)).toMatchObject({ kind: 'validation' });
    expect(server.requests[1]?.headers['idempotency-key']).not.toBe(server.requests[0]?.headers['idempotency-key']);
  });

  it('after the app restarts the store is asked, so an unfinished action keeps its key', async () => {
    const operations = createMemoryOperationStore();
    const tokens = createMemoryTokenStore(pair());
    const before = makeClient(['network-error'], { operations, tokens });
    await caught(before.client.post('/x', { operation: 'op' }));
    const after = makeClient([ok({}, 201)], { operations, tokens });
    await after.client.post('/x', { operation: 'op' });

    expect(after.server.requests[0]?.headers['idempotency-key']).toBe(
      before.server.requests[0]?.headers['idempotency-key'],
    );
  });

  it('an ended action stays ended for the rest of the run even though its record is still in the store', async () => {
    const operations = partlyBroken('delete');
    const tokens = createMemoryTokenStore(pair());
    const run = makeClient([replyWith(fixtures.errorValidation), 'network-error'], { operations, tokens });
    await caught(run.client.post('/x', { operation: 'op' }));
    await caught(run.client.post('/x', { operation: 'op' }));
    expect(run.server.requests[1]?.headers['idempotency-key']).not.toBe(
      run.server.requests[0]?.headers['idempotency-key'],
    );
  });
});

describe('an action that already succeeded does not go out again', () => {
  it('returns the stored answer for a repeat of the same action without a second request', async () => {
    const { client, server } = makeClient([ok({ data: { id: 1 } }, 201)]);
    const first = await client.post('/trips', { operation: 'trip:draft-1' });
    const second = await client.post('/trips', { operation: 'trip:draft-1' });

    expect(server.requests).toHaveLength(1);
    expect(second).toMatchObject({
      status: 201,
      data: { data: { id: 1 } },
      replayed: true,
      idempotencyKey: first.idempotencyKey,
    });
  });

  it('shares one request between a double tap: two starts at once send one request and give both callers the answer', async () => {
    const { client, server } = makeClient([ok({ data: { id: 1 } }, 201)]);
    const [a, b] = await Promise.all([
      client.post('/trips', { operation: 'trip:draft-2' }),
      client.post('/trips', { operation: 'trip:draft-2' }),
    ]);

    expect(server.requests).toHaveLength(1);
    expect(a.data).toEqual(b.data);
  });

  it('lets the next attempt through once a shared request failed', async () => {
    const { client, server } = makeClient([replyWith(fixtures.errorValidation), ok({}, 201)]);
    const [a, b] = await Promise.all([
      caught(client.post('/x', { operation: 'op' })),
      caught(client.post('/x', { operation: 'op' })),
    ]);
    await client.post('/x', { operation: 'op' });

    expect(getApiError(a)).toMatchObject({ kind: 'validation' });
    expect(getApiError(b)).toMatchObject({ kind: 'validation' });
    expect(server.requests).toHaveLength(2);
  });

  it('repeats a read every time: only writes are remembered', async () => {
    const { client, server } = makeClient([ok({ n: 1 }), ok({ n: 2 })]);
    await client.get('/me', { operation: 'ignored-for-reads' });
    const again = await client.get<{ n: number }>('/me', { operation: 'ignored-for-reads' });

    expect(server.requests).toHaveLength(2);
    expect(again.data.n).toBe(2);
  });

  it('copes with an operation store that has lost its data: this run still remembers, a restart starts the action again', async () => {
    const forgetful: OperationStore = {
      get: async () => null,
      set: async () => undefined,
      delete: async () => undefined,
      clear: async () => undefined,
    };
    const tokens = createMemoryTokenStore(pair());
    const run = makeClient([ok({}, 201)], { operations: forgetful, tokens });
    await run.client.post('/x', { operation: 'op' });
    const repeat = await run.client.post('/x', { operation: 'op' });
    expect(repeat.replayed).toBe(true);
    expect(run.server.requests).toHaveLength(1);

    // After a restart there is no memory of it and the store forgot too: the action is sent again, with a new key.
    const restarted = makeClient([ok({}, 201)], { operations: forgetful, tokens });
    await restarted.client.post('/x', { operation: 'op' });
    expect(restarted.server.requests).toHaveLength(1);
    expect(restarted.server.requests[0]?.headers['idempotency-key']).toBeDefined();
  });
});

describe('errors reach the caller as the tagged union', () => {
  it('422: the field messages, and nothing was sent twice', async () => {
    const { client, server } = makeClient([replyWith(fixtures.errorValidation)]);
    const error = await caught(client.post('/trips/fare-estimate', { body: { pickup: { lat: 40, lng: 44 } } }));

    expect(fieldError(error, 'dropoff')).toBe('The dropoff field is required.');
    expect(fieldError(error, 'dropoff.lat')).toBe('The dropoff.lat field is required.');
    expect(server.requests).toHaveLength(1);
  });

  it('429: the retry delay in seconds', async () => {
    const { client } = makeClient([replyWith(fixtures.errorRateLimited)]);

    expect(retryAfterSecondsOf(await caught(client.post('/auth/otp/request', { auth: false })))).toBe(60);
  });

  it('403 with a code, 404 and 5xx: the kinds the screens switch on', async () => {
    const { client } = makeClient([
      replyWith(fixtures.errorDriverNotVerified),
      replyWith(fixtures.errorNotFound),
      { status: 503, body: { message: 'Down' } },
    ]);

    expect(getApiError(await caught(client.get('/a')))).toMatchObject({
      kind: 'forbidden',
      code: 'driver_not_verified',
    });
    expect(getApiError(await caught(client.get('/b')))).toMatchObject({ kind: 'not_found', message: null });
    expect(getApiError(await caught(client.get('/c')))).toMatchObject({ kind: 'server', status: 503 });
  });

  it('409: the body of the answer, so a screen can resync from the resource it carries', async () => {
    const { client } = makeClient([
      { status: 409, body: { message: 'The trip already started.', trip: { id: 3, status: 'in_progress' } } },
    ]);
    const error = getApiError(await caught(client.post('/driver/trips/3/start')));

    expect(error).toMatchObject({ kind: 'conflict', body: { trip: { id: 3, status: 'in_progress' } } });
  });

  it('attaches the idempotency key of the failed request to the error', async () => {
    const { client } = makeClient(['network-error']);
    const error = await caught(client.post('/x'));

    expect((error as ApiRequestError).idempotencyKey).toMatch(/^key-/);
  });
});

describe('automatic extra attempts', () => {
  it('retries a read after a server failure with a growing pause, and stops at the limit', async () => {
    const { client, server, sleeps } = makeClient([
      { status: 502, body: {} },
      { status: 502, body: {} },
      { status: 502, body: {} },
    ]);
    const error = await caught(client.get('/me', { retries: 2 }));

    expect(getApiError(error)).toMatchObject({ kind: 'server' });
    expect(server.requests).toHaveLength(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it('caps the pause', async () => {
    const { client, sleeps } = makeClient(Array.from({ length: 8 }, () => ({ status: 500, body: {} })));
    await caught(client.get('/me', { retries: 7 }));

    expect(Math.max(...sleeps)).toBe(8_000);
  });

  it('does not retry an answer that will not change: a 422, a 404 or a 403', async () => {
    const { client, server } = makeClient([replyWith(fixtures.errorValidation)]);
    await caught(client.get('/me', { retries: 3 }));

    expect(server.requests).toHaveLength(1);
  });

  it('does not retry at all by default, so a write never repeats on its own', async () => {
    const { client, server } = makeClient(['network-error']);
    await caught(client.post('/trips'));

    expect(server.requests).toHaveLength(1);
  });

  it('does not retry a throttled request: the server said to wait', async () => {
    const { client, server } = makeClient([replyWith(fixtures.errorRateLimited)]);
    await caught(client.get('/me', { retries: 3 }));

    expect(server.requests).toHaveLength(1);
  });
});

describe('an upload', () => {
  it('goes out as multipart without a hand-made content type', async () => {
    const form = new FormData();
    form.append('type', 'license');
    const { client, server } = makeClient([empty()]);
    await client.post('/driver/documents', { body: form });

    expect(server.requests[0]?.body).toBe(form);
    expect(server.requests[0]?.headers['content-type']).toBeUndefined();
  });
});
