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

/**
 * Operation records on any key-value storage, so a key survives the app being closed between a failed attempt and the retry. Put it on
 * encrypted storage (the secure store): the stored answer of an action can hold personal data. If a platform refuses a value as too large,
 * the record is kept without the answer, so the key (the part that prevents a duplicate) is never lost.
 */
export function createStorageOperationStore(
  storage: KeyValueStorage,
  prefix = 'taxikosmos.operation.',
): OperationStore {
  return {
    async get(operation) {
      const key = prefix + safeStorageKey(operation);
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
    },
    async set(operation, record) {
      const key = prefix + safeStorageKey(operation);

      try {
        await storage.setItem(key, JSON.stringify(record));
      } catch (error) {
        if (record.response === undefined) {
          throw error;
        }

        const { response: _dropped, ...withoutAnswer } = record;
        void _dropped;
        await storage.setItem(key, JSON.stringify(withoutAnswer));
      }
    },
    delete: (operation) => storage.removeItem(prefix + safeStorageKey(operation)),
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
