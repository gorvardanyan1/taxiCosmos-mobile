import * as SecureStore from 'expo-secure-store';

import { createAppApi, createSecureKeyValueStorage, createSecureTokenStore } from '../secure-store';
import { ok, pair, scriptedFetch, sessionPayload } from './helpers';

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();

  return {
    AFTER_FIRST_UNLOCK: 1,
    __items: items,
    getItemAsync: jest.fn(async (key: string) => items.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`Invalid key provided to SecureStore: ${key}`);
      items.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});

const items = (SecureStore as unknown as { __items: Map<string, string> }).__items;

beforeEach(() => items.clear());

describe('createSecureTokenStore', () => {
  it('keeps the session in the secure store, available after the first unlock so a locked phone can still work', async () => {
    const store = createSecureTokenStore('driver');
    await store.write(pair());

    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith('taxikosmos.session.driver', JSON.stringify(pair()), {
      keychainAccessible: 1,
    });
    expect(await store.read()).toEqual(pair());
  });

  it('keeps the rider and the driver session apart (both apps can be installed on one phone)', async () => {
    await createSecureTokenStore('rider').write(pair({ accessToken: 'rider-token' }));
    await createSecureTokenStore('driver').write(pair({ accessToken: 'driver-token' }));

    expect((await createSecureTokenStore('rider').read())?.accessToken).toBe('rider-token');
    expect((await createSecureTokenStore('driver').read())?.accessToken).toBe('driver-token');
  });

  it('forgets the session on clear', async () => {
    const store = createSecureTokenStore('rider');
    await store.write(pair());
    await store.clear();

    expect(await store.read()).toBeNull();
    expect(items.size).toBe(0);
  });

  it('reads nothing as signed out, and a damaged value as signed out too', async () => {
    const store = createSecureTokenStore('rider');
    expect(await store.read()).toBeNull();
    items.set('taxikosmos.session.rider', '{"broken');

    expect(await store.read()).toBeNull();
  });
});

describe('createSecureKeyValueStorage', () => {
  it('stores under keys the secure store accepts, even for names with colons', async () => {
    const storage = createSecureKeyValueStorage();
    await storage.setItem('taxikosmos.operation.ticket:draft-1', '{"a":1}');

    expect([...items.keys()]).toEqual(['taxikosmos.operation.ticket_3a_draft-1']);
    expect(await storage.getItem('taxikosmos.operation.ticket:draft-1')).toBe('{"a":1}');
    await storage.removeItem('taxikosmos.operation.ticket:draft-1');
    expect(await storage.getItem('taxikosmos.operation.ticket:draft-1')).toBeNull();
  });
});

describe('createAppApi', () => {
  const make = (script: Parameters<typeof scriptedFetch>[0], extra: { realtimeUrl?: string | null } = {}) => {
    const server = scriptedFetch(script);
    const api = createAppApi({
      app: 'rider',
      baseUrl: 'https://api.example.test',
      realtimeUrl: extra.realtimeUrl ?? null,
      fetch: server.fetch,
    });

    return { api, server };
  };

  it("keeps the session in the secure store under the app's own key", async () => {
    const { api } = make([]);
    await api.client.session.start(sessionPayload({ access_token: 'tok-1', refresh_token: 'ref-1' }));

    expect(items.get('taxikosmos.session.rider')).toContain('tok-1');
    expect(items.get('taxikosmos.session.driver')).toBeUndefined();
  });

  it('answers in the language of the app, and follows a change of language', async () => {
    const { api, server } = make([ok({}), ok({})]);
    await api.client.get('/me');
    api.setLocale('hy');
    await api.client.get('/me');

    expect(api.getLocale()).toBe('hy');
    expect(server.requests.map((r) => r.headers['accept-language'])).toEqual(['en', 'hy']);
  });

  it('remembers an action in the secure store so its key survives a restart (while the same person is signed in)', async () => {
    await createSecureTokenStore('rider').write(pair());
    const first = make(['network-error']);
    await first.api.client.post('/support-tickets', { operation: 'ticket:draft-1' }).catch(() => undefined);
    const second = make([ok({}, 201)]);
    await second.api.client.post('/support-tickets', { operation: 'ticket:draft-1' });

    expect(second.server.requests[0]?.headers['idempotency-key']).toBe(
      first.server.requests[0]?.headers['idempotency-key'],
    );
    expect([...items.keys()].some((key) => key.startsWith('taxikosmos.operation.'))).toBe(true);
  });

  it('leaves nothing of the actions in the secure store once the person signs out', async () => {
    await createSecureTokenStore('rider').write(pair());
    const { api } = make([ok({ data: { holder: 'Private Name' } }, 201)]);
    await api.client.post('/driver/bank-accounts', { operation: 'bank:1' });
    expect([...items.keys()].some((key) => key.startsWith('taxikosmos.operation.'))).toBe(true);

    await api.client.session.clear();

    expect([...items.keys()]).toEqual([]);
  });

  it('polls over REST when there is no realtime address, and uses the socket when there is one', () => {
    expect(make([]).api.realtime.mode).toBe('polling');
    expect(make([], { realtimeUrl: 'wss://realtime.example.test' }).api.realtime.mode).toBe('socket');
  });

  it('gives the same device id every time, made once', async () => {
    const { api } = make([]);
    const first = await api.getDeviceId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await api.getDeviceId()).toBe(first);
    expect(await make([]).api.getDeviceId()).toBe(first);
  });
});
