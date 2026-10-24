import { userEvent } from '@testing-library/react-native';
import * as fixtures from '@taxikosmos/core/fixtures';
import { renderRouter, screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import type { Trip } from '@taxikosmos/core';

import { ok, tripWith, type Reply } from './backend';

type Class = 'economy' | 'comfort' | 'business';
export const estimate = (vehicle_class: Class, amount: number, surge = '1.00') => ({
  vehicle_class,
  currency: 'AMD',
  amount,
  amount_min: Math.round(amount * 0.9),
  amount_max: Math.round(amount * 1.1),
  surge_multiplier: surge,
  eta_to_pickup_seconds: null,
});
/** economy 900–1,100, comfort 1,350–1,650 (busy ×1.5), business 2,250–2,750. */
export const PRICES = [estimate('economy', 1000), estimate('comfort', 1500, '1.50'), estimate('business', 2500)];
export const quoteWith = (estimates: unknown[], expiresInMinutes = 10, id = fixtures.fareEstimate.body.quote_id) =>
  ok({
    ...fixtures.fareEstimate,
    body: {
      ...fixtures.fareEstimate.body,
      quote_id: id,
      estimates,
      expires_at: new Date(Date.now() + expiresInMinutes * 60_000).toISOString(),
    },
  });

export type User = ReturnType<typeof userEvent.setup>;

/** Home > Where to? > a drop-off > Continue: the way a rider gets to the ride options. */
export async function openRideOptions(user: User) {
  renderRouter('./src/app', { initialUrl: '/' });
  await user.press(await screen.findByRole('button', { name: /^Drop-off: / }));
  await user.type(await screen.findByLabelText('Drop-off'), 'Abov');
  await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));
  await user.press(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByRole('header', { name: 'Choose your ride' });
}

/** The listeners the app registered for the app coming back to the front; calling them is the rider opening the app again. */
export function captureAppState() {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    listeners.push(listener as (state: AppStateStatus) => void);

    return { remove: () => void listeners.splice(listeners.indexOf(listener as (state: AppStateStatus) => void), 1) };
  });

  return () => listeners.slice().forEach((listener) => listener('active'));
}

/** A driver and vehicle for a trip that has been matched (the recorded trips are still searching). */
export const MATCHED = {
  status: 'matched',
  driver: { name: 'Aram M.', rating_avg: 4.9, rating_count: 21 },
  vehicle: { make: 'Toyota', model: 'Camry', color: 'Silver', plate_number: 'FIX 123', vehicle_class: 'economy' },
} as const;

/** `GET /trips/{id}` (or `/trips/current`, or a cancel) answering with the recorded trip changed as the test needs. */
export const tripReply = (changes: Partial<Trip>, status = 200): Reply => ({
  status,
  body: { data: tripWith(changes) },
});
