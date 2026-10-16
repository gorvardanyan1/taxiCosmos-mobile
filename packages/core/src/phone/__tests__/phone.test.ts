import { DEFAULT_PHONE_COUNTRY, formatPhoneForDisplay, formatPhoneInput, isE164, normalizePhone } from '../index.ts';

describe('normalizePhone', () => {
  it('turns every way of writing an Armenian mobile number into the same E.164 number', () => {
    for (const input of [
      '+37491234567',
      '+374 91 234567',
      '091 234567',
      '091-23-45-67',
      '(091) 234567',
      '  +374 (91) 23-45-67 ',
    ]) {
      expect(normalizePhone(input)).toBe('+37491234567');
    }
  });

  it('reads a national number in the country it is told', () => {
    expect(normalizePhone('912 345 678', 'RU')).toBeNull();
    expect(normalizePhone('912 345 6789', 'RU')).toBe('+79123456789');
    expect(normalizePhone('+79123456789', 'AM')).toBe('+79123456789');
  });

  it.each(['', '   ', 'abc', '123', '+374', '+3749123', '091 23', '+999 123456789', '0000000000'])(
    'refuses %p as not a valid number',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it('never returns anything but a valid E.164 string', () => {
    const result = normalizePhone('091 234567');

    expect(result).not.toBeNull();
    expect(isE164(result as string)).toBe(true);
  });

  it('defaults to Armenia', () => {
    expect(DEFAULT_PHONE_COUNTRY).toBe('AM');
  });
});

describe('isE164', () => {
  it.each(['+37491234567', '+79123456789', '+12025550123'])('accepts %s', (value) => {
    expect(isE164(value)).toBe(true);
  });

  it.each(['37491234567', '+0123456789', '+374 91234567', '+37491234567x', '+1234567', '+1234567890123456', ''])(
    'refuses %p',
    (value) => {
      expect(isE164(value)).toBe(false);
    },
  );
});

describe('formatPhoneForDisplay', () => {
  it('writes a stored number the way it is read aloud', () => {
    expect(formatPhoneForDisplay('+37491234567')).toBe('+374 91 234567');
  });

  it('shows what it was given when it is not a number it can read, such as the masked number the server returns', () => {
    expect(formatPhoneForDisplay('+374*****058')).toBe('+374*****058');
  });
});

describe('formatPhoneInput', () => {
  it('formats while typing and only offers the E.164 number once it is complete and valid', () => {
    const steps = ['0', '09', '091', '091 2', '091 23456', '091 234567'].map((typed) => formatPhoneInput(typed));

    expect(steps.slice(0, 5).map((step) => step.e164)).toEqual([null, null, null, null, null]);
    expect(steps[5]).toEqual({ formatted: '091 234567', e164: '+37491234567', valid: true });
  });

  it('accepts an international number typed with the plus sign', () => {
    expect(formatPhoneInput('+37491234567')).toMatchObject({ e164: '+37491234567', valid: true });
  });

  it('is not valid for letters or an empty field', () => {
    expect(formatPhoneInput('')).toEqual({ formatted: '', e164: null, valid: false });
    expect(formatPhoneInput('abc').valid).toBe(false);
  });
});
