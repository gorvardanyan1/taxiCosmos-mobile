import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as fixtures from '../index.ts';
import { formatMoney } from '../../money/index.ts';
import { isE164 } from '../../phone/index.ts';

const dir = join(__dirname, '..', '..', '..', 'fixtures');
const recorded = readdirSync(dir).filter((file) => file.endsWith('.json'));

/**
 * The compiler already checks every fixture against the types (`satisfies` in fixtures/index.ts, run by `pnpm typecheck`). These tests
 * guard the other direction: the typed file really is the recorded JSON, and the recordings hold what the app relies on.
 */
describe('recorded backend responses', () => {
  it('has a typed export for every recorded response and no stale ones', () => {
    expect(Object.keys(fixtures)).toHaveLength(recorded.length);
    expect(recorded.length).toBeGreaterThanOrEqual(35);
  });

  it.each(recorded)('%s is exactly what the typed export says', (file) => {
    const name = file.replace(/\.json$/, '').replace(/[.-]([a-z])/g, (_, c: string) => c.toUpperCase());
    const json = JSON.parse(readFileSync(join(dir, file), 'utf8'));

    expect(JSON.parse(JSON.stringify((fixtures as Record<string, unknown>)[name]))).toEqual(json);
  });

  it('holds no real credential: sign-in tokens are placeholders', () => {
    for (const session of [fixtures.authSessionRider, fixtures.authSessionDriver, fixtures.authRefreshed]) {
      expect(session.body.access_token).toBe('1|fixture-access-token');
      expect(session.body.refresh_token).toBe('fixture-refresh-token');
    }
  });

  it('never carries a full phone number: the server masks it', () => {
    for (const me of [fixtures.meRider, fixtures.meDriver]) {
      expect(me.body.user.phone).toMatch(/^\+374\*{5}\d{3}$/);
    }
    expect(isE164(fixtures.meRider.body.user.phone as string)).toBe(false);
  });

  it('records money as integer minor units with a currency, so it renders without floats', () => {
    const estimate = fixtures.fareEstimate.body.estimates[0];

    expect(estimate).toBeDefined();
    expect(Number.isSafeInteger(estimate?.amount)).toBe(true);
    expect(formatMoney({ amount: estimate?.amount ?? 0, currency: estimate?.currency ?? 'AMD' }, 'en')).toContain(
      '1,192',
    );
    expect(fixtures.meRider.body.user.rider?.outstanding_balance).toEqual({ amount: 0, currency: 'AMD' });
    expect(typeof estimate?.surge_multiplier).toBe('string');
  });

  it('records the throttling answer the client turns into a retry delay', () => {
    expect(fixtures.errorRateLimited.status).toBe(429);
    expect(fixtures.errorRateLimited.headers).toMatchObject({ 'retry-after': expect.stringMatching(/^\d+$/) });
  });

  it('records validation errors as field-name keyed message lists, with dotted names for nested fields', () => {
    expect(fixtures.errorValidation.status).toBe(422);
    expect(fixtures.errorValidation.body.errors).toMatchObject({
      dropoff: expect.any(Array),
      'dropoff.lat': expect.any(Array),
    });
  });

  it('records the driver gate codes the apps switch on', () => {
    expect(fixtures.errorDriverNotVerified.body.code).toBe('driver_not_verified');
  });
});
