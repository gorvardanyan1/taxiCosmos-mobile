import {
  createMemoryKeyValueStorage,
  createMemoryTokenStore,
  createStorageOperationStore,
  getOrCreateDeviceId,
  pairFromSession,
  parseStoredPair,
  safeStorageKey,
  type KeyValueStorage,
  type OperationRecord,
} from '../storage';
import { pair, sessionPayload } from './helpers';

describe('token pairs', () => {
  it('takes the tokens and the expiry from a sign-in answer', () => {
    expect(
      pairFromSession(
        sessionPayload({ access_token: 'a', refresh_token: 'r', access_token_expires_at: '2026-10-16T11:00:00+00:00' }),
      ),
    ).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      accessTokenExpiresAt: '2026-10-16T11:00:00+00:00',
    });
  });

  it('reads back exactly what was written', () => {
    expect(parseStoredPair(JSON.stringify(pair()))).toEqual(pair());
    expect(parseStoredPair(JSON.stringify(pair({ accessTokenExpiresAt: null })))).toEqual(
      pair({ accessTokenExpiresAt: null }),
    );
  });

  it.each([
    null,
    '',
    'not json',
    'null',
    '[]',
    '"text"',
    '{}',
    JSON.stringify({ accessToken: 'a' }),
    JSON.stringify({ accessToken: '', refreshToken: 'r', accessTokenExpiresAt: null }),
    JSON.stringify({ accessToken: 'a', refreshToken: 5, accessTokenExpiresAt: null }),
    JSON.stringify({ accessToken: 'a', refreshToken: 'r', accessTokenExpiresAt: 7 }),
  ])('treats %p as "no session" rather than trusting it', (raw) => {
    expect(parseStoredPair(raw)).toBeNull();
  });

  it('keeps a pair in memory, and forgets it', async () => {
    const store = createMemoryTokenStore();
    expect(await store.read()).toBeNull();
    await store.write(pair());
    expect(await store.read()).toEqual(pair());
    await store.clear();
    expect(await store.read()).toBeNull();
  });
});

describe('safeStorageKey', () => {
  it('leaves letters, digits, dot and dash alone', () => {
    expect(safeStorageKey('taxikosmos.operation-1.A')).toBe('taxikosmos.operation-1.A');
  });

  it('encodes everything the secure store would refuse, including the underscore it uses itself', () => {
    expect(safeStorageKey('ticket:draft 1')).toBe('ticket_3a_draft_20_1');
    expect(safeStorageKey('a_b')).toBe('a_5f_b');
    expect(safeStorageKey('Բ')).toBe('_532_');
  });

  it('never gives two different names the same key', () => {
    const names = ['a_b', 'a:b', 'a b', 'a_5f_b', 'a:b_', 'a_3a_b', 'ab'];

    expect(new Set(names.map(safeStorageKey)).size).toBe(names.length);
    expect(names.map(safeStorageKey).every((key) => /^[A-Za-z0-9._-]+$/.test(key))).toBe(true);
  });
});

describe('createStorageOperationStore', () => {
  const record: OperationRecord = {
    key: 'key-00000001',
    state: 'succeeded',
    createdAt: 1_000,
    response: { status: 201, data: { data: { id: 1 } } },
  };

  it('stores a record under a safe key and reads it back', async () => {
    const storage = createMemoryKeyValueStorage();
    const store = createStorageOperationStore(storage);
    await store.set('ticket:draft-1', record);

    expect(await storage.getItem('taxikosmos.operation.ticket_3a_draft-1')).not.toBeNull();
    expect(await store.get('ticket:draft-1')).toEqual(record);
    expect(await store.get('ticket:other')).toBeNull();
  });

  it('deletes a record', async () => {
    const store = createStorageOperationStore(createMemoryKeyValueStorage());
    await store.set('op', record);
    await store.delete('op');

    expect(await store.get('op')).toBeNull();
  });

  it.each([
    'not json',
    'null',
    JSON.stringify({ key: 1 }),
    JSON.stringify({ key: 'k', state: 'weird', createdAt: 1 }),
    JSON.stringify({ key: 'k', state: 'pending' }),
  ])('forgets a damaged record (%p) instead of trusting it', async (raw) => {
    const storage = createMemoryKeyValueStorage();
    const store = createStorageOperationStore(storage);
    await storage.setItem('taxikosmos.operation.op', raw);

    expect(await store.get('op')).toBeNull();
    expect(await storage.getItem('taxikosmos.operation.op')).toBeNull();
  });

  it('keeps the key (the part that prevents a duplicate) when the platform refuses the stored answer as too large', async () => {
    const written: string[] = [];
    const picky: KeyValueStorage = {
      getItem: async () => null,
      removeItem: async () => undefined,
      setItem: async (_key, value) => {
        if (value.length > 100) throw new Error('value too large');
        written.push(value);
      },
    };
    await createStorageOperationStore(picky).set('op', { ...record, response: { status: 201, data: 'x'.repeat(500) } });

    expect(JSON.parse(written[0] as string)).toEqual({ key: 'key-00000001', state: 'succeeded', createdAt: 1_000 });
  });

  it('lets a failure to store a record with no answer through', async () => {
    const broken: KeyValueStorage = {
      getItem: async () => null,
      removeItem: async () => undefined,
      setItem: async () => Promise.reject(new Error('disk full')),
    };

    await expect(
      createStorageOperationStore(broken).set('op', { key: 'k', state: 'pending', createdAt: 1 }),
    ).rejects.toThrow('disk full');
  });
});

describe('getOrCreateDeviceId', () => {
  it('makes an id once and keeps returning it', async () => {
    const storage = createMemoryKeyValueStorage();
    const newId = jest.fn().mockReturnValueOnce('device-id-0001').mockReturnValueOnce('device-id-0002');

    expect(await getOrCreateDeviceId(storage, newId)).toBe('device-id-0001');
    expect(await getOrCreateDeviceId(storage, newId)).toBe('device-id-0001');
    expect(newId).toHaveBeenCalledTimes(1);
  });

  it('replaces a stored value that is too short to be accepted by the server (8 characters minimum)', async () => {
    const storage = createMemoryKeyValueStorage();
    await storage.setItem('taxikosmos.device-id', 'abc');

    expect(await getOrCreateDeviceId(storage, () => 'device-id-0003')).toBe('device-id-0003');
  });
});
