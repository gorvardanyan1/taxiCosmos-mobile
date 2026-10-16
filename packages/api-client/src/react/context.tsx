import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { ApiClient } from '../client';
import type { RealtimeClient } from '../realtime/client';
import type { RealtimeStatus } from '../realtime/types';
import { createApi, type Api } from '../resources';
import type { SessionSnapshot } from '../session';
import { createQueryClient } from './queryClient';

interface ApiContextValue {
  client: ApiClient;
  api: Api;
  realtime: RealtimeClient | null;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export interface ApiProviderProps {
  client: ApiClient;
  /** The realtime connection, if the app has one. It starts when a person signs in and stops when they sign out. */
  realtime?: RealtimeClient | null;
  /** Defaults to a new client with the app's standard retry rules. */
  queryClient?: QueryClient;
  children: ReactNode;
}

/**
 * Connects the screens to the backend: the API client, the cache, and the rules that keep them honest.
 *  - Reads the saved session when the app starts.
 *  - Signing out empties the whole cache, so the next person never sees the previous one's data.
 *  - Coming back to the foreground, and the realtime connection coming back, refetch what is on screen over REST (the server is the
 *    truth; a socket event is only a hint).
 */
export function ApiProvider({ client, realtime = null, queryClient, children }: ApiProviderProps) {
  const [ownQueryClient] = useState(createQueryClient);
  const cache = queryClient ?? ownQueryClient;
  const api = useMemo(() => createApi(client), [client]);
  const value = useMemo<ApiContextValue>(() => ({ client, api, realtime }), [client, api, realtime]);
  const session = useSession(client);

  useEffect(() => {
    void client.session.load();
  }, [client]);

  // Another account must start with an empty cache.
  useEffect(() => {
    let wasSignedIn = client.session.getSnapshot().status === 'signed_in';

    return client.session.subscribe(() => {
      const signedIn = client.session.getSnapshot().status === 'signed_in';

      if (wasSignedIn && !signedIn) {
        cache.clear();
      }

      wasSignedIn = signedIn;
    });
  }, [client, cache]);

  useEffect(() => {
    if (realtime === null) {
      return undefined;
    }

    if (session.status === 'signed_in') {
      realtime.start();

      return () => realtime.stop();
    }

    return undefined;
  }, [realtime, session.status]);

  useEffect(() => {
    const unsubscribe = realtime?.onReconnect(() => {
      void cache.invalidateQueries({ refetchType: 'active' });
    });

    return unsubscribe;
  }, [realtime, cache]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      focusManager.setFocused(active);

      if (active) {
        realtime?.foreground();

        // Without a realtime connection nothing else would tell the screens that time has passed.
        if (realtime === null) {
          void cache.invalidateQueries({ refetchType: 'active' });
        }
      }
    });

    return () => subscription.remove();
  }, [realtime, cache]);

  return (
    <QueryClientProvider client={cache}>
      <ApiContext.Provider value={value}>{children}</ApiContext.Provider>
    </QueryClientProvider>
  );
}

function useApiContext(): ApiContextValue {
  const value = useContext(ApiContext);

  if (value === null) {
    throw new Error('Wrap the app in <ApiProvider> before using the API hooks.');
  }

  return value;
}

export function useApiClient(): ApiClient {
  return useApiContext().client;
}

/** Every endpoint as a typed function. Prefer the query and mutation hooks in screens; use this for one-off calls. */
export function useApi(): Api {
  return useApiContext().api;
}

/** The realtime connection, or `null` when the app has none. */
export function useRealtime(): RealtimeClient | null {
  return useApiContext().realtime;
}

function useSession(client: ApiClient): SessionSnapshot {
  return useSyncExternalStore(client.session.subscribe, client.session.getSnapshot, client.session.getSnapshot);
}

/** `unknown` until the saved session was read, then `signed_in` or `signed_out`. */
export function useSessionStatus(): SessionSnapshot['status'] {
  return useSession(useApiClient()).status;
}

const idleSubscribe = () => () => undefined;
const idleStatus = (): RealtimeStatus => 'idle';

export function useRealtimeStatus(): RealtimeStatus {
  const realtime = useRealtime();

  return useSyncExternalStore(
    realtime?.subscribeStatus ?? idleSubscribe,
    realtime?.getSnapshot ?? idleStatus,
    realtime?.getSnapshot ?? idleStatus,
  );
}

/**
 * The `refetchInterval` for a query that follows live state (a trip): `false` while the realtime connection is up, because events keep
 * it fresh, and `ms` otherwise, so the screen polls over REST when there is no connection or no realtime service at all.
 */
export function usePollingInterval(ms: number): number | false {
  return useRealtimeStatus() === 'connected' ? false : ms;
}
