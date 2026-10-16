import * as fixtures from '@taxikosmos/core/fixtures';

import {
  invalidResponseError,
  isDefinitive,
  networkError,
  parseRetryAfter,
  timeoutError,
  toApiError,
  type HttpFailure,
} from '../errors';

const failure = (fixture: { status: number; headers: Record<string, string>; body: unknown }): HttpFailure => ({
  status: fixture.status,
  headers: fixture.headers,
  body: fixture.body,
});

describe('toApiError on the real backend answers', () => {
  it('422: field messages by field name, dotted for nested fields, and the sentence for the user', () => {
    expect(toApiError(failure(fixtures.errorValidation))).toEqual({
      kind: 'validation',
      status: 422,
      message: 'The dropoff field is required. (and 2 more errors)',
      code: null,
      fieldErrors: {
        dropoff: ['The dropoff field is required.'],
        'dropoff.lat': ['The dropoff.lat field is required.'],
        'dropoff.lng': ['The dropoff.lng field is required.'],
      },
    });
  });

  it('422 for a wrong sign-in code carries the message under the field the screen shows it next to', () => {
    expect(toApiError(failure(fixtures.errorInvalidCode))).toMatchObject({
      kind: 'validation',
      fieldErrors: { code: ['The code is invalid or has expired.'] },
    });
  });

  it('401: the framework wording "Unauthenticated." is not a sentence for people', () => {
    expect(toApiError(failure(fixtures.errorUnauthenticated))).toEqual({
      kind: 'unauthenticated',
      status: 401,
      message: null,
      code: null,
    });
  });

  it('401 keeps a sign-in refusal that is written for the person', () => {
    expect(
      toApiError({ status: 401, headers: {}, body: { message: 'The sign-in token could not be verified.' } }),
    ).toMatchObject({
      kind: 'unauthenticated',
      message: 'The sign-in token could not be verified.',
    });
  });

  it('403 with a code keeps the message and the code: the apps switch on the code', () => {
    expect(toApiError(failure(fixtures.errorDriverNotVerified))).toEqual({
      kind: 'forbidden',
      status: 403,
      message: 'Your driver profile has not been approved yet.',
      code: 'driver_not_verified',
    });
  });

  it('403 without a code (the framework\'s "Invalid ability provided.") shows no server text', () => {
    expect(toApiError(failure(fixtures.errorForbiddenAbility))).toEqual({
      kind: 'forbidden',
      status: 403,
      message: null,
      code: null,
    });
  });

  it('404 never exposes the server text: Laravel names an internal model in it', () => {
    expect(fixtures.errorNotFound.body.message).toContain('App\\Models');

    const error = toApiError(failure(fixtures.errorNotFound));

    expect(error).toEqual({ kind: 'not_found', status: 404, message: null, code: null });
    expect(JSON.stringify(error)).not.toContain('App');
  });

  it('429: the retry delay in seconds from Retry-After', () => {
    expect(toApiError(failure(fixtures.errorRateLimited))).toEqual({
      kind: 'rate_limited',
      status: 429,
      message: 'Too Many Attempts.',
      code: null,
      retryAfterSeconds: 60,
    });
  });
});

