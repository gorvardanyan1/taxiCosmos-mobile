import {
  ApiRequestError,
  errorCodeOf,
  fieldError,
  fieldErrorsOf,
  getApiError,
  isApiRequestError,
  isOffline,
  isRetryable,
  retryAfterSecondsOf,
  type ApiError,
} from '../errors.ts';

const validation: ApiError = {
  kind: 'validation',
  status: 422,
  message: 'Invalid.',
  code: null,
  fieldErrors: { phone: ['The phone is invalid.', 'Second.'], 'pickup.lat': ['Required.'] },
};
const throttled: ApiError = {
  kind: 'rate_limited',
  status: 429,
  message: 'Too Many Attempts.',
  code: null,
  retryAfterSeconds: 42,
};
const network: ApiError = { kind: 'network', status: null, message: null, code: null };

describe('ApiRequestError', () => {
  it('carries the tagged error and the idempotency key of the request that failed', () => {
    const error = new ApiRequestError(throttled, 'key-1234567');

    expect(error).toBeInstanceOf(Error);
    expect(error.error).toBe(throttled);
    expect(error.idempotencyKey).toBe('key-1234567');
    expect(error.message).toBe('API request failed: rate_limited (429)');
  });

  it('names the code, and has no status for a request that never got an answer', () => {
    expect(
      new ApiRequestError({ kind: 'forbidden', status: 403, message: 'Suspended.', code: 'account_suspended' }).message,
    ).toBe('API request failed: forbidden (403) account_suspended');
    expect(new ApiRequestError(network).message).toBe('API request failed: network');
  });

  it('never puts the server message or any user data in its own message', () => {
    const error = new ApiRequestError({
      kind: 'conflict',
      status: 409,
      message: 'Phone +37491234567 is taken.',
      code: null,
      body: { secret: 1 },
    });

    expect(error.message).not.toContain('37491234567');
    expect(error.message).not.toContain('secret');
  });
});

describe('error helpers', () => {
  it('recognises what the client threw', () => {
    expect(isApiRequestError(new ApiRequestError(network))).toBe(true);
    expect(isApiRequestError(new Error('x'))).toBe(false);
    expect(isApiRequestError({ error: network })).toBe(false);
    expect(getApiError(new ApiRequestError(network))).toBe(network);
    expect(getApiError(new TypeError('boom'))).toBeNull();
    expect(getApiError(undefined)).toBeNull();
  });

  it('reads field messages from a validation error and nothing from other errors', () => {
    const thrown = new ApiRequestError(validation);

    expect(fieldErrorsOf(thrown)).toEqual(validation.kind === 'validation' ? validation.fieldErrors : {});
    expect(fieldError(thrown, 'phone')).toBe('The phone is invalid.');
    expect(fieldError(thrown, 'pickup.lat')).toBe('Required.');
    expect(fieldError(thrown, 'missing')).toBeNull();
    expect(fieldErrorsOf(new ApiRequestError(throttled))).toEqual({});
    expect(fieldError(new Error('x'), 'phone')).toBeNull();
  });

  it('exposes the retry delay of a throttled request only', () => {
    expect(retryAfterSecondsOf(new ApiRequestError(throttled))).toBe(42);
    expect(retryAfterSecondsOf(new ApiRequestError({ ...throttled, retryAfterSeconds: null } as ApiError))).toBeNull();
    expect(retryAfterSecondsOf(new ApiRequestError(validation))).toBeNull();
  });

  it('says which failures are worth retrying and which just mean offline', () => {
    const kinds: [ApiError, boolean, boolean][] = [
      [network, true, true],
      [{ kind: 'timeout', status: null, message: null, code: null }, true, true],
      [{ kind: 'server', status: 503, message: null, code: null }, true, false],
      [throttled, true, false],
      [validation, false, false],
      [{ kind: 'forbidden', status: 403, message: null, code: null }, false, false],
      [{ kind: 'conflict', status: 409, message: null, code: null, body: null }, false, false],
      [{ kind: 'not_found', status: 404, message: null, code: null }, false, false],
    ];

    for (const [error, retryable, offline] of kinds) {
      expect([error.kind, isRetryable(new ApiRequestError(error))]).toEqual([error.kind, retryable]);
      expect([error.kind, isOffline(new ApiRequestError(error))]).toEqual([error.kind, offline]);
    }

    expect(isRetryable(new Error('x'))).toBe(false);
  });

  it('exposes the machine-readable code of a refusal', () => {
    expect(
      errorCodeOf(new ApiRequestError({ kind: 'forbidden', status: 403, message: null, code: 'driver_not_verified' })),
    ).toBe('driver_not_verified');
    expect(errorCodeOf(new ApiRequestError(network))).toBeNull();
    expect(errorCodeOf('nope')).toBeNull();
  });
});
