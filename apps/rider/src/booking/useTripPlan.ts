import { useFareEstimate } from '@taxikosmos/api-client';
import { distanceMeters, errorCodeOf, getApiError, type AddressPoint, type FareQuote } from '@taxikosmos/core';
import { useEffect } from 'react';

/** Closer than this, pickup and drop-off are the same place (and not worth a price). */
export const SAME_SPOT_METERS = 30;

export type TripPlanStatus =
  'idle' | 'same_spot' | 'checking' | 'ready' | 'outside' | 'no_prices' | 'offline' | 'failed';

export interface TripPlan {
  status: TripPlanStatus;
  /** The price quote for this route, once the pickup is known to be served. */
  quote: FareQuote | undefined;
  /** Asks again (after a failure). */
  retry: () => void;
  /** A quote that is still valid: the one in hand, or a new one when it has expired (a rider can sit on the home screen for a while). */
  freshQuote: () => Promise<FareQuote>;
}

/**
 * Asks the backend for a price as soon as the rider has a pickup and a drop-off: the answer is also the check that the pickup is inside
 * a service zone, so "not available here" shows on the home screen, before the ride options. Only the latest route counts: a slow answer for
 * a route the rider has already changed is dropped by the mutation.
 */
export function useTripPlan(pickup: AddressPoint | null, dropoff: AddressPoint | null): TripPlan {
  const estimate = useFareEstimate();
  const { mutate, mutateAsync, reset } = estimate;
  const same = pickup !== null && dropoff !== null && distanceMeters(pickup, dropoff) < SAME_SPOT_METERS;
  const pickupLat = pickup?.lat;
  const pickupLng = pickup?.lng;
  const dropoffLat = dropoff?.lat;
  const dropoffLng = dropoff?.lng;

  useEffect(() => {
    if (
      pickupLat === undefined ||
      pickupLng === undefined ||
      dropoffLat === undefined ||
      dropoffLng === undefined ||
      same
    ) {
      reset();

      return;
    }

    mutate({ pickup: { lat: pickupLat, lng: pickupLng }, dropoff: { lat: dropoffLat, lng: dropoffLng } });
  }, [pickupLat, pickupLng, dropoffLat, dropoffLng, same, mutate, reset]);

  const retry = () => {
    if (pickup !== null && dropoff !== null && !same) {
      mutate({ pickup: { lat: pickup.lat, lng: pickup.lng }, dropoff: { lat: dropoff.lat, lng: dropoff.lng } });
    }
  };

  const freshQuote = async (): Promise<FareQuote> => {
    if (estimate.data !== undefined && new Date(estimate.data.expires_at).getTime() > Date.now()) {
      return estimate.data;
    }

    if (pickup === null || dropoff === null) {
      throw new Error('There is no route to price.');
    }

    return mutateAsync({
      pickup: { lat: pickup.lat, lng: pickup.lng },
      dropoff: { lat: dropoff.lat, lng: dropoff.lng },
    });
  };

  return { status: statusOf(pickup, dropoff, same, estimate), quote: estimate.data, retry, freshQuote };
}

/** Why a price could not be had: the pickup is not served, the area has no prices, there is no connection, or something else went wrong. */
export function estimateFailure(error: unknown): 'outside' | 'no_prices' | 'offline' | 'failed' {
  const code = errorCodeOf(error);
  const kind = getApiError(error)?.kind;

  return code === 'outside_service_area'
    ? 'outside'
    : code === 'no_fare_rules'
      ? 'no_prices'
      : kind === 'network' || kind === 'timeout'
        ? 'offline'
        : 'failed';
}

function statusOf(
  pickup: AddressPoint | null,
  dropoff: AddressPoint | null,
  same: boolean,
  estimate: ReturnType<typeof useFareEstimate>,
): TripPlanStatus {
  if (pickup === null || dropoff === null) {
    return 'idle';
  }

  if (same) {
    return 'same_spot';
  }

  if (estimate.isError) {
    return estimateFailure(estimate.error);
  }

  return estimate.isSuccess ? 'ready' : 'checking';
}
