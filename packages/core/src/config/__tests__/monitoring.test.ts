import type { PublicAppConfig } from '../expo-config.ts';
import { monitoringOptions, scrubEvent, scrubText } from '../monitoring.ts';

const config = (overrides: Partial<PublicAppConfig>): PublicAppConfig => ({
  app: 'rider',
  environment: 'development',
  apiUrl: 'http://localhost:8000',
  realtimeUrl: null,
  sentryDsn: null,
  stripePublishableKey: null,
  ...overrides,
});

describe('monitoringOptions', () => {
  it('keeps Sentry off when the build has no DSN', () => {
    expect(monitoringOptions(config({}))).toEqual({
      dsn: undefined,
      enabled: false,
      environment: 'development',
      sendDefaultPii: false,
      tracesSampleRate: 1,
      beforeSend: scrubEvent,
    });
  });

  it('reports production crashes with a sampled trace rate and never sends personal data by default', () => {
    expect(
      monitoringOptions(config({ environment: 'production', sentryDsn: 'https://k@o1.ingest.sentry.io/2' })),
    ).toEqual({
      dsn: 'https://k@o1.ingest.sentry.io/2',
      enabled: true,
      environment: 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
      beforeSend: scrubEvent,
    });
  });

  it('tags staging reports with their environment', () => {
    expect(
      monitoringOptions(config({ environment: 'staging', sentryDsn: 'https://k@o1.ingest.sentry.io/2' })).environment,
    ).toBe('staging');
  });
});

describe('scrubText', () => {
  it.each([
    ['a phone number with a plus', 'could not text +37491770058 today', 'could not text [redacted] today'],
    ['a phone number written with spaces', 'call 091 234 567 now', 'call [redacted] now'],
    ['a bearer token', 'sent Bearer 12|abcDEF-123_xyz.token to /me', 'sent [redacted] to /me'],
    ['coordinates', 'pickup at 40.18123, 44.51456 failed', 'pickup at [redacted] failed'],
    ['negative coordinates', 'at -33.86882,151.20929', 'at [redacted]'],
  ])('blanks out %s', (_, text, expected) => {
    expect(scrubText(text)).toBe(expected);
  });

  it('leaves ordinary text alone', () => {
    expect(scrubText('TypeError: undefined is not a function (line 42, column 7)')).toBe(
      'TypeError: undefined is not a function (line 42, column 7)',
    );
  });
});

describe('scrubEvent', () => {
  const event = () => ({
    event_id: 'abc',
    release: 'taxikosmos@0.1.0',
    message: 'failed for +37491770058',
    user: { id: '12', email: 'a@b.test', ip_address: '1.2.3.4' },
    request: { url: 'https://api/x?phone=%2B374', headers: { authorization: 'Bearer secret' }, data: { name: 'Anna' } },
    extra: { pickup: { lat: 40.18123, lng: 44.51456 } },
    server_name: 'anna-iphone',
    exception: {
      values: [{ type: 'Error', value: 'bad number +37491770058', stacktrace: { frames: [{ lineno: 3 }] } }],
    },
    breadcrumbs: [
      { category: 'xhr', message: 'GET /me Bearer 1|tok', data: { url: 'https://api/me', phone: '+374' } },
      { category: 'ui.click' },
    ],
    contexts: { device: { model: 'Pixel 8' } },
  });

  it('removes who the person is: user, request, extra data and the device name', () => {
    const scrubbed = scrubEvent(event()) as Record<string, unknown>;

    expect(scrubbed).not.toHaveProperty('user');
    expect(scrubbed).not.toHaveProperty('request');
    expect(scrubbed).not.toHaveProperty('extra');
    expect(scrubbed).not.toHaveProperty('server_name');
  });

  it('blanks out phone numbers and tokens in the message, the exception text and the breadcrumbs, and drops breadcrumb data', () => {
    const scrubbed = scrubEvent(event());

    expect(scrubbed.message).toBe('failed for [redacted]');
    expect(scrubbed.exception.values[0]?.value).toBe('bad number [redacted]');
    expect(scrubbed.breadcrumbs[0]).toEqual({ category: 'xhr', message: 'GET /me [redacted]', data: undefined });
    expect(scrubbed.breadcrumbs[1]).toEqual({ category: 'ui.click', data: undefined });
  });

  it('keeps what is needed to fix the crash: type, stack, release, device model', () => {
    const scrubbed = scrubEvent(event());

    expect(scrubbed.event_id).toBe('abc');
    expect(scrubbed.release).toBe('taxikosmos@0.1.0');
    expect(scrubbed.exception.values[0]?.type).toBe('Error');
    expect(scrubbed.exception.values[0]?.stacktrace).toEqual({ frames: [{ lineno: 3 }] });
    expect(scrubbed.contexts.device.model).toBe('Pixel 8');
  });

  it('does not change the event it was given', () => {
    const original = event();
    scrubEvent(original);

    expect(original).toEqual(event());
  });

  it('copes with an event that has none of those parts', () => {
    expect(scrubEvent({ event_id: 'x' })).toEqual({ event_id: 'x' });
  });
});
