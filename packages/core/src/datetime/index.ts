/**
 * Dates reach the app as ISO 8601 strings from the server (UTC) and are turned into text only here, when something is drawn, in the
 * user's language and time zone. `Intl` does the work, so Russian and Armenian month names and the 12/24-hour clock come for free.
 */

export type DateInput = Date | string | number;

export type DateStyle = 'date' | 'dateTime' | 'time' | 'weekdayDate' | 'shortDate';

const STYLES: Readonly<Record<DateStyle, Intl.DateTimeFormatOptions>> = {
  /** `24 June 2026` */
  date: { day: 'numeric', month: 'long', year: 'numeric' },
  /** `24 Jun 2026, 10:42` */
  dateTime: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  /** `10:42` */
  time: { hour: '2-digit', minute: '2-digit' },
  /** `Monday, June 24` (the template's header subtitle) */
  weekdayDate: { weekday: 'long', month: 'long', day: 'numeric' },
  /** `24 Jun` */
  shortDate: { day: 'numeric', month: 'short' },
};

/** A `Date` from an ISO string, a timestamp or a `Date`; `null` when it is not a real moment, so a bad value never prints "Invalid Date". */
export function toDate(input: DateInput): Date | null {
  const date = input instanceof Date ? input : new Date(input);

  return Number.isNaN(date.getTime()) ? null : date;
}

/** A moment in the given style and locale; an empty string for a value that is not a date. `timeZone` defaults to the device's. */
export function formatDate(input: DateInput, locale: string, style: DateStyle = 'date', timeZone?: string): string {
  const date = toDate(input);

  if (date === null) {
    return '';
  }

  return new Intl.DateTimeFormat(locale, { ...STYLES[style], ...(timeZone ? { timeZone } : {}) }).format(date);
}
