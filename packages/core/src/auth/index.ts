/**
 * The sign-in code, as the app can know it. The server answers every bad code the same way (422 "invalid or has expired"), so it never says
 * which it was: the app keeps the one-time facts it was told (the code lives `expires_in` seconds) and counts its own wrong guesses against
 * the server's limit, so the screen can tell "wrong" from "expired" from "locked" and send the person to the right next step.
 * Pure (the clock is a parameter), so every case can be tested without waiting.
 */

/** The server stops accepting a code after this many wrong guesses (`docs/mobile-auth.md`). */
export const OTP_MAX_WRONG_GUESSES = 5;
/** Digits in a code. */
export const OTP_LENGTH = 6;
/** The code request answers 202 without saying when another may be asked for; the server allows one a minute per number. */
export const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

export interface OtpChallenge {
  /** E.164 number the code was sent to. */
  phone: string;
  /** Epoch milliseconds after which the code no longer works. */
  expiresAt: number;
  wrongGuesses: number;
}

/** `open`: a guess may be sent. `expired` and `locked`: only a new code helps. */
export type OtpCodeState = 'open' | 'expired' | 'locked';

export function startChallenge(phone: string, expiresInSeconds: number, now: number): OtpChallenge {
  return { phone, expiresAt: now + expiresInSeconds * 1000, wrongGuesses: 0 };
}

export function codeState(challenge: OtpChallenge, now: number): OtpCodeState {
  if (now >= challenge.expiresAt) {
    return 'expired';
  }

  return challenge.wrongGuesses >= OTP_MAX_WRONG_GUESSES ? 'locked' : 'open';
}

export function recordWrongGuess(challenge: OtpChallenge): OtpChallenge {
  return { ...challenge, wrongGuesses: challenge.wrongGuesses + 1 };
}

/** Whole seconds left until `at` (rounded up, so the countdown never shows 0 while there is still time), never negative. */
export function secondsUntil(at: number, now: number): number {
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** A name the profile accepts (`PATCH /me`: 1 to 120 characters): trimmed, or `null` when it is empty or too long. */
export function validName(input: string): string | null {
  const name = input.trim();

  return name.length >= 1 && name.length <= 120 ? name : null;
}
