import { ApiRequestError } from '@taxikosmos/core';

import { invalidResponseError, networkError, timeoutError, toApiError } from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined;

export interface SendOptions {
  method: HttpMethod;
  /** The full URL. */
  url: string;
  headers: Record<string, string>;
  /** A JSON-serialisable body, or a FormData for a file upload. */
  body?: unknown;
  timeoutMs: number;
  /** The caller's own cancel signal (a screen closing). Aborting it throws an `AbortError`, never an `ApiRequestError`. */
  signal?: AbortSignal | undefined;
  fetch: typeof fetch;
  now?: () => number;
}

export interface Exchange<T = unknown> {
  status: number;
  /** Lower-case header names. */
  headers: Record<string, string>;
  data: T;
}

export function abortError(): Error {
  const error = new Error('The request was cancelled.');
  error.name = 'AbortError';

  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

export function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${baseUrl}/api/v1${path.startsWith('/') ? path : `/${path}`}`);

  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(name, String(value));
    }
  }

  return url.toString();
}

/**
 * One HTTP exchange: sends, waits at most `timeoutMs`, and returns the parsed answer for 2xx or throws the tagged error. It knows nothing
 * about tokens, refreshing or idempotency: those belong to the client around it.
 */
export async function send<T>(options: SendOptions): Promise<Exchange<T>> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs);
  const onCallerAbort = () => controller.abort();

  if (options.signal?.aborted) {
    clearTimeout(timer);
    throw abortError();
  }

  options.signal?.addEventListener('abort', onCallerAbort);

  const headers = { ...options.headers };
  let body: BodyInit | undefined;

  if (isFormData(options.body)) {
    // The boundary is set by fetch; a hand-written Content-Type (in any letter case) would break the upload.
    for (const name of Object.keys(headers)) {
      if (name.toLowerCase() === 'content-type') {
        delete headers[name];
      }
    }

    body = options.body;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  try {
    let response: Response;

    try {
      response = await options.fetch(options.url, {
        method: options.method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
      });
    } catch {
      if (timedOut) {
        throw new ApiRequestError(timeoutError);
      }

      if (options.signal?.aborted) {
        throw abortError();
      }

      throw new ApiRequestError(networkError);
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      responseHeaders[name.toLowerCase()] = value;
    });

    let text: string;

    try {
      text = await response.text();
    } catch {
      throw new ApiRequestError(timedOut ? timeoutError : networkError);
    }

    let parsed: unknown = null;
    let parsable = true;

    if (text !== '') {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsable = false;
      }
    }

    if (response.status >= 200 && response.status < 300) {
      if (!parsable) {
        throw new ApiRequestError(invalidResponseError(response.status));
      }

      return { status: response.status, headers: responseHeaders, data: parsed as T };
    }

    throw new ApiRequestError(
      toApiError({ status: response.status, headers: responseHeaders, body: parsable ? parsed : null }, options.now),
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onCallerAbort);
  }
}
