import { getApiError } from './errors.ts';
import type { Trip, TripStatus } from './types.ts';

/** Completed, cancelled and no-driver trips never change again; `GET /trips/current` no longer returns them. */
export function isTripFinal(status: TripStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'no_driver_found';
}

/**
 * The trip a 409 carries: `active_trip_exists` (the rider already has this trip) and `trip_state_conflict` (the step does not fit the
 * trip as it is now) both answer with the current trip, so the app shows the real state instead of guessing. `null` for any other error.
 */
export function tripOfConflict(error: unknown): Trip | null {
  const api = getApiError(error);

  if (api?.kind !== 'conflict' || typeof api.body !== 'object' || api.body === null) {
    return null;
  }

  const trip = (api.body as { trip?: unknown }).trip;

  return typeof trip === 'object' && trip !== null && 'id' in trip && 'status' in trip ? (trip as Trip) : null;
}
