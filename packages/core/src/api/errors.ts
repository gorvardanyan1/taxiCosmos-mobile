/**
 * What goes wrong with a request, as one tagged union the screens `switch` on. The transport (`@taxikosmos/api-client`) turns every
 * HTTP answer or failure into one of these, so no screen parses status codes or response bodies.
 *
 * Showing text: `message` is the server's sentence, already in the user's language, and is only filled when the server wrote it for
 * the user (validation, a refused action, a known `code`). It is `null` where the server's text must not be shown: a 404 from Laravel
 * can name an internal model, and a 5xx can name anything. Use your own translated copy for those.
 */

/** The JSON error body of the backend. */
export interface ApiErrorBody {
  message: string;
  /** Stable machine-readable reason for refusals the app reacts to (`account_suspended`, `driver_not_verified`, `quote_expired`…). */
  code?: string;
  /** Field name (dotted for nested fields) to its messages. */
  errors?: Record<string, string[]>;
}

export type FieldErrors = Readonly<Record<string, readonly string[]>>;

export type ApiError =
  /** 422: the input is wrong. Show `fieldErrors` next to the fields; nothing was saved. */
  | { kind: 'validation'; status: 422; message: string | null; code: string | null; fieldErrors: FieldErrors }
  /** 401 after the one transparent refresh also failed: the session is over, go to sign-in. */
  | { kind: 'unauthenticated'; status: 401; message: string | null; code: string | null }
  /** 403: not allowed. `code` says why (`account_suspended`, `driver_not_verified`, `admin_account`…). */
  | { kind: 'forbidden'; status: 403; message: string | null; code: string | null }
  /** 404: it does not exist (or is not yours). */
  | { kind: 'not_found'; status: 404; message: null; code: string | null }
  /** 409: the action does not fit the current state. `body` is the server's answer, which carries the current resource where the endpoint returns it. */
  | { kind: 'conflict'; status: 409; message: string | null; code: string | null; body: unknown }
  /** 410: it was there and has expired (a fare quote). */
  | { kind: 'gone'; status: 410; message: string | null; code: string | null }
  /** 429: too many requests. Wait `retryAfterSeconds` (null when the server did not say). */
  | { kind: 'rate_limited'; status: 429; message: string | null; code: string | null; retryAfterSeconds: number | null }
  /** 5xx: the server failed. Retryable. */
  | { kind: 'server'; status: number; message: string | null; code: string | null }
  /** Any other 4xx the app does not handle specially. */
  | { kind: 'client'; status: number; message: string | null; code: string | null }
  /** The request never got an answer: no connection, DNS, TLS, a dropped connection. */
  | { kind: 'network'; status: null; message: null; code: null }
  /** No answer within the time limit. */
  | { kind: 'timeout'; status: null; message: null; code: null }
  /** The server answered 2xx with something that is not the JSON the app expects. */
  | { kind: 'invalid_response'; status: number; message: null; code: null };

export type ApiErrorKind = ApiError['kind'];

/** What the client throws. `error` is the tagged union; the message is for logs and never contains user data. */
export class ApiRequestError extends Error {
  override name = 'ApiRequestError';
  readonly error: ApiError;
  /** The idempotency key the failed request carried, so a retry can reuse it. */
  readonly idempotencyKey: string | null;

  constructor(error: ApiError, idempotencyKey: string | null = null) {
    super(
      `API request failed: ${error.kind}${error.status === null ? '' : ` (${error.status})`}${error.code ? ` ${error.code}` : ''}`,
    );
    this.error = error;
    this.idempotencyKey = idempotencyKey;
  }
}

export function isApiRequestError(value: unknown): value is ApiRequestError {
  return value instanceof ApiRequestError;
}

/** The tagged error behind anything a hook or the client threw, or `null` for an unrelated error. */
export function getApiError(value: unknown): ApiError | null {
  return value instanceof ApiRequestError ? value.error : null;
}

/** Field messages for a validation error, `{}` for anything else. */
export function fieldErrorsOf(value: unknown): FieldErrors {
  const error = getApiError(value);

  return error?.kind === 'validation' ? error.fieldErrors : {};
}

/** The first message for one field of a validation error, or `null`. */
export function fieldError(value: unknown, field: string): string | null {
  return fieldErrorsOf(value)[field]?.[0] ?? null;
}

/** Seconds to wait before retrying a throttled request, or `null`. */
export function retryAfterSecondsOf(value: unknown): number | null {
  const error = getApiError(value);

  return error?.kind === 'rate_limited' ? error.retryAfterSeconds : null;
}

/** True for failures worth retrying automatically or offering "Try again" for: no connection, timeout, 5xx, and 429 later. */
export function isRetryable(value: unknown): boolean {
  const kind = getApiError(value)?.kind;

  return kind === 'network' || kind === 'timeout' || kind === 'server' || kind === 'rate_limited';
}

/** True when the failure is only "the device is offline or unreachable". */
export function isOffline(value: unknown): boolean {
  const kind = getApiError(value)?.kind;

  return kind === 'network' || kind === 'timeout';
}

/** The `code` of a refusal (`account_suspended`…), or `null`. */
export function errorCodeOf(value: unknown): string | null {
  return getApiError(value)?.code ?? null;
}
