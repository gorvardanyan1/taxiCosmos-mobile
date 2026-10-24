import { isTripFinal, type Trip } from '@taxikosmos/core';
import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from './keys';

/** A trip is known as it is now (booked, cancelled, polled, or shown by a 409): the trip's own entry and "the current trip" both follow it. */
export function putTrip(queryClient: QueryClient, trip: Trip): void {
  queryClient.setQueryData(queryKeys.trips.detail(trip.id), trip);
  queryClient.setQueryData(queryKeys.trips.current, isTripFinal(trip.status) ? null : trip);
}
