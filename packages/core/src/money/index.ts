import type { Money } from '../api/types.ts';

/**
 * Money is an integer in minor units plus a currency code (`{ amount: 1192, currency: 'AMD' }`); it is turned into text only here,
 * when something is drawn. No arithmetic on prices happens in the app: totals come from the server.
 */

/**
 * Minor-unit digits per currency, the same table as the backend's `config/taxikosmos.php`: 1 AMD is the smallest unit, 1 USD is 100
 * cents. (ISO 4217 lists two digits for AMD, but this system stores whole drams.)
 */
export const CURRENCY_DECIMALS: Readonly<Record<string, number>> = { AMD: 0, USD: 2, EUR: 2 };

/** Digits after the decimal point for a currency; for one the backend does not list, what Intl says for it. */
export function decimalsFor(currency: string): number {
  const known = CURRENCY_DECIMALS[currency];

  if (known !== undefined) {
    return known;
  }

  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
}

function assertMinorUnits(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError(`A money amount is an integer in minor units; got ${amount}.`);
  }
}

/** `1192 AMD` → `1,192 AMD` / `1 192 ֏` depending on the locale; `2480 USD` → `$24.80`. */
export function formatMoney(money: Money, locale: string): string {
  assertMinorUnits(money.amount);
  const decimals = decimalsFor(money.currency);

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    // The dram sign (֏) in every language: the default would print the letters "AMD" in English and Russian.
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(money.amount / 10 ** decimals);
}

/** A price range such as `1,073 – 1,311`: the currency symbol once. Both ends are in the same currency. */
export function formatMoneyRange(min: number, max: number, currency: string, locale: string): string {
  if (min === max) {
    return formatMoney({ amount: min, currency }, locale);
  }

  const low = formatMoney({ amount: min, currency }, locale);
  const high = formatMoney({ amount: max, currency }, locale);

  return `${low} – ${high}`;
}
