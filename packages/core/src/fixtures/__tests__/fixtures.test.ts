import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GeoPlace, Me } from '../../api/index.ts';
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
    expect(recorded.length).toBeGreaterThanOrEqual(37);
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

  it('holds no clock reading that would change how the app behaves as time passes', () => {
    // A recorded token expiry in the past makes the client renew the session before every call: a test built on it passes today and fails
    // tomorrow. The capture script replaces it with a constant far in the future; this keeps it that way.
    const expiries: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') {
        for (const [key, inner] of Object.entries(value)) {
          if (key === 'access_token_expires_at') expiries.push(String(inner));
          else walk(inner);
        }
      }
    };

    for (const file of recorded) {
      walk(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    }

    expect(expiries.length).toBeGreaterThanOrEqual(4);
    expect(new Set(expiries)).toEqual(new Set(['2099-01-01T00:00:00+00:00']));
  });

  it('records a person who signed in without a language: the API sends "locale": null', () => {
    const me: Me = fixtures.meRiderNoLocale.body.user;

    expect(me.locale).toBeNull();
    expect(fixtures.authSessionRiderNoLocale.body.user.locale).toBeNull();
    expect(fixtures.meRider.body.user.locale).toBe('en');
  });

  it('allows a place with no provider id: a reverse lookup of a bare coordinate has none', () => {
    // The fake maps provider always answers with an id, so this shape cannot be recorded; the type is checked against the backend's DTO (`?string`).
    const place: GeoPlace = {
      place_id: null,
      name: null,
      address: '40.18, 44.51',
      location: { lat: 40.18, lng: 44.51 },
    };

    expect(place.place_id).toBeNull();
    expect(fixtures.geoReverse.body.place.place_id).toEqual(expect.any(String));
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
