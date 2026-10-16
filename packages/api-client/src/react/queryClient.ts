import { getApiError } from '@taxikosmos/core';
import { QueryClient } from '@tanstack/react-query';

/**
 * Reads are retried only when trying again can help: no connection, a timeout or a server failure, twice, with a growing pause. A 4xx
 * (wrong input, no permission, not found, throttled) would answer the same, so it shows at once. Writes are never repeated by the
 * cache: they carry an idempotency key and the person decides whether to try again.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  const kind = getApiError(error)?.kind;

  return failureCount < 2 && (kind === 'network' || kind === 'timeout' || kind === 'server');
}

export function retryDelay(failureCount: number): number {
  return Math.min(1_000 * 2 ** failureCount, 8_000);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // There is no browser window. The provider refetches what is on screen when the app returns to the foreground and when the
        // realtime connection comes back, which is the same promise with the right trigger.
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}
