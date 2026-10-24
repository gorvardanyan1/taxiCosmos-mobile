import type { FareEstimate, FareQuote, VehicleClass } from '@taxikosmos/core';

/**
 * The prices worth showing: one per class, each a whole, positive amount of money with a sensible range. A quote that arrives with a zero or
 * broken price shows no card for it (and no cards at all if none is usable), so the rider is never offered a ride for nothing.
 */
export function usableEstimates(quote: FareQuote): FareEstimate[] {
  return quote.estimates.filter(
    (estimate) =>
      Number.isSafeInteger(estimate.amount) &&
      estimate.amount > 0 &&
      Number.isSafeInteger(estimate.amount_min) &&
      Number.isSafeInteger(estimate.amount_max) &&
      estimate.amount_min > 0 &&
      estimate.amount_min <= estimate.amount_max,
  );
}

/** The class the rider has picked if the quote still prices it, otherwise the first class priced. */
export function chosenEstimate(estimates: readonly FareEstimate[], wanted: VehicleClass | null): FareEstimate | null {
  return estimates.find((estimate) => estimate.vehicle_class === wanted) ?? estimates[0] ?? null;
}

/** The surge multiplier as a number when prices are raised (above 1.00), otherwise `null`. Multipliers are decimal strings: `"1.50"`. */
export function surgeOf(estimate: FareEstimate): number | null {
  const multiplier = Number(estimate.surge_multiplier);

  return Number.isFinite(multiplier) && multiplier > 1 ? multiplier : null;
}
