import type { AddressPoint } from '@taxikosmos/core';

import type { TripPlanStatus } from './useTripPlan';

export type ContinueReason =
  | 'locating'
  | 'need_pickup'
  | 'need_dropoff'
  | 'same_spot'
  | 'checking'
  | 'outside'
  | 'no_prices'
  | 'offline'
  | 'failed';

/**
 * Whether the rider may go on to the ride options, and if not, why: the one reason the disabled button shows. Going on needs a pickup and a
 * drop-off that both have an address, that are not the same place, and a price (which also proves the pickup is inside a service zone).
 * Reasons are listed from what the rider must do first to what they can only wait for.
 */
export function continueState(input: {
  pickup: AddressPoint | null;
  dropoff: AddressPoint | null;
  locating: boolean;
  plan: TripPlanStatus;
}): { enabled: true } | { enabled: false; reason: ContinueReason } {
  if (input.pickup === null) {
    return { enabled: false, reason: input.locating ? 'locating' : 'need_pickup' };
  }

  if (input.dropoff === null) {
    return { enabled: false, reason: 'need_dropoff' };
  }

  switch (input.plan) {
    case 'ready':
      return { enabled: true };
    case 'same_spot':
      return { enabled: false, reason: 'same_spot' };
    case 'outside':
      return { enabled: false, reason: 'outside' };
    case 'no_prices':
      return { enabled: false, reason: 'no_prices' };
    case 'offline':
      return { enabled: false, reason: 'offline' };
    case 'failed':
      return { enabled: false, reason: 'failed' };
    default:
      return { enabled: false, reason: 'checking' };
  }
}
