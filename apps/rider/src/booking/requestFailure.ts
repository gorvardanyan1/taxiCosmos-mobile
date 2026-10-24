import { getApiError, tripOfConflict, type Trip } from '@taxikosmos/core';

/**
 * Why booking a ride did not work, as the ride options screen tells it. Three different things, three different screens: the request did not get
 * through (`offline`, `failed`, `busy`: try again, the same key means never two rides), the server refused it (`active`, `quote`, `outside`,
 * `refused`: trying the same thing again would not help) and, later, nobody took the ride (a trip state, not a failure of the request).
 */
export type RequestFailure =
  | { kind: 'offline' }
  | { kind: 'failed' }
  | { kind: 'busy' }
  /** The rider already has this trip: open it instead. */
  | { kind: 'active'; trip: Trip }
  /** The price is out of date (expired, unknown, or for another route): ask for a new one. */
  | { kind: 'quote' }
  | { kind: 'outside' }
  | { kind: 'refused'; message: string | null };

const QUOTE_CODES: ReadonlySet<string> = new Set([
  'quote_expired',
  'quote_not_found',
  'quote_route_changed',
  'vehicle_class_not_quoted',
]);

export function requestFailure(error: unknown): RequestFailure {
  const api = getApiError(error);

  if (api === null) {
    return { kind: 'failed' };
  }

  const trip = tripOfConflict(error);

  if (trip !== null && api.code === 'active_trip_exists') {
    return { kind: 'active', trip };
  }

  switch (api.kind) {
    case 'network':
    case 'timeout':
      return { kind: 'offline' };
    case 'server':
    case 'invalid_response':
      return { kind: 'failed' };
    case 'rate_limited':
      return { kind: 'busy' };
    default:
      break;
  }

  if (api.code === 'outside_service_area') {
    return { kind: 'outside' };
  }

  if (api.kind === 'gone' || (api.code !== null && QUOTE_CODES.has(api.code))) {
    return { kind: 'quote' };
  }

  return { kind: 'refused', message: api.message };
}
