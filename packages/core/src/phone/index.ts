import { AsYouType, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';

/**
 * Phone numbers leave the app in E.164 (`+37491234567`) and nowhere else: the backend never guesses at a national format. The
 * country is only used to read a number typed without its `+` prefix; the default is Armenia, the launch market.
 */

export type { CountryCode };

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'AM';

/** E.164: a plus sign, a non-zero first digit, 8 to 15 digits in total. */
const E164 = /^\+[1-9]\d{7,14}$/;

export function isE164(value: string): boolean {
  return E164.test(value);
}

/** The E.164 form of a valid number, or `null` when the input is not a valid phone number. */
export function normalizePhone(input: string, country: CountryCode = DEFAULT_PHONE_COUNTRY): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), country);

  return parsed?.isValid() ? parsed.number : null;
}

/** How a stored E.164 number reads on screen: `+374 91 234567`. Falls back to the input when it cannot be parsed. */
export function formatPhoneForDisplay(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

export interface PhoneInputState {
  /** The text for the field, formatted as the person types (`091 234567`). */
  formatted: string;
  /** The E.164 number once the input is a complete, valid number; otherwise `null`. */
  e164: string | null;
  /** The input has the right shape but is not (yet) a valid number. */
  valid: boolean;
}

/** Formats what the person has typed so far and tells whether it is a complete valid number. Feed it every keystroke. */
export function formatPhoneInput(input: string, country: CountryCode = DEFAULT_PHONE_COUNTRY): PhoneInputState {
  const formatter = new AsYouType(country);
  const formatted = formatter.input(input);
  const number = formatter.getNumber();
  const valid = number?.isValid() === true;

  return { formatted, e164: valid ? number.number : null, valid };
}
