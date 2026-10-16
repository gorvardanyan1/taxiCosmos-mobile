import type { ApiError, FieldErrors } from '@taxikosmos/core';

/** An HTTP answer reduced to what error mapping needs. */
export interface HttpFailure {
  status: number;
  /** Lower-case header names. */
  headers: Readonly<Record<string, string>>;
  /** The parsed JSON body, or `null` when there was none or it was not JSON. */
  body: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** `Retry-After` is a number of seconds or an HTTP date; both become whole seconds from now. */
export function parseRetryAfter(value: string | undefined, now: () => number = Date.now): number | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  if (/^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  // An HTTP date always has letters (day and month names); anything else that is not whole seconds is not a valid value.
  if (!/[A-Za-z]/.test(value)) {
    return null;
  }

  const date = Date.parse(value);

  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - now()) / 1000));
}

/** Laravel's `errors`: field → list of messages. Anything else in there is ignored rather than trusted. */
function parseFieldErrors(value: unknown): FieldErrors {
  const errors = asRecord(value);
  const result: Record<string, string[]> = {};

  for (const [field, messages] of Object.entries(errors ?? {})) {
    if (Array.isArray(messages)) {
      const strings = messages.filter((message): message is string => typeof message === 'string' && message !== '');

      if (strings.length > 0) {
        result[field] = strings;
      }
    }
  }

  return result;
}

/**
 * Turns a failed HTTP answer into the tagged error. Which statuses may carry the server's own sentence for the user is decided here, once:
 * validation, a conflict, an expired thing and a throttle always can; a refusal (403) or an unmapped 4xx / 5xx only when the server
 * attached a machine-readable `code` (those messages are written for users). A 404 and a plain 5xx never do: Laravel puts internals in them.
 */
export function toApiError(failure: HttpFailure, now: () => number = Date.now): ApiError {
  const { status } = failure;
  const body = asRecord(failure.body);
  const text = stringOrNull(body?.message);
  const code = stringOrNull(body?.code);

  switch (true) {
    case status === 422:
      return { kind: 'validation', status: 422, message: text, code, fieldErrors: parseFieldErrors(body?.errors) };
    case status === 401:
      // "Unauthenticated." is the framework's wording for a bad or missing token, not a sentence for people; a sign-in refusal has its own.
      return { kind: 'unauthenticated', status: 401, message: text === 'Unauthenticated.' ? null : text, code };
    case status === 403:
      return { kind: 'forbidden', status: 403, message: code === null ? null : text, code };
    case status === 404:
      return { kind: 'not_found', status: 404, message: null, code };
    case status === 409:
      return { kind: 'conflict', status: 409, message: text, code, body: failure.body };
    case status === 410:
      return { kind: 'gone', status: 410, message: text, code };
    case status === 429:
      return {
        kind: 'rate_limited',
        status: 429,
        message: text,
        code,
        retryAfterSeconds: parseRetryAfter(failure.headers['retry-after'], now),
      };
    case status >= 500:
      return { kind: 'server', status, message: code === null ? null : text, code };
    default:
      return { kind: 'client', status, message: code === null ? null : text, code };
  }
}

export const networkError: ApiError = { kind: 'network', status: null, message: null, code: null };
export const timeoutError: ApiError = { kind: 'timeout', status: null, message: null, code: null };

export function invalidResponseError(status: number): ApiError {
  return { kind: 'invalid_response', status, message: null, code: null };
}

/** Failures that say nothing was applied or the answer is final: a retry with the same idempotency key would be pointless or wrong. */
export function isDefinitive(error: ApiError): boolean {
  return !(
    error.kind === 'network' ||
    error.kind === 'timeout' ||
    error.kind === 'server' ||
    error.kind === 'rate_limited'
  );
}
