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
    const written: Record<string, string> = {};
    const picky: KeyValueStorage = {
      getItem: async () => null,
      removeItem: async () => undefined,
      setItem: async (key, value) => {
        if (value.length > 100) throw new Error('value too large');
        written[key] = value;
      },
    };
    await createStorageOperationStore(picky, { now: () => 5_000 }).set('op', {
      ...record,
      response: { status: 201, data: 'x'.repeat(500) },
    });

    expect(JSON.parse(written['taxikosmos.operation.op'] as string)).toEqual({
      key: 'key-00000001',
      state: 'succeeded',
      createdAt: 1_000,
    });
    // The index entry that makes the record deletable on sign-out was written too.
    expect(JSON.parse(written['taxikosmos.operation.index'] as string)).toEqual([['op', 1_000]]);
  });

  it('lets a failure to store a record with no answer through', async () => {
    const broken: KeyValueStorage = {
      getItem: async () => null,
      removeItem: async () => undefined,
      setItem: async () => Promise.reject(new Error('disk full')),
    };

    await expect(
      createStorageOperationStore(broken, { now: () => 5_000 }).set('op', { key: 'k', state: 'pending', createdAt: 1 }),
    ).rejects.toThrow('disk full');
  });
});

describe('createStorageOperationStore: nothing is kept for good', () => {
  const done = (createdAt: number): OperationRecord => ({
    key: `key-${createdAt}`,
    state: 'succeeded',
    createdAt,
    response: { status: 201, data: { holder: 'Private Name' } },
  });
  const keysOf = async (storage: KeyValueStorage & { dump?: () => string[] }) => storage.dump?.() ?? [];

  /** A storage that can list what it holds, which the real secure store cannot. */
  function listingStorage() {
    const inner = createMemoryKeyValueStorage();
    const keys = new Set<string>();

    return {
      getItem: inner.getItem,
      setItem: async (key: string, value: string) => {
        keys.add(key);
        await inner.setItem(key, value);
      },
      removeItem: async (key: string) => {
        keys.delete(key);
        await inner.removeItem(key);
      },
      dump: () => [...keys].sort(),
    };
  }

  it('lists the records in an index, since the secure store cannot list its keys', async () => {
    const storage = listingStorage();
    const store = createStorageOperationStore(storage, { now: () => 5_000 });
    await store.set('ticket:1', done(1_000));
    await store.set('bank:1', done(2_000));

    expect(await keysOf(storage)).toEqual([
      'taxikosmos.operation.bank_3a_1',
      'taxikosmos.operation.index',
      'taxikosmos.operation.ticket_3a_1',
    ]);
  });

  it('clear() deletes every record and the index, so a signed-out person leaves nothing behind', async () => {
    const storage = listingStorage();
    const store = createStorageOperationStore(storage, { now: () => 5_000 });
    await store.set('ticket:1', done(1_000));
    await store.set('bank:1', done(2_000));
    await store.clear();

    expect(await keysOf(storage)).toEqual([]);
    expect(await store.get('ticket:1')).toBeNull();
  });

  it('can finish a clear() that was interrupted', async () => {
    const storage = listingStorage();
    const store = createStorageOperationStore(storage, { now: () => 5_000 });
    await store.set('a', done(1_000));
    await store.set('b', done(2_000));
    // Simulates a crash after the first record was removed but before the index was.
    await storage.removeItem('taxikosmos.operation.a');
    await store.clear();

    expect(await keysOf(storage)).toEqual([]);
  });

  it('deletes records older than the retention time whenever something is written', async () => {
    let now = 10_000_000;
    const storage = listingStorage();
    const store = createStorageOperationStore(storage, { retentionMs: 60_000, now: () => now });
    await store.set('old', done(now));
    now += 61_000;
    await store.set('new', done(now));

    expect(await store.get('old')).toBeNull();
    expect(await store.get('new')).not.toBeNull();
    expect(await keysOf(storage)).toEqual(['taxikosmos.operation.index', 'taxikosmos.operation.new']);
  });

  it('keeps the record being rewritten even when it is the old one (a retry of a long-pending action)', async () => {
    let now = 10_000_000;
    const store = createStorageOperationStore(createMemoryKeyValueStorage(), { retentionMs: 60_000, now: () => now });
    await store.set('op', { key: 'k', state: 'pending', createdAt: now });
    now += 61_000;
    await store.set('op', done(now));

    expect((await store.get('op'))?.state).toBe('succeeded');
  });

  it('removes a deleted record from the index too', async () => {
    const storage = listingStorage();
    const store = createStorageOperationStore(storage, { now: () => 5_000 });
    await store.set('a', done(1_000));
    await store.delete('a');

    expect(await keysOf(storage)).toEqual([]);
  });

  it('queues its calls: twenty actions finishing together are all listed, and one clear() removes them all', async () => {
    const storage = listingStorage();
    const store = createStorageOperationStore(storage, { now: () => 5_000 });
    await Promise.all(Array.from({ length: 20 }, (_, n) => store.set(`op:${n}`, done(1_000 + n))));
    expect((await keysOf(storage)).length).toBe(21);

    await store.clear();
    expect(await keysOf(storage)).toEqual([]);
  });

  it('copes with an index that was damaged: it starts a new one', async () => {
    const storage = listingStorage();
    await storage.setItem('taxikosmos.operation.index', '{"broken');
    const store = createStorageOperationStore(storage, { now: () => 5_000 });
    await store.set('a', done(1_000));

    expect(await store.get('a')).not.toBeNull();
    await storage.setItem('taxikosmos.operation.index', JSON.stringify({ not: 'a list' }));
    await store.clear();
    expect(await keysOf(storage)).toEqual(['taxikosmos.operation.a']);
  });

  it('ignores index entries that are not [name, time] pairs', async () => {
    const storage = listingStorage();
    await storage.setItem(
      'taxikosmos.operation.index',
      JSON.stringify([['ok', 1], 'junk', [3, 'x'], ['also-ok', 'late']]),
    );
    const store = createStorageOperationStore(storage, { now: () => 5_000 });
    await store.set('a', done(1_000));

    expect(JSON.parse((await storage.getItem('taxikosmos.operation.index')) as string)).toEqual([
      ['ok', 1],
      ['a', 1_000],
    ]);
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
