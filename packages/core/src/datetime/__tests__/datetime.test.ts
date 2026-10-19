import { formatDate, toDate } from '../index.ts';

const MOMENT = '2026-06-24T06:42:00Z';

describe('toDate', () => {
  it('reads an ISO string, a timestamp and a Date', () => {
    expect(toDate(MOMENT)?.toISOString()).toBe('2026-06-24T06:42:00.000Z');
    expect(toDate(Date.parse(MOMENT))?.toISOString()).toBe('2026-06-24T06:42:00.000Z');

    const date = new Date(MOMENT);
    expect(toDate(date)).toBe(date);
  });

  it('returns null for something that is not a moment', () => {
    expect(toDate('not a date')).toBeNull();
    expect(toDate(Number.NaN)).toBeNull();
  });
});

describe('formatDate', () => {
  it('prints the weekday and month in the language of the locale', () => {
    expect(formatDate(MOMENT, 'en', 'weekdayDate', 'UTC')).toBe('Wednesday, June 24');
    expect(formatDate(MOMENT, 'ru', 'weekdayDate', 'UTC')).toBe('среда, 24 июня');
    expect(formatDate(MOMENT, 'hy', 'weekdayDate', 'UTC')).toContain('հունիսի');
  });

  it('shows the time in the requested time zone, not the machine’s', () => {
    expect(formatDate(MOMENT, 'en', 'time', 'UTC')).toBe('06:42 AM');
    expect(formatDate(MOMENT, 'en', 'time', 'Asia/Yerevan')).toBe('10:42 AM');
    expect(formatDate(MOMENT, 'ru', 'time', 'Asia/Yerevan')).toBe('10:42');
  });

  it('defaults to a long calendar date', () => {
    expect(formatDate(MOMENT, 'en', undefined, 'UTC')).toBe('June 24, 2026');
    expect(formatDate(MOMENT, 'en', 'shortDate', 'UTC')).toBe('Jun 24');
    expect(formatDate(MOMENT, 'en', 'dateTime', 'UTC')).toContain('Jun 24, 2026');
  });

  it('prints nothing for an invalid value instead of "Invalid Date"', () => {
    expect(formatDate('garbage', 'en')).toBe('');
  });
});