describe('toApiError for the other statuses', () => {
  const answer = (status: number, body: unknown = null, headers: Record<string, string> = {}): HttpFailure => ({
    status,
    headers,
    body,
  });

  it('409 keeps the body: it carries the current resource where the endpoint returns it', () => {
    const body = { message: 'This trip already started.', trip: { id: 7, status: 'in_progress' } };

    expect(toApiError(answer(409, body))).toEqual({
      kind: 'conflict',
      status: 409,
      message: 'This trip already started.',
      code: null,
      body,
    });
  });

  it('410 is "gone" with the stable code', () => {
    expect(toApiError(answer(410, { message: 'This price quote has expired.', code: 'quote_expired' }))).toEqual({
      kind: 'gone',
      status: 410,
      message: 'This price quote has expired.',
      code: 'quote_expired',
    });
  });

  it.each([500, 502, 503, 504])('%s is a server failure without server text', (status) => {
    expect(toApiError(answer(status, { message: 'Server Error' }))).toEqual({
      kind: 'server',
      status,
      message: null,
      code: null,
    });
  });

  it('503 with a code (sign-in provider down) keeps the sentence written for the person', () => {
    expect(
      toApiError(
        answer(503, { message: 'The code could not be sent. Please try again shortly.', code: 'sms_unavailable' }),
      ),
    ).toMatchObject({
      kind: 'server',
      status: 503,
      message: 'The code could not be sent. Please try again shortly.',
      code: 'sms_unavailable',
    });
  });

  it('other 4xx are "client" errors and say nothing without a code', () => {
    expect(toApiError(answer(405, { message: 'The POST method is not supported for route api/v1/x.' }))).toEqual({
      kind: 'client',
      status: 405,
      message: null,
      code: null,
    });
    expect(toApiError(answer(413, { message: 'Too large', code: 'file_too_large' }))).toMatchObject({
      kind: 'client',
      message: 'Too large',
      code: 'file_too_large',
    });
  });

  it('survives a body that is not the expected JSON (an HTML error page from a proxy)', () => {
    expect(toApiError(answer(502, null))).toEqual({ kind: 'server', status: 502, message: null, code: null });
    expect(toApiError(answer(422, 'text'))).toMatchObject({ kind: 'validation', fieldErrors: {}, message: null });
    expect(toApiError(answer(422, [1, 2]))).toMatchObject({ kind: 'validation', fieldErrors: {} });
  });

  it('ignores malformed field errors instead of trusting them', () => {
    const error = toApiError(
      answer(422, {
        message: 'Invalid.',
        errors: { phone: ['ok', 7, ''], other: 'text', empty: [], nested: { a: 1 }, name: [] },
      }),
    );

    expect(error).toMatchObject({ kind: 'validation', fieldErrors: { phone: ['ok'] } });
    expect(error.kind === 'validation' && Object.keys(error.fieldErrors)).toEqual(['phone']);
  });
});

describe('parseRetryAfter', () => {
  const now = () => Date.parse('2026-10-16T10:00:00Z');

  it('reads seconds', () => {
    expect(parseRetryAfter('60', now)).toBe(60);
    expect(parseRetryAfter(' 5 ', now)).toBe(5);
    expect(parseRetryAfter('0', now)).toBe(0);
  });

  it('reads an HTTP date as seconds from now, never negative', () => {
    expect(parseRetryAfter('Fri, 16 Oct 2026 10:01:30 GMT', now)).toBe(90);
    expect(parseRetryAfter('Fri, 16 Oct 2026 09:00:00 GMT', now)).toBe(0);
  });

  it.each([undefined, '', '  ', 'soon', '-5'])('gives null for %p', (value) => {
    expect(parseRetryAfter(value, now)).toBeNull();
  });

  it('uses the real clock by default', () => {
    expect(parseRetryAfter(new Date(Date.now() + 30_000).toUTCString())).toBeGreaterThanOrEqual(28);
  });
});

describe('helpers', () => {
  it('has fixed errors for no answer, timeout and an unreadable answer', () => {
    expect(networkError).toEqual({ kind: 'network', status: null, message: null, code: null });
    expect(timeoutError).toEqual({ kind: 'timeout', status: null, message: null, code: null });
    expect(invalidResponseError(200)).toEqual({ kind: 'invalid_response', status: 200, message: null, code: null });
  });

  it('calls an error definitive unless the action may have been applied or can be retried later', () => {
    const definitive = [422, 401, 403, 404, 409, 410, 400].map((status) =>
      toApiError({ status, headers: {}, body: null }),
    );
    const open = [
      networkError,
      timeoutError,
      toApiError({ status: 500, headers: {}, body: null }),
      toApiError({ status: 429, headers: {}, body: null }),
    ];

    expect(definitive.every(isDefinitive)).toBe(true);
    expect(open.some(isDefinitive)).toBe(false);
    expect(isDefinitive(invalidResponseError(200))).toBe(true);
  });
});
