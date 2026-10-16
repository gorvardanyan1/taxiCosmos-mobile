/**
 * Idempotency keys for every request that changes something: the server applies a request with a given key once, so a retry after
 * a dropped connection cannot create a second trip, charge or ticket. Keys are UUID v7 (RFC 9562): time-ordered, so they sort in the
 * order they were made, and 36 characters of `0-9a-f-`, which fits the backend's `Idempotency-Key` rule (`^[A-Za-z0-9_-]{8,64}$`).
 */

/** Fills the bytes with random values. */
export type RandomBytes = (length: number) => Uint8Array;

/** The backend's accepted shape for an `Idempotency-Key` header. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

export function isIdempotencyKey(value: string): boolean {
  return KEY_SHAPE.test(value);
}

/**
 * Cryptographically secure random bytes where the platform has them (`crypto.getRandomValues`: Hermes with Expo's crypto polyfill,
 * Node). Where it does not, `Math.random`: an idempotency key needs to be unique, not secret, and an app that cannot reach a secure source
 * still works. Tokens and secrets never come from here.
 */
export function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const crypto = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;

  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);

    return bytes;
  }

  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

export interface IdempotencyKeyOptions {
  now?: () => number;
  randomBytes?: RandomBytes;
}

/**
 * Makes a generator of UUID v7 keys. Two keys made in the same millisecond still sort in the order they were made (the 12 bits after
 * the version carry a counter, RFC 9562 §6.2 method 1).
 */
export function createIdempotencyKeyGenerator({
  now = Date.now,
  randomBytes = defaultRandomBytes,
}: IdempotencyKeyOptions = {}): () => string {
  let lastMillis = -1;
  let counter = 0;

  return () => {
    let millis = now();

    if (millis > lastMillis) {
      lastMillis = millis;
      counter = randomBytes(2).reduce((value, byte) => (value << 8) | byte, 0) & 0x7ff;
    } else {
      // Same millisecond (or the clock moved back): keep the timestamp and count up so the order holds.
      millis = lastMillis;
      counter += 1;

      if (counter > 0xfff) {
        lastMillis += 1;
        millis = lastMillis;
        counter = 0;
      }
    }

    const random = randomBytes(8);
    const bytes = new Uint8Array(16);
    // 48-bit big-endian Unix time in milliseconds.
    for (let i = 5, value = millis; i >= 0; i--, value = Math.floor(value / 256)) {
      bytes[i] = value % 256;
    }
    bytes[6] = 0x70 | (counter >> 8);
    bytes[7] = counter & 0xff;
    bytes[8] = 0x80 | ((random[0] ?? 0) & 0x3f);
    for (let i = 1; i < 8; i++) {
      bytes[8 + i] = random[i] ?? 0;
    }

    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
}

/** A fresh idempotency key. */
export const newIdempotencyKey: () => string = createIdempotencyKeyGenerator();
