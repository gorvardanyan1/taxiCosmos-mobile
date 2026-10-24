import type { Data, Trip, TripRequestBody } from '@taxikosmos/core';

import type { ApiClient } from '../client';

export function tripsApi(client: ApiClient) {
  return {
    /**
     * Books a ride from a fare quote. The server honours the idempotency key, so a retry after a dropped connection (or a second tap) gets the
     * first answer back and cannot create a second trip.
     */
    async request(body: TripRequestBody, operation?: string): Promise<Trip> {
      return (await client.post<Data<Trip>>('/trips', { body, operation, retries: 2 })).data.data;
    },

    /** The rider's trip that is not finished, or `null` (the server answers 204 with no body). */
    async current(signal?: AbortSignal): Promise<Trip | null> {
      const response = await client.get<Data<Trip> | null>('/trips/current', { signal });

      return response.status === 204 || response.data === null ? null : response.data.data;
    },

    /** One of the rider's trips, in any state (a finished trip stays readable here after it left `current`). */
    async get(id: number, signal?: AbortSignal): Promise<Trip> {
      return (await client.get<Data<Trip>>(`/trips/${id}`, { signal })).data.data;
    },

    /** Cancels a trip that has no ride in progress. A trip that already moved on answers 409 with the trip as it is. */
    async cancel(id: number, operation?: string): Promise<Trip> {
      return (await client.post<Data<Trip>>(`/trips/${id}/cancel`, { body: {}, operation, retries: 2 })).data.data;
    },
  };
}
