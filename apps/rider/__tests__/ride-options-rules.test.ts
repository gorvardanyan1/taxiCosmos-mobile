import type { FareEstimate, FareQuote } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';

import { chosenEstimate, surgeOf, usableEstimates } from '../src/booking/rideOptions';

const estimate = (changes: Partial<FareEstimate> = {}): FareEstimate => ({
  vehicle_class: 'economy',
  currency: 'AMD',
  amount: 1000,
  amount_min: 900,
  amount_max: 1100,
  surge_multiplier: '1.00',
  eta_to_pickup_seconds: null,
  ...changes,
});
const quoteOf = (estimates: FareEstimate[]): FareQuote => ({ ...fixtures.fareEstimate.body, estimates });

describe('usableEstimates', () => {
  it('keeps a priced class and drops a price that is zero, negative, fractional or not a number', () => {
    const good = estimate({ vehicle_class: 'comfort' });

    expect(
      usableEstimates(
        quoteOf([
          estimate({ amount: 0 }),
          estimate({ amount: -1 }),
          estimate({ amount: 10.5 }),
          estimate({ amount: Number.NaN }),
          good,
        ]),
      ),
    ).toEqual([good]);
  });

  it('drops a range that is empty, inverted, or has a zero or fractional end', () => {
    expect(
      usableEstimates(
        quoteOf([
          estimate({ amount_min: 0 }),
          estimate({ amount_min: 1200, amount_max: 1100 }),
          estimate({ amount_max: 1100.5 }),
          estimate({ amount_min: 900.5 }),
        ]),
      ),
    ).toEqual([]);
  });

  it('accepts a range whose ends are equal', () => {
    expect(usableEstimates(quoteOf([estimate({ amount_min: 1000, amount_max: 1000 })]))).toHaveLength(1);
  });

  it('is empty for a quote with no estimates', () => {
    expect(usableEstimates(quoteOf([]))).toEqual([]);
  });
});

describe('chosenEstimate', () => {
  const economy = estimate();
  const comfort = estimate({ vehicle_class: 'comfort' });

  it('is the class asked for when it is priced, otherwise the first class, otherwise nothing', () => {
    expect(chosenEstimate([economy, comfort], 'comfort')).toBe(comfort);
    expect(chosenEstimate([economy, comfort], null)).toBe(economy);
    expect(chosenEstimate([economy, comfort], 'business')).toBe(economy);
    expect(chosenEstimate([], 'economy')).toBeNull();
  });
});

describe('surgeOf', () => {
  it.each([
    ['1.00', null],
    ['1', null],
    ['0.80', null],
    ['1.01', 1.01],
    ['1.50', 1.5],
    ['3.00', 3],
    ['not a number', null],
    ['', null],
  ])('reads %s as %s', (multiplier, expected) => {
    expect(surgeOf(estimate({ surge_multiplier: multiplier }))).toBe(expected);
  });
});
