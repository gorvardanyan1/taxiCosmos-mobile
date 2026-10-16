import { newIdempotencyKey, type AppClient, type Locale } from '@taxikosmos/core';
import * as SecureStore from 'expo-secure-store';

import { createApiClient, type ApiClient } from './client';
import { createRealtimeClient, type RealtimeClient } from './realtime';
import {
  createStorageOperationStore,
  getOrCreateDeviceId,
  parseStoredPair,
  safeStorageKey,
  type KeyValueStorage,
  type TokenStore,
} from './storage';

/**
 * The OS keychain (iOS) / Keystore-encrypted storage (Android), through `expo-secure-store`. Its own entry point (`@taxikosmos/api-client/secure-store`)
 * so that code and tests that do not need it never load a native module.
 *
 * `AFTER_FIRST_UNLOCK`: the driver app reports its location and receives offers while the phone is locked, which the default
 * (`WHEN_UNLOCKED`) would block. Items are never synced to iCloud Keychain.
 */
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

/** The session's tokens, one JSON value per app (rider and driver may be installed side by side). */
export function createSecureTokenStore(app: AppClient): TokenStore {
  const key = `taxikosmos.session.${app}`;

  return {
    read: async () => parseStoredPair(await SecureStore.getItemAsync(key, OPTIONS)),
    write: (pair) => SecureStore.setItemAsync(key, JSON.stringify(pair), OPTIONS),
    clear: () => SecureStore.deleteItemAsync(key, OPTIONS),
  };
}

/** Key-value storage on the secure store (keys are made safe: it rejects `:` and other characters). */
export function createSecureKeyValueStorage(): KeyValueStorage {
  return {
    getItem: (key) => SecureStore.getItemAsync(safeStorageKey(key), OPTIONS),
    setItem: (key, value) => SecureStore.setItemAsync(safeStorageKey(key), value, OPTIONS),
    removeItem: (key) => SecureStore.deleteItemAsync(safeStorageKey(key), OPTIONS),
  };
}

export interface AppApiOptions {
  app: AppClient;
  /** The backend origin (`appConfig.apiUrl`). */
  baseUrl: string;
  /** The realtime service address (`appConfig.realtimeUrl`); `null` makes the app poll over REST. */
  realtimeUrl: string | null;
  /** The interface language until the app tells otherwise. Default `en`. */
  locale?: Locale;
  /** Replaces the network, for tests. */
  fetch?: typeof fetch;
}

/**
 * Everything one app needs to talk to the backend, wired the same way for the rider and the driver app: tokens in the secure store, the
 * records of in-progress user actions (so a retry reuses its idempotency key) in the secure store too, the interface language as
 * `Accept-Language`, and the realtime connection (or polling when there is no address). Create it once, at module level.
 */
export function createAppApi(options: AppApiOptions) {
  let locale: Locale = options.locale ?? 'en';
  const storage = createSecureKeyValueStorage();
  const client: ApiClient = createApiClient({
    baseUrl: options.baseUrl,
    tokens: createSecureTokenStore(options.app),
    operations: createStorageOperationStore(storage),
    getLocale: () => locale,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const realtime: RealtimeClient = createRealtimeClient({
    url: options.realtimeUrl,
    app: options.app,
    getToken: () => client.session.accessToken(),
  });

  return {
    client,
    realtime,
    /** Call when the person changes the app language, so the server answers in it. */
    setLocale: (next: Locale) => {
      locale = next;
    },
    getLocale: () => locale,
    /** A stable id for this install, made on first use. Sent when signing in. */
    getDeviceId: () => getOrCreateDeviceId(storage, newIdempotencyKey),
  };
}
