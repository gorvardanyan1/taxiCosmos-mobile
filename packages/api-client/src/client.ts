import {
  ApiRequestError,
  createIdempotencyKeyGenerator,
  getApiError,
  type AuthSession,
  type Locale,
} from '@taxikosmos/core';

import { isDefinitive } from './errors';
import { SessionManager, type SessionEndReason } from './session';
import { createMemoryOperationStore, type OperationStore, type TokenStore } from './storage';
import { buildUrl, send, type Exchange, type HttpMethod, type QueryValue } from './transport';

export interface ApiClientOptions {
  /** The backend origin without a path or trailing slash, e.g. `https://api.taxikosmos.am`. The client adds `/api/v1`. */
  baseUrl: string;
  tokens: TokenStore;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** The language of the interface, sent as `Accept-Language` so messages from the server come back translated. */
  getLocale?: () => Locale;
  /** Per attempt. Default 20 s. */
  timeoutMs?: number;
  /** Where idempotency records of user actions are kept so a retry after closing the app reuses the key. In memory by default. */
  operations?: OperationStore;
  /** How long a repeat of a finished action is answered from the stored result. Default 24 h. */
  operationTtlMs?: number;
  /** Makes idempotency keys (UUID v7 by default). */
  newKey?: () => string;
  /** The session ended by itself (the server refused the refresh token). Send the person to sign-in. */
  onSessionEnded?: (reason: SessionEndReason) => void;
  now?: () => number;
  /** Waits between attempts of a request that asked for `retries`; a test replaces it. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  query?: Record<string, QueryValue> | undefined;
  /** JSON body, or a `FormData` for an upload. */
  body?: unknown;
  /** Set to false for the sign-in calls that carry no bearer token. */
  auth?: boolean;
  /** Cancel signal for a screen that goes away. */
  signal?: AbortSignal | undefined;
  /**
   * Names the user's action ("create-support-ticket:draft-7"). The same name always sends the same `Idempotency-Key`, even after the app
   * is restarted, until the server accepts it; once it did, repeating the action returns the stored answer without another request.
   * Use a new name for a new action. Only for POST, PUT, PATCH and DELETE.
   */
  operation?: string | undefined;
  /** An explicit `Idempotency-Key`, for a caller that keeps the key itself. */
  idempotencyKey?: string | undefined;
  /**
   * Extra attempts when there is no answer (no connection, timeout) or the server fails (5xx). For a GET always safe; for a write only
   * set it where the endpoint honours the `Idempotency-Key` header, since the attempts carry the same key.
   */
  retries?: number;
  /** Per-call time limit in milliseconds. */
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface ApiResponse<T> extends Exchange<T> {
  /** True when the answer came from the stored result of an earlier identical action, with no request sent. */
  replayed: boolean;
  /** The `Idempotency-Key` the request carried, for writes. */
  idempotencyKey: string | null;
}

const MUTATING: ReadonlySet<HttpMethod> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DAY_MS = 24 * 60 * 60 * 1000;

export class ApiClient {
  readonly session: SessionManager;
  private readonly options: Required<Pick<ApiClientOptions, 'baseUrl' | 'timeoutMs' | 'operationTtlMs'>>;
  private readonly fetchImpl: typeof fetch;
  private readonly operations: OperationStore;
  private readonly newKey: () => string;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly getLocale: (() => Locale) | undefined;
  private readonly inFlight = new Map<string, Promise<ApiResponse<unknown>>>();

  constructor(options: ApiClientOptions) {
    this.options = {
      baseUrl: options.baseUrl.replace(/\/+$/, ''),
      timeoutMs: options.timeoutMs ?? 20_000,
      operationTtlMs: options.operationTtlMs ?? DAY_MS,
    };
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.operations = options.operations ?? createMemoryOperationStore();
    this.now = options.now ?? Date.now;
    this.newKey = options.newKey ?? createIdempotencyKeyGenerator({ now: this.now });
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.getLocale = options.getLocale;
    this.session = new SessionManager({
      store: options.tokens,
      now: this.now,
      refresh: (refreshToken) => this.refreshSession(refreshToken),
      ...(options.onSessionEnded ? { onEnded: options.onSessionEnded } : {}),
    });
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, options);
  }

