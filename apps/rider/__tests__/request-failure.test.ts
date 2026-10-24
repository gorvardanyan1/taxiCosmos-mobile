import { ApiRequestError, type ApiError } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';

import { requestFailure } from '../src/booking/requestFailure';

const fail = (error: ApiError) => new ApiRequestError(error);
const conflict = (code: string, body: unknown) => fail({ kind: 'conflict', status: 409, message: 'No', code, body });

describe('requestFailure', () => {
  it.each<[string, ApiError]>([
    ['no connection', { kind: 'network', status: null, message: null, code: null }],
    ['a timeout', { kind: 'timeout', status: null, message: null, code: null }],
  ])('calls %s "offline": try again, the same key books once', (_, error) => {
    expect(requestFailure(fail(error))).toEqual({ kind: 'offline' });
  });

  it.each<[string, ApiError]>([
    ['a server error', { kind: 'server', status: 500, message: null, code: null }],
    ['an answer that is not JSON', { kind: 'invalid_response', status: 200, message: null, code: null }],
  ])('calls %s "failed"', (_, error) => {
    expect(requestFailure(fail(error))).toEqual({ kind: 'failed' });
  });

  it('calls a throttle "busy"', () => {
    expect(
      requestFailure(
        fail({ kind: 'rate_limited', status: 429, message: 'Too Many Attempts.', code: null, retryAfterSeconds: 60 }),
      ),
    ).toEqual({ kind: 'busy' });
  });

  it('gives the trip the rider already has', () => {
    const failure = requestFailure(conflict('active_trip_exists', fixtures.errorTripActive.body));

    expect(failure).toMatchObject({ kind: 'active', trip: { id: fixtures.errorTripActive.body.trip.id } });
  });

  it('does not treat a 409 without a trip as "active"', () => {
    expect(requestFailure(conflict('active_trip_exists', { message: 'No' }))).toEqual({
      kind: 'refused',
      message: 'No',
    });
  });

  it.each([
    ['an expired quote', { kind: 'gone', status: 410, message: 'Expired.', code: 'quote_expired' } as const],
    ['a 410 with no code', { kind: 'gone', status: 410, message: 'Gone.', code: null } as const],
    ['an unknown quote', { kind: 'not_found', status: 404, message: null, code: 'quote_not_found' } as const],
    [
      'a quote for another route',
      { kind: 'validation', status: 422, message: 'Route.', code: 'quote_route_changed', fieldErrors: {} } as const,
    ],
    [
      'a class the quote does not price',
      {
        kind: 'validation',
        status: 422,
        message: 'Class.',
        code: 'vehicle_class_not_quoted',
        fieldErrors: {},
      } as const,
    ],
  ])('calls %s "quote": ask for a new price', (_, error) => {
    expect(requestFailure(fail(error))).toEqual({ kind: 'quote' });
  });

  it('calls a pickup outside the service area "outside"', () => {
    expect(
      requestFailure(
        fail({ kind: 'validation', status: 422, message: 'No.', code: 'outside_service_area', fieldErrors: {} }),
      ),
    ).toEqual({ kind: 'outside' });
  });

  it("keeps the server's sentence for any other refusal", () => {
    expect(
      requestFailure(
        fail({
          kind: 'validation',
          status: 422,
          message: 'Only cash is available for now.',
          code: null,
          fieldErrors: { payment_method: ['Only cash is available for now.'] },
        }),
      ),
    ).toEqual({ kind: 'refused', message: 'Only cash is available for now.' });
    expect(requestFailure(fail({ kind: 'forbidden', status: 403, message: null, code: 'account_suspended' }))).toEqual({
      kind: 'refused',
      message: null,
    });
  });

  it('calls anything that is not an API error "failed"', () => {
    expect(requestFailure(new Error('boom'))).toEqual({ kind: 'failed' });
  });
});
