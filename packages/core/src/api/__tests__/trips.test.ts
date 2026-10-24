import * as fixtures from '../../fixtures/index.ts';
import { ApiRequestError, type ApiError } from '../errors.ts';
import { isTripFinal, tripOfConflict } from '../trips.ts';
import type { TripStatus } from '../types.ts';

const conflict = (code: string, body: unknown): ApiRequestError =>
  new ApiRequestError({ kind: 'conflict', status: 409, message: 'No', code, body });

describe('isTripFinal', () => {
  it.each<[TripStatus, boolean]>([
    ['requested', false],
    ['matched', false],
    ['arrived', false],
    ['in_progress', false],
    ['completed', true],
    ['cancelled', true],
    ['no_driver_found', true],
  ])('says %s is final: %s', (status, final) => {
    expect(isTripFinal(status)).toBe(final);
  });
});

describe('tripOfConflict', () => {
  it('gives the trip the rider already has (active_trip_exists)', () => {
    expect(tripOfConflict(conflict('active_trip_exists', fixtures.errorTripActive.body))?.id).toBe(
      fixtures.errorTripActive.body.trip.id,
    );
  });

  it('gives the trip as it is now (trip_state_conflict)', () => {
    expect(tripOfConflict(conflict('trip_state_conflict', fixtures.errorTripConflict.body))?.status).toBe('cancelled');
  });

  it.each<[string, unknown]>([
    ['no trip in the body', { message: 'No' }],
    ['no body', null],
    ['a body that is not an object', 'No'],
    ['a trip that is not an object', { trip: 'nope' }],
    ['a trip without an id and status', { trip: { code: 'TK-1' } }],
  ])('gives nothing for a 409 with %s', (_, body) => {
    expect(tripOfConflict(conflict('trip_state_conflict', body))).toBeNull();
  });

  it('gives nothing for an error that is not a conflict, or not an API error at all', () => {
    const notFound: ApiError = { kind: 'not_found', status: 404, message: null, code: null };

    expect(tripOfConflict(new ApiRequestError(notFound))).toBeNull();
    expect(tripOfConflict(new Error('boom'))).toBeNull();
    expect(tripOfConflict(undefined)).toBeNull();
  });
});
