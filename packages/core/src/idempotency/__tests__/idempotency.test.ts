import { createIdempotencyKeyGenerator, defaultRandomBytes, isIdempotencyKey, newIdempotencyKey } from '../index.ts';

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Deterministic bytes: 0, 1, 2… so a test can predict every digit. */
const sequence = (): ((length: number) => Uint8Array) => {
  let next = 0;

  return (length) => Uint8Array.from({ length }, () => next++ % 256);
};

describe('createIdempotencyKeyGenerator', () => {
  it('makes a UUID v7: version 7, RFC variant, the time in the first 48 bits', () => {
    const key = createIdempotencyKeyGenerator({ now: () => 0x0197a1b2c3d4, randomBytes: sequence() })();

    expect(key).toMatch(UUID_V7);
    expect(key.replace(/-/g, '').slice(0, 12)).toBe('0197a1b2c3d4');
    expect(key[14]).toBe('7');
    expect('89ab').toContain(key[19]);
  });

  it('is accepted by the backend Idempotency-Key rule', () => {
    expect(isIdempotencyKey(createIdempotencyKeyGenerator()())).toBe(true);
  });

  it('sorts keys in the order they were made, even within one millisecond', () => {
    const next = createIdempotencyKeyGenerator({ now: () => 1_700_000_000_000 });
    const keys = Array.from({ length: 50 }, next);

    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(50);
  });

  it('keeps the order when the clock moves backwards', () => {
    let clock = 2_000;
    const next = createIdempotencyKeyGenerator({ now: () => clock });
    const first = next();
    clock = 1_000;
    const second = next();

    expect(second > first).toBe(true);
    expect(second.replace(/-/g, '').slice(0, 12)).toBe(first.replace(/-/g, '').slice(0, 12));
  });

  it('moves to the next millisecond when more than 4096 keys are made in one', () => {
    const next = createIdempotencyKeyGenerator({ now: () => 5_000, randomBytes: (length) => new Uint8Array(length) });
    const keys = Array.from({ length: 4_200 }, next);

    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(4_200);
  });

  it('puts later times after earlier ones', () => {
    let clock = 1_000;
    const next = createIdempotencyKeyGenerator({ now: () => clock });
    const early = next();
    clock = 2_000;

    expect(next() > early).toBe(true);
  });

  it('never repeats across many keys', () => {
    const keys = new Set(Array.from({ length: 2_000 }, newIdempotencyKey));

    expect(keys.size).toBe(2_000);
  });
});

describe('defaultRandomBytes', () => {
  const original = (globalThis as { crypto?: unknown }).crypto;
  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true, writable: true });
  });

  it('uses the secure source when the platform has one', () => {
    const getRandomValues = jest.fn((array: Uint8Array) => array.fill(7));
    Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues }, configurable: true, writable: true });

    expect(Array.from(defaultRandomBytes(4))).toEqual([7, 7, 7, 7]);
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('still returns the requested number of bytes on a platform without one (a key must be unique, not secret)', () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    const bytes = defaultRandomBytes(16);

    expect(bytes).toHaveLength(16);
    expect(new Set(Array.from({ length: 20 }, () => Array.from(defaultRandomBytes(8)).join())).size).toBeGreaterThan(
      15,
    );
  });
});

describe('isIdempotencyKey', () => {
  it.each(['0197a1b2-c3d4-7000-8000-000000000001', 'abcdefgh', 'A_b-C_d-1234', 'x'.repeat(64)])('accepts %s', (key) => {
    expect(isIdempotencyKey(key)).toBe(true);
  });

  it.each(['short', '', 'has space in it', 'emoji-🚕-key-1234', 'x'.repeat(65), 'semi;colon-1234'])(
    'refuses %p',
    (key) => {
      expect(isIdempotencyKey(key)).toBe(false);
    },
  );
});
