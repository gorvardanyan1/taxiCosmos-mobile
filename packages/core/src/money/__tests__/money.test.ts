import { CURRENCY_DECIMALS, decimalsFor, formatMoney, formatMoneyRange } from '../index.ts';

/** Digits only, so the assertions do not depend on which ICU version prints a space or a non-breaking space. */
const digits = (text: string) => text.replace(/\D/g, '');

describe('decimalsFor', () => {
  it('uses the backend table: whole drams, cents for dollars and euros', () => {
    expect(CURRENCY_DECIMALS).toEqual({ AMD: 0, USD: 2, EUR: 2 });
    expect(decimalsFor('AMD')).toBe(0);
    expect(decimalsFor('USD')).toBe(2);
  });

  it('asks Intl for a currency the backend does not list', () => {
    expect(decimalsFor('JPY')).toBe(0);
    expect(decimalsFor('KWD')).toBe(3);
  });
});

describe('formatMoney', () => {
  it('shows AMD amounts as whole drams, not hundredths', () => {
    expect(digits(formatMoney({ amount: 1192, currency: 'AMD' }, 'en'))).toBe('1192');
    expect(formatMoney({ amount: 1192, currency: 'AMD' }, 'en')).toContain('1,192');
  });

  it('turns USD minor units into dollars and cents', () => {
    expect(formatMoney({ amount: 2480, currency: 'USD' }, 'en')).toBe('$24.80');
    expect(formatMoney({ amount: 5, currency: 'USD' }, 'en')).toBe('$0.05');
    expect(formatMoney({ amount: 0, currency: 'USD' }, 'en')).toBe('$0.00');
  });

  it('renders cents exactly, with no float drift', () => {
    expect(formatMoney({ amount: 1005, currency: 'USD' }, 'en')).toBe('$10.05');
    expect(formatMoney({ amount: 1, currency: 'EUR' }, 'en')).toBe('€0.01');
    expect(formatMoney({ amount: 9_007_199_254_740, currency: 'USD' }, 'en')).toBe('$90,071,992,547.40');
  });

  it('follows the language of the app', () => {
    const russian = formatMoney({ amount: 1192, currency: 'AMD' }, 'ru');
    const armenian = formatMoney({ amount: 1192, currency: 'AMD' }, 'hy');

    expect(digits(russian)).toBe('1192');
    expect(digits(armenian)).toBe('1192');
    expect(russian).not.toContain('1,192');
  });

  it('shows a refund or discount as a negative amount', () => {
    expect(formatMoney({ amount: -2480, currency: 'USD' }, 'en')).toContain('24.80');
    expect(formatMoney({ amount: -2480, currency: 'USD' }, 'en')).toMatch(/^-|−|\(/);
  });

  it.each([1.5, 0.1 + 0.2, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'refuses %p: an amount is an integer count of minor units',
    (amount) => {
      expect(() => formatMoney({ amount, currency: 'USD' }, 'en')).toThrow(RangeError);
    },
  );
});

describe('formatMoneyRange', () => {
  it('shows both ends of a fare estimate', () => {
    const range = formatMoneyRange(1073, 1311, 'AMD', 'en');

    expect(range).toContain('1,073');
    expect(range).toContain('1,311');
    expect(range).toContain('–');
  });

  it('shows one price when the two ends are the same', () => {
    expect(formatMoneyRange(2480, 2480, 'USD', 'en')).toBe('$24.80');
  });
});
