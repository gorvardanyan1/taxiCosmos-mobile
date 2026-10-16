import type { AuthSession } from '@taxikosmos/core';

/** The session's two tokens. Kept in the OS keychain/keystore (see `secure-store.ts`), never in plain storage. */
export interface TokenPair {
  accessToken: string;
  /** When the access token stops working (ISO 8601), so it can be renewed just before; `null` when unknown. */
  accessTokenExpiresAt: string | null;
  refreshToken: string;
}

/** Where the session is kept between app launches. */
export interface TokenStore {
  read(): Promise<TokenPair | null>;
  write(pair: TokenPair): Promise<void>;
  clear(): Promise<void>;
}

export function pairFromSession(
  session: Pick<AuthSession, 'access_token' | 'access_token_expires_at' | 'refresh_token'>,
): TokenPair {
  return {
    accessToken: session.access_token,
    accessTokenExpiresAt: session.access_token_expires_at,
    refreshToken: session.refresh_token,
  };
}

/** Reads a stored pair back, refusing anything that is not exactly the shape written (a corrupted or foreign value is "signed out"). */
export function parseStoredPair(raw: string | null): TokenPair | null {
  if (raw === null) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as Partial<TokenPair> | null;

    if (
      value !== null &&
      typeof value === 'object' &&
      typeof value.accessToken === 'string' &&
      value.accessToken !== '' &&
      typeof value.refreshToken === 'string' &&
      value.refreshToken !== '' &&
      (value.accessTokenExpiresAt === null || typeof value.accessTokenExpiresAt === 'string')
    ) {
      return {
        accessToken: value.accessToken,
        accessTokenExpiresAt: value.accessTokenExpiresAt,
        refreshToken: value.refreshToken,
      };
    }
  } catch {
    // fall through
  }

  return null;
}

/** A store that lives only as long as the process: for tests and for signed-out previews. */
export function createMemoryTokenStore(initial: TokenPair | null = null): TokenStore {
  let current = initial;

  return {
    read: async () => current,
    write: async (pair) => {
      current = pair;
    },
    clear: async () => {
      current = null;
    },
  };
}

/** The part of a key-value storage this package needs; AsyncStorage and MMKV adapters satisfy it. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function createMemoryKeyValueStorage(): KeyValueStorage {
  const items = new Map<string, string>();

  return {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      items.set(key, value);
    },
    removeItem: async (key) => {
      items.delete(key);
    },
  };
}

/** The idempotency record of one user action (see `createApiClient` → `operation`). */
export interface OperationRecord {
  /** The `Idempotency-Key` this action sends, on every attempt. */
  key: string;
  /** `pending` until the server answered with success. */
  state: 'pending' | 'succeeded';
  /** When the record was made (ms since epoch), to expire it. */
  createdAt: number;
  /** What the server answered, once it succeeded, so a repeat of the action returns it without another request. */
  response?: { status: number; data: unknown };
}

export interface OperationStore {
  get(operation: string): Promise<OperationRecord | null>;
  set(operation: string, record: OperationRecord): Promise<void>;
  delete(operation: string): Promise<void>;
  /** Forgets every record: the person signed out (or another signed in), and their actions are nobody else's business. */
  clear(): Promise<void>;
}

/**
 * Turns any text into a key that secure storage accepts (letters, digits, `.`, `-`, `_`). Every other character becomes `_` and its
 * hex code, and `_` itself too, so two different names can never end up with the same key.
 */
export function safeStorageKey(name: string): string {
  return Array.from(name, (char) =>
    /[A-Za-z0-9.-]/.test(char) ? char : `_${(char.codePointAt(0) ?? 0).toString(16)}_`,
  ).join('');
}

export interface OperationStoreOptions {
  /** Prefix of every storage key this store writes. */
  prefix?: string;
  /** Records older than this are deleted the next time anything is written. Default 24 h, the same as the client's repeat window. */
  retentionMs?: number;
  now?: () => number;
}

/** What the index remembers about a record: enough to find it again (secure storage cannot list its keys) and to age it out. */
type OperationIndex = [operation: string, createdAt: number][];