  post<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, options);
  }

  put<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, options);
  }

  patch<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, options);
  }

  delete<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, options);
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    if (!MUTATING.has(method)) {
      return this.attempt<T>(method, path, options, null);
    }

    if (options.operation !== undefined) {
      return this.runOperation<T>(method, path, options, options.operation);
    }

    return this.attempt<T>(method, path, options, options.idempotencyKey ?? this.newKey());
  }

  // ---- idempotent user actions ----

  private runOperation<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    operation: string,
  ): Promise<ApiResponse<T>> {
    // The same action started twice at once (a double tap) shares one request.
    const running = this.inFlight.get(operation);

    if (running) {
      return running as Promise<ApiResponse<T>>;
    }

    const promise = this.executeOperation<T>(method, path, options, operation).finally(() => {
      this.inFlight.delete(operation);
    });
    this.inFlight.set(operation, promise);

    return promise;
  }

  private async executeOperation<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    operation: string,
  ): Promise<ApiResponse<T>> {
    const stored = await this.operations.get(operation);
    const fresh = stored !== null && this.now() - stored.createdAt < this.options.operationTtlMs;

    if (stored !== null && fresh && stored.state === 'succeeded' && stored.response) {
      return {
        status: stored.response.status,
        headers: {},
        data: stored.response.data as T,
        replayed: true,
        idempotencyKey: stored.key,
      };
    }

    const key = stored !== null && fresh ? stored.key : (options.idempotencyKey ?? this.newKey());

    if (!(stored !== null && fresh)) {
      await this.operations.set(operation, { key, state: 'pending', createdAt: this.now() });
    }

    try {
      const response = await this.attempt<T>(method, path, options, key);
      await this.operations.set(operation, {
        key,
        state: 'succeeded',
        createdAt: this.now(),
        response: { status: response.status, data: response.data },
      });

      return response;
    } catch (error) {
      const apiError = getApiError(error);

      // A final answer (the input was wrong, the thing is gone) ends the action: its next attempt is a new one with a new key. No answer,
      // a server failure or a throttle may have applied the action, so the key stays for the retry.
      if (apiError !== null && isDefinitive(apiError)) {
        await this.operations.delete(operation);
      }

      throw error;
    }
  }

  // ---- one logical request: auth, one transparent refresh, optional retries ----

  private async attempt<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    idempotencyKey: string | null,
  ): Promise<ApiResponse<T>> {
    const retries = options.retries ?? 0;
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.sendAuthorised<T>(method, path, options, idempotencyKey);
      } catch (error) {
        lastError = error;
        const apiError = getApiError(error);
        const retryable =
          apiError !== null &&
          (apiError.kind === 'network' || apiError.kind === 'timeout' || apiError.kind === 'server');

        if (!retryable || attempt === retries) {
          throw error;
        }

        await this.sleep(Math.min(8_000, 500 * 2 ** attempt));
      }
    }

    throw lastError;
  }

  private async sendAuthorised<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    idempotencyKey: string | null,
  ): Promise<ApiResponse<T>> {
    const authenticated = options.auth !== false;
    let token = authenticated ? await this.session.accessToken() : null;

    try {
      return await this.sendOnce<T>(method, path, options, idempotencyKey, token);
    } catch (error) {
      if (!authenticated || token === null || getApiError(error)?.kind !== 'unauthenticated') {
        throw error;
      }

      // The access token was refused. Renew once (the manager shares one renewal between parallel requests) and send again.
      await this.session.renew(token);
      token = await this.session.accessToken();

      if (token === null) {
        throw error;
      }

      try {
        return await this.sendOnce<T>(method, path, options, idempotencyKey, token);
      } catch (second) {
        if (getApiError(second)?.kind === 'unauthenticated') {
          await this.session.end('unauthorized');
        }

        throw second;
      }
    }
  }

  private async sendOnce<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions,
    idempotencyKey: string | null,
    token: string | null,
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    const locale = this.getLocale?.();

    if (locale) {
      headers['Accept-Language'] = locale;
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (idempotencyKey !== null) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    try {
      const exchange = await send<T>({
        method,
        url: buildUrl(this.options.baseUrl, path, options.query),
        headers,
        body: options.body,
        timeoutMs: options.timeoutMs ?? this.options.timeoutMs,
        signal: options.signal,
        fetch: this.fetchImpl,
        now: this.now,
      });

      return { ...exchange, replayed: false, idempotencyKey };
    } catch (error) {
      if (error instanceof ApiRequestError) {
        throw new ApiRequestError(error.error, idempotencyKey);
      }

      throw error;
    }
  }

  private async refreshSession(refreshToken: string): Promise<AuthSession> {
    // No bearer token, no refresh-on-401 (this is the call that would recurse), and a single attempt: a refresh token must not be sent twice.
    const exchange = await this.sendOnce<AuthSession>(
      'POST',
      '/auth/refresh',
      { body: { refresh_token: refreshToken }, auth: false },
      null,
      null,
    );

    return exchange.data;
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}
