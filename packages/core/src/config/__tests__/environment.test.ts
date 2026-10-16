import { ConfigError, LOCAL_API_URL, resolveEnvironment } from '../environment.ts';

const PRODUCTION = {
  APP_ENV: 'production',
  API_URL: 'https://api.taxikosmos.am',
  SENTRY_DSN: 'https://key@o1.ingest.sentry.io/2',
};

describe('resolveEnvironment', () => {
  it('defaults to development against the local Laravel server with no optional keys', () => {
    expect(resolveEnvironment({})).toEqual({
      environment: 'development',
      apiUrl: LOCAL_API_URL,
      realtimeUrl: null,
      sentryDsn: null,
      stripePublishableKey: null,
      googleMapsAndroidApiKey: null,
    });
  });

  it('treats blank and whitespace-only values as not set', () => {
    expect(resolveEnvironment({ APP_ENV: '  ', API_URL: ' ', SENTRY_DSN: '', STRIPE_PUBLISHABLE_KEY: '\t' })).toEqual(
      resolveEnvironment({}),
    );
  });

  it('refuses an unknown environment name', () => {
    expect(() => resolveEnvironment({ APP_ENV: 'prod' })).toThrow(
      new ConfigError('APP_ENV must be one of development, staging, production; got "prod".'),
    );
  });

  it.each(['staging', 'production'])('requires API_URL for a %s build', (environment) => {
    expect(() => resolveEnvironment({ ...PRODUCTION, APP_ENV: environment, API_URL: undefined })).toThrow(
      `API_URL is required for a ${environment} build.`,
    );
  });

  it.each(['staging', 'production'])('refuses a plain-http API for a %s build', (environment) => {
    expect(() =>
      resolveEnvironment({ ...PRODUCTION, APP_ENV: environment, API_URL: 'http://api.taxikosmos.am' }),
    ).toThrow(`API_URL must use https for a ${environment} build.`);
  });

  it('allows a plain-http API in development, for an emulator or a phone on the local network', () => {
    expect(resolveEnvironment({ API_URL: 'http://10.0.2.2:8000' }).apiUrl).toBe('http://10.0.2.2:8000');
  });

  it('normalises the API origin without a trailing slash and keeps a path prefix', () => {
    expect(resolveEnvironment({ ...PRODUCTION, API_URL: 'https://api.taxikosmos.am/' }).apiUrl).toBe(
      'https://api.taxikosmos.am',
    );
    expect(resolveEnvironment({ ...PRODUCTION, API_URL: 'https://taxikosmos.am/backend//' }).apiUrl).toBe(
      'https://taxikosmos.am/backend',
    );
  });

  it.each([
    ['credentials', 'https://user:pass@api.taxikosmos.am'],
    ['a query', 'https://api.taxikosmos.am?debug=1'],
    ['a fragment', 'https://api.taxikosmos.am#x'],
  ])('refuses an API URL with %s', (_, url) => {
    expect(() => resolveEnvironment({ ...PRODUCTION, API_URL: url })).toThrow(ConfigError);
  });

  it.each(['not a url', 'ftp://api.taxikosmos.am', 'javascript:alert(1)'])('refuses the API URL %p', (url) => {
    expect(() => resolveEnvironment({ API_URL: url })).toThrow(ConfigError);
  });

  it('requires a Sentry DSN for production only', () => {
    expect(() => resolveEnvironment({ ...PRODUCTION, SENTRY_DSN: undefined })).toThrow(
      'SENTRY_DSN is required for a production build.',
    );
    expect(resolveEnvironment({ ...PRODUCTION, APP_ENV: 'staging', SENTRY_DSN: undefined }).sentryDsn).toBeNull();
    expect(resolveEnvironment(PRODUCTION).sentryDsn).toBe(PRODUCTION.SENTRY_DSN);
  });

  it('refuses a Sentry DSN that is not https', () => {
    expect(() => resolveEnvironment({ SENTRY_DSN: 'http://key@sentry.local/1' })).toThrow(
      'SENTRY_DSN must be an https URL.',
    );
  });

  it.each(['sk_live_abc', 'sk_test_abc', 'rk_live_abc', 'whsec_abc'])(
    'never accepts the non-publishable Stripe key %s',
    (key) => {
      expect(() => resolveEnvironment({ STRIPE_PUBLISHABLE_KEY: key })).toThrow(
        'STRIPE_PUBLISHABLE_KEY must be a publishable key',
      );
    },
  );

  it('pairs live Stripe keys with production and test keys with everything else', () => {
    expect(() => resolveEnvironment({ ...PRODUCTION, STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' })).toThrow(
      'needs a live Stripe publishable key',
    );
    expect(() =>
      resolveEnvironment({ ...PRODUCTION, APP_ENV: 'staging', STRIPE_PUBLISHABLE_KEY: 'pk_live_abc' }),
    ).toThrow('A staging build must not use a live Stripe key.');
    expect(resolveEnvironment({ ...PRODUCTION, STRIPE_PUBLISHABLE_KEY: 'pk_live_abc' }).stripePublishableKey).toBe(
      'pk_live_abc',
    );
    expect(resolveEnvironment({ STRIPE_PUBLISHABLE_KEY: 'pk_test_abc' }).stripePublishableKey).toBe('pk_test_abc');
  });

  describe('REALTIME_URL (the Socket.io service; unset means the apps poll over REST)', () => {
    it('is optional in every environment', () => {
      expect(resolveEnvironment({ ...PRODUCTION }).realtimeUrl).toBeNull();
      expect(resolveEnvironment({}).realtimeUrl).toBeNull();
    });

    it('accepts a secure address in production and normalises it without a trailing slash', () => {
      expect(resolveEnvironment({ ...PRODUCTION, REALTIME_URL: 'wss://realtime.taxikosmos.am/' }).realtimeUrl).toBe(
        'wss://realtime.taxikosmos.am',
      );
      expect(resolveEnvironment({ ...PRODUCTION, REALTIME_URL: 'https://realtime.taxikosmos.am' }).realtimeUrl).toBe(
        'https://realtime.taxikosmos.am',
      );
    });

    it.each(['staging', 'production'])('refuses an insecure address for a %s build', (environment) => {
      for (const url of ['ws://realtime.taxikosmos.am', 'http://realtime.taxikosmos.am']) {
        expect(() => resolveEnvironment({ ...PRODUCTION, APP_ENV: environment, REALTIME_URL: url })).toThrow(
          `REALTIME_URL must use https or wss for a ${environment} build.`,
        );
      }
    });

    it('allows a plain address in development, for a service on the local network', () => {
      expect(resolveEnvironment({ REALTIME_URL: 'ws://10.0.2.2:3000' }).realtimeUrl).toBe('ws://10.0.2.2:3000');
    });

    it.each([
      'not a url',
      'ftp://realtime.example.com',
      'wss://user:pass@realtime.example.com',
      'wss://realtime.example.com?token=1',
      'wss://realtime.example.com#x',
    ])('refuses the unusable address %p', (url) => {
      expect(() => resolveEnvironment({ REALTIME_URL: url })).toThrow(ConfigError);
    });

    it('names the supported schemes when refusing one', () => {
      expect(() => resolveEnvironment({ REALTIME_URL: 'ftp://realtime.example.com' })).toThrow(
        'REALTIME_URL must be an http(s) or ws(s) URL.',
      );
      expect(() => resolveEnvironment({ API_URL: 'ftp://api.example.com' })).toThrow('API_URL must be an http(s) URL.');
    });
  });

  it('passes the Android maps key through when set', () => {
    expect(resolveEnvironment({ GOOGLE_MAPS_ANDROID_API_KEY: 'AIza-test' }).googleMapsAndroidApiKey).toBe('AIza-test');
  });
});
