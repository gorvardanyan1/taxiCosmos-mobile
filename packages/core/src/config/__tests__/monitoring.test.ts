import type { PublicAppConfig } from '../expo-config.ts';
import { monitoringOptions, scrubEvent, scrubText, scrubTransaction } from '../monitoring.ts';

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
      beforeSendTransaction: scrubTransaction,
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
      beforeSendTransaction: scrubTransaction,
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

describe('scrubTransaction', () => {
  const transaction = () => ({
    type: 'transaction',
    event_id: 'tx1',
    release: 'taxikosmos@0.1.0',
    transaction: '/trips/12?from=40.18123,44.51456',
    user: { id: '12' },
    request: { url: 'https://api.test/api/v1/geo/reverse?lat=40.18123&lng=44.51456' },
    contexts: {
      device: { model: 'Pixel 8' },
      trace: {
        trace_id: 'abc',
        op: 'navigation',
        data: {
          url: '/geo/reverse?lat=40.18&lng=44.51',
          'http.query': '?lat=40.18&lng=44.51',
          'sentry.origin': 'auto.navigation',
        },
      },
    },
    spans: [
      {
        op: 'http.client',
        description: 'GET https://api.test/api/v1/geo/reverse?lat=40.18123&lng=44.51456',
        start_timestamp: 1,
        timestamp: 2,
        data: {
          url: 'https://api.test/api/v1/geo/autocomplete?q=Abovyan%2012&lat=40.18&lng=44.51',
          'http.url': 'https://api.test/api/v1/geo/autocomplete?q=Abovyan%2012',
          'http.query': '?q=Abovyan%2012&lat=40.18&lng=44.51',
          'url.query': 'q=Abovyan%2012',
          'http.method': 'GET',
          'http.response.status_code': 200,
          note: 'sent to +37491770058',
        },
      },
      { op: 'ui.load', description: 'Home' },
    ],
  });

  it('removes every query string: the coordinates and typed addresses of a request never reach Sentry', () => {
    const scrubbed = scrubTransaction(transaction());
    const text = JSON.stringify(scrubbed);

    expect(text).not.toContain('40.18');
    expect(text).not.toContain('44.51');
    expect(text).not.toContain('Abovyan');
    expect(text).not.toContain('lat=');
    expect(text).not.toContain('37491770058');
  });

  it('blanks out a phone number, a token or coordinates that sit in the text of a description or a name, not only in a query', () => {
    const scrubbed = scrubTransaction({
      transaction: '/pickup/40.18123,44.51456',
      contexts: { trace: { op: 'navigation', description: 'open /riders/+37491770058' } },
      spans: [{ op: 'http.client', description: 'GET /confirm/Bearer 12|abcDEF.token-value' }],
    });
    const text = JSON.stringify(scrubbed);

    expect(scrubbed.transaction).toBe('/pickup/[redacted]');
    expect(scrubbed.contexts.trace.description).toBe('open /riders/[redacted]');
    expect(scrubbed.spans[0]?.description).toBe('GET /confirm/[redacted]');
    expect(text).not.toContain('37491770058');
    expect(text).not.toContain('abcDEF');
    expect(text).not.toContain('40.18123');
  });

  it('keeps the address without its query, so a slow endpoint can still be found', () => {
    const scrubbed = scrubTransaction(transaction());
    const [request, screen] = scrubbed.spans;

    expect(request?.description).toBe('GET https://api.test/api/v1/geo/reverse');
    expect(request?.data).toEqual({
      url: 'https://api.test/api/v1/geo/autocomplete',
      'http.url': 'https://api.test/api/v1/geo/autocomplete',
      'http.method': 'GET',
      'http.response.status_code': 200,
      note: 'sent to [redacted]',
    });
    expect(screen).toEqual({ op: 'ui.load', description: 'Home' });
    expect(scrubbed.transaction).toBe('/trips/12');
    expect(scrubbed.contexts.trace?.data).toEqual({ url: '/geo/reverse', 'sentry.origin': 'auto.navigation' });
  });

  it('keeps what is needed to read the trace, and removes the person like an error report does', () => {
    const scrubbed = scrubTransaction(transaction());

    expect(scrubbed).not.toHaveProperty('user');
    expect(scrubbed).not.toHaveProperty('request');
    expect(scrubbed.event_id).toBe('tx1');
    expect(scrubbed.release).toBe('taxikosmos@0.1.0');
    expect(scrubbed.contexts.device.model).toBe('Pixel 8');
    expect(scrubbed.contexts.trace?.op).toBe('navigation');
    expect(scrubbed.spans[0]).toMatchObject({ op: 'http.client', start_timestamp: 1, timestamp: 2 });
  });

  it('does not change the transaction it was given', () => {
    const original = transaction();
    scrubTransaction(original);

    expect(original).toEqual(transaction());
  });

  it('copes with a transaction that has no spans, no trace and no name', () => {
    expect(scrubTransaction({ type: 'transaction' })).toEqual({ type: 'transaction' });
    expect(
      scrubTransaction({
        spans: [
          { op: 'x', data: 'not an object' },
          { op: 'y', data: [1] },
        ],
      }),
    ).toEqual({
      spans: [
        { op: 'x', data: 'not an object' },
        { op: 'y', data: [1] },
      ],
    });
  });
});
