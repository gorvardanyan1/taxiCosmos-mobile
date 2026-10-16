import type { AuthSession } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';

import { createApiClient, type ApiClient, type ApiClientOptions } from '../client';
import { createMemoryTokenStore, type TokenPair, type TokenStore } from '../storage';

export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  query: Record<string, string>;
  /** Lower-case header names. */
  headers: Record<string, string>;
  /** Parsed JSON body, the `FormData` itself for an upload, or `undefined`. */
  body: unknown;
}

export type Reply =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  /** The request never gets an answer (no connection). */
  | 'network-error'
  /** The request hangs until it is aborted (to test timeouts). */
  | 'hang';

export type ReplyOrFn = Reply | ((request: RecordedRequest) => Reply);

/** A `fetch` that records every request and answers from a script, one reply per call. A call beyond the script fails the test. */
export function scriptedFetch(script: ReplyOrFn[]) {
  const requests: RecordedRequest[] = [];
  let index = 0;

  const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    const rawBody = init?.body;
    const body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      url: url.toString(),
      path: url.pathname.replace(/^\/api\/v1/, ''),
      query: Object.fromEntries(url.searchParams.entries()),
      headers,
      body,
    };
    requests.push(request);

    const next = script[index++];

    if (next === undefined) {
      throw new Error(`Unexpected request #${index}: ${request.method} ${request.path}`);
    }

    const reply = typeof next === 'function' ? next(request) : next;

    if (reply === 'network-error') {
      throw new TypeError('Network request failed');
    }

    if (reply === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    }

    const status = reply.status;
    const payload = reply.body === undefined || status === 204 ? null : JSON.stringify(reply.body);

    return new Response(payload, { status, headers: { 'content-type': 'application/json', ...reply.headers } });
  });

  return { fetch: fn as unknown as typeof fetch, requests, mock: fn, remaining: () => script.length - index };
}

/** A recorded real backend answer as a reply. */
export function replyWith(fixture: { status: number; headers: Record<string, string>; body: unknown }): Reply {
  return { status: fixture.status, body: fixture.body, headers: fixture.headers };
}

export const ok = (body: unknown, status = 200): Reply => ({ status, body });
export const empty = (): Reply => ({ status: 204 });

export function sessionPayload(overrides: Partial<AuthSession> = {}): AuthSession {
  return { ...fixtures.authSessionRider.body, ...overrides };
}

export function pair(overrides: Partial<TokenPair> = {}): TokenPair {
  return {
    accessToken: 'access-1',
    accessTokenExpiresAt: '2099-01-01T00:00:00+00:00',
    refreshToken: 'refresh-1',
    ...overrides,
  };
}

/** A token store that logs every call, in order, so tests can prove "saved before used". */
export function loggingTokenStore(initial: TokenPair | null = null): TokenStore & { log: string[] } {
  const inner = createMemoryTokenStore(initial);
  const log: string[] = [];

  return {
    log,
    read: async () => {
      log.push('read');

      return inner.read();
    },
    write: async (value) => {
      log.push(`write:${value.accessToken}`);

      return inner.write(value);
    },
    clear: async () => {
      log.push('clear');

      return inner.clear();
    },
  };
}

export const BASE_URL = 'https://api.example.test';

/** A client against a scripted server, signed in as `access-1` unless told otherwise. */
export function makeClient(
  script: ReplyOrFn[],
  options: Partial<ApiClientOptions> & { signedIn?: TokenPair | null } = {},
) {
  const server = scriptedFetch(script);
  const { signedIn = pair(), ...rest } = options;
  const tokens = rest.tokens ?? loggingTokenStore(signedIn);
  const keys = (function* () {
    for (let i = 1; ; i++) {
      yield `key-${String(i).padStart(8, '0')}`;
    }
  })();
  const sleeps: number[] = [];
  const client: ApiClient = createApiClient({
    baseUrl: BASE_URL,
    fetch: server.fetch,
    tokens,
    newKey: () => keys.next().value as string,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...rest,
  });

  return { client, server, tokens: tokens as ReturnType<typeof loggingTokenStore>, sleeps };
}
