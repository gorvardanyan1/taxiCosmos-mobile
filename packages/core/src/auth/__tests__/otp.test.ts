import {
  codeState,
  OTP_MAX_WRONG_GUESSES,
  recordWrongGuess,
  secondsUntil,
  startChallenge,
  validName,
} from '../index.ts';

const T0 = 1_000_000;

describe('one-time code state', () => {
  it('is open straight after it is sent, and counts the code as living expires_in seconds', () => {
    const challenge = startChallenge('+37491770001', 300, T0);

    expect(challenge).toEqual({ phone: '+37491770001', expiresAt: T0 + 300_000, wrongGuesses: 0 });
    expect(codeState(challenge, T0)).toBe('open');
    expect(codeState(challenge, T0 + 299_999)).toBe('open');
  });

  it('expires exactly at the deadline', () => {
    const challenge = startChallenge('+37491770001', 300, T0);

    expect(codeState(challenge, T0 + 300_000)).toBe('expired');
    expect(codeState(challenge, T0 + 999_999)).toBe('expired');
  });

  it('locks after the fifth wrong guess, not the fourth', () => {
    let challenge = startChallenge('+37491770001', 300, T0);

    for (let guess = 1; guess < OTP_MAX_WRONG_GUESSES; guess++) {
      challenge = recordWrongGuess(challenge);
      expect(codeState(challenge, T0)).toBe('open');
    }

    challenge = recordWrongGuess(challenge);

    expect(challenge.wrongGuesses).toBe(5);
    expect(codeState(challenge, T0)).toBe('locked');
  });

  it('says expired, not locked, once the code is gone, and does not change the challenge it was given', () => {
    const challenge = startChallenge('+37491770001', 300, T0);
    const locked = { ...challenge, wrongGuesses: 5 };

    expect(codeState(locked, T0 + 300_000)).toBe('expired');
    recordWrongGuess(challenge);
    expect(challenge.wrongGuesses).toBe(0);
  });
});

describe('secondsUntil', () => {
  it('rounds up and stops at zero', () => {
    expect(secondsUntil(T0 + 60_000, T0)).toBe(60);
    expect(secondsUntil(T0 + 59_001, T0)).toBe(60);
    expect(secondsUntil(T0 + 1, T0)).toBe(1);
    expect(secondsUntil(T0, T0)).toBe(0);
    expect(secondsUntil(T0 - 5_000, T0)).toBe(0);
  });
});

describe('validName', () => {
  it('trims, and accepts 1 to 120 characters', () => {
    expect(validName('  Anna  ')).toBe('Anna');
    expect(validName('A')).toBe('A');
    expect(validName('x'.repeat(120))).toBe('x'.repeat(120));
  });

  it('refuses empty, blank and too long', () => {
    expect(validName('')).toBeNull();
    expect(validName('   ')).toBeNull();
    expect(validName('x'.repeat(121))).toBeNull();
    expect(validName(` ${'x'.repeat(121)} `)).toBeNull();
  });
});
