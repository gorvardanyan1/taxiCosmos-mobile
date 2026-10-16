import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppState } from 'react-native';

import type { ApiClient } from '../client';
import { ApiProvider, createQueryClient, type RealtimeClient } from '..';
import { makeClient, type ReplyOrFn } from './helpers';
import type { TokenPair } from '../storage';

/** Plain function that remembers its calls (immune to `jest.restoreAllMocks`, which can wipe the behaviour of `jest.fn` fakes). */
function recorder<TArgs extends unknown[], TResult = void>(impl?: (...args: TArgs) => TResult) {
  const calls: TArgs[] = [];
  const fn = (...args: TArgs): TResult => {
    calls.push(args);

    return impl ? impl(...args) : (undefined as TResult);
  };

  return Object.assign(fn, { calls });
}

/** A realtime connection that only records what the provider asks of it. */
export function fakeRealtime() {
  const reconnectHandlers = new Set<(reason: string) => void>();
  let status = 'idle';
  const listeners = new Set<() => void>();
  const fake = {
    start: recorder(),
    stop: recorder(),
    foreground: recorder(),
    onReconnect: recorder((handler: (reason: string) => void) => {
      reconnectHandlers.add(handler);

      return () => reconnectHandlers.delete(handler);
    }),
    subscribeStatus: (listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    getSnapshot: () => status,
  };

  return {
    realtime: fake as unknown as RealtimeClient,
    fake,
    reconnect: () => reconnectHandlers.forEach((handler) => handler('reconnect')),
    setStatus: (next: string) => {
      status = next;
      listeners.forEach((listener) => listener());
    },
  };
}

/** Captures what the provider registers for app state changes, so a test can bring the app "to the foreground". */
export function captureAppState() {
  let listener: (state: string) => void = () => undefined;
  let added = 0;
  let removed = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, handler: (state: string) => void) => {
    added++;
    listener = handler;

    return { remove: () => void removed++ };
  }) as never);

  return { change: (state: string) => listener(state), added: () => added, removed: () => removed };
}

/**
 * A fast query client for tests: the app's rules, but no waiting between retries and a re-render on every change (the app re-renders only
 * for what a component read, which a test reading `result.current` after the render would not trigger).
 */
export function testQueryClient(): QueryClient {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: {
      ...queryClient.getDefaultOptions().queries,
      retryDelay: 0,
      gcTime: Infinity,
      notifyOnChangeProps: 'all',
    },
    // A finished write is kept 5 minutes by default; that timer would keep the test process alive after the last test.
    mutations: { ...queryClient.getDefaultOptions().mutations, gcTime: Infinity },
  });

  return queryClient;
}

export async function renderWithApi<TResult>(
  hook: () => TResult,
  script: ReplyOrFn[],
  options: {
    signedIn?: TokenPair | null;
    realtime?: RealtimeClient | null;
    queryClient?: QueryClient;
    client?: ApiClient;
    /** Wait for the saved session to be read before returning (default). */ settle?: boolean;
  } = {},
) {
  const made = makeClient(script, options.signedIn === undefined ? {} : { signedIn: options.signedIn });
  const client = options.client ?? made.client;
  const queryClient = options.queryClient ?? testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={client} queryClient={queryClient} realtime={options.realtime ?? null}>
      {children}
    </ApiProvider>
  );
  const rendered = renderHook(hook, { wrapper });
  // The saved session is read right after the first render; wait for it so no state update lands outside `act`.
  if (options.settle !== false) {
    await act(async () => {
      await client.session.load();
    });
  }

  return { ...rendered, ...made, client, queryClient };
}

export { waitFor };

/** Mounts another hook under the same client and cache: a second screen opening later. */
export function mountAgain<TResult>(hook: () => TResult, shared: { client: ApiClient; queryClient: QueryClient }) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={shared.client} queryClient={shared.queryClient}>
      {children}
    </ApiProvider>
  );

  return renderHook(hook, { wrapper });
}
