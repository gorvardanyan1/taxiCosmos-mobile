import { useFareEstimate } from '@taxikosmos/api-client';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { chosenEstimate, usableEstimates } from './rideOptions';
import { useTripDraft } from './TripDraft';
import { estimateFailure } from './useTripPlan';

export type QuoteStatus = 'ready' | 'refreshing' | 'outside' | 'no_prices' | 'offline' | 'failed';

/**
 * Keeps the price on the ride options true. A quote lives ten minutes; once it has expired (the rider sat on the screen, or the app was in
 * the pocket) it is asked for again at that moment, the new price replaces the old one, and the class the rider chose stays chosen if it is
 * still priced. While the new price is on its way the old cards stay (marked busy); if it cannot be had the status says why and the screen
 * shows a retry instead of any price. A failed estimate and a quote without a usable price both count as "no price".
 */
export function useQuoteLifecycle(): { status: QuoteStatus; refresh: () => Promise<void> } {
  const { draft, updateDraft } = useTripDraft();
  const estimate = useFareEstimate();
  const { mutateAsync } = estimate;
  const running = useRef(false);
  const pickup = draft?.pickup;
  const dropoff = draft?.dropoff;
  const expiresAt = draft?.quote.expires_at;
  const vehicleClass = draft?.vehicleClass ?? null;

  const refresh = async () => {
    if (running.current || pickup === undefined || dropoff === undefined) {
      return;
    }

    running.current = true;

    try {
      const quote = await mutateAsync({
        pickup: { lat: pickup.lat, lng: pickup.lng },
        dropoff: { lat: dropoff.lat, lng: dropoff.lng },
      });
      updateDraft({ quote, vehicleClass: chosenEstimate(usableEstimates(quote), vehicleClass)?.vehicle_class ?? null });
    } catch {
      // The failure is on screen (the status), with its own retry.
    } finally {
      running.current = false;
    }
  };

  const expiry = expiresAt === undefined ? null : new Date(expiresAt).getTime();
  // Always the latest closure, so a timer set earlier never refreshes with a route the rider has since left.
  const latest = useRef(refresh);

  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    if (expiry === null) {
      return undefined;
    }

    const timer = setTimeout(() => void latest.current(), Math.max(0, expiry - Date.now()));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && expiry <= Date.now()) {
        void latest.current();
      }
    });

    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [expiry]);

  const failed = estimate.isError ? estimateFailure(estimate.error) : null;

  return {
    status: estimate.isPending ? 'refreshing' : (failed ?? 'ready'),
    refresh,
  };
}