/**
 * Operation records on any key-value storage, so a key survives the app being closed between a failed attempt and the retry. Put it on
 * encrypted storage (the secure store): the stored answer of an action can hold personal data.
 *
 * Nothing is kept for good. An index lists the records (the secure store cannot list its keys); every write deletes the records older than
 * `retentionMs`; and `clear()` deletes them all, which the client calls on sign-out and on a new sign-in. Calls are queued, so two actions
 * finishing together cannot overwrite each other's index entry. If a platform refuses a value as too large, the record is kept without the
 * answer, so the key (the part that prevents a duplicate) is never lost.
 */
export function createStorageOperationStore(
  storage: KeyValueStorage,
  options: OperationStoreOptions = {},
): OperationStore {
  const prefix = options.prefix ?? 'taxikosmos.operation.';
  const retentionMs = options.retentionMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ?? Date.now;
  const indexKey = `${prefix}index`;
  const recordKey = (operation: string) => prefix + safeStorageKey(operation);
  let queue: Promise<unknown> = Promise.resolve();

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);

    return run;
  };

  const readIndex = async (): Promise<OperationIndex> => {
    const raw = await storage.getItem(indexKey);

    try {
      const value = raw === null ? [] : (JSON.parse(raw) as unknown);

      return Array.isArray(value)
        ? value.filter(
            (entry): entry is [string, number] =>
              Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number',
          )
        : [];
    } catch {
      return [];
    }
  };

  const writeIndex = (index: OperationIndex) =>
    index.length === 0 ? storage.removeItem(indexKey) : storage.setItem(indexKey, JSON.stringify(index));

  return {
    get: (operation) =>
      serial(async () => {
        const key = recordKey(operation);
        const raw = await storage.getItem(key);

        if (raw === null) {
          return null;
        }

        try {
          const record = JSON.parse(raw) as Partial<OperationRecord> | null;

          if (
            record &&
            typeof record.key === 'string' &&
            (record.state === 'pending' || record.state === 'succeeded') &&
            typeof record.createdAt === 'number'
          ) {
            return record as OperationRecord;
          }
        } catch {
          // fall through to forgetting it
        }

        await storage.removeItem(key);

        return null;
      }),

    set: (operation, record) =>
      serial(async () => {
        const cutoff = now() - retentionMs;
        const index = await readIndex();
        const kept: OperationIndex = [];

        for (const entry of index) {
          if (entry[1] < cutoff && entry[0] !== operation) {
            await storage.removeItem(recordKey(entry[0]));
          } else if (entry[0] !== operation) {
            kept.push(entry);
          }
        }

        kept.push([operation, record.createdAt]);
        // The index first: a record that is written but not listed could never be cleaned up.
        await writeIndex(kept);

        try {
          await storage.setItem(recordKey(operation), JSON.stringify(record));
        } catch (error) {
          if (record.response === undefined) {
            throw error;
          }

          const { response: _dropped, ...withoutAnswer } = record;
          void _dropped;
          await storage.setItem(recordKey(operation), JSON.stringify(withoutAnswer));
        }
      }),

    delete: (operation) =>
      serial(async () => {
        await storage.removeItem(recordKey(operation));
        await writeIndex((await readIndex()).filter((entry) => entry[0] !== operation));
      }),

    clear: () =>
      serial(async () => {
        for (const [operation] of await readIndex()) {
          await storage.removeItem(recordKey(operation));
        }

        // Last, so a clear that is interrupted can finish on the next call.
        await storage.removeItem(indexKey);
      }),
  };
}

export function createMemoryOperationStore(): OperationStore {
  return createStorageOperationStore(createMemoryKeyValueStorage());
}

/** A stable id for this install, made once and kept: the server ends the previous session of the same device when it signs in again. */
export async function getOrCreateDeviceId(
  storage: KeyValueStorage,
  newId: () => string,
  key = 'taxikosmos.device-id',
): Promise<string> {
  const existing = await storage.getItem(key);

  if (existing !== null && existing.length >= 8) {
    return existing;
  }

  const created = newId();
  await storage.setItem(key, created);

  return created;
}
