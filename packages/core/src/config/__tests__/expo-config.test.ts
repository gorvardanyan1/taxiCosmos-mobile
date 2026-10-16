import { ConfigError } from '../environment.ts';
import { buildExpoConfig, readPublicConfig } from '../expo-config.ts';

const PRODUCTION = {
  APP_ENV: 'production',
  API_URL: 'https://api.taxikosmos.am',
  SENTRY_DSN: 'https://key@o1.ingest.sentry.io/2',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_public',
  GOOGLE_MAPS_ANDROID_API_KEY: 'AIza-maps',
  EAS_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
  EXPO_OWNER: 'taxikosmos',
  SENTRY_ORG: 'taxikosmos',
  SENTRY_PROJECT: 'rider',
  // Build-only secrets that must never reach the app.
  SENTRY_AUTH_TOKEN: 'sntrys_SECRET_TOKEN',
  EXPO_TOKEN: 'expo_SECRET_TOKEN',
  DB_PASSWORD: 'SECRET_DB',
};

describe('buildExpoConfig', () => {
  it('builds the production rider with its store identity and the native ids', () => {
    const config = buildExpoConfig('rider', PRODUCTION);

    expect(config).toMatchObject({
      name: 'TaxiKosmos',
      slug: 'taxikosmos-rider',
      scheme: 'taxirider',
      owner: 'taxikosmos',
      ios: { bundleIdentifier: 'com.taxikosmos.rider', supportsTablet: false },
      android: { package: 'com.taxikosmos.rider', config: { googleMaps: { apiKey: 'AIza-maps' } } },
      extra: { eas: { projectId: PRODUCTION.EAS_PROJECT_ID } },
    });
  });

  it('declares the export-compliance answer so iOS builds can go to TestFlight and the store without a prompt', () => {
    // The apps only use the system's HTTPS; without this flag every upload stops at the encryption question.
    for (const app of ['rider', 'driver'] as const) {
      expect(buildExpoConfig(app, PRODUCTION).ios?.config?.usesNonExemptEncryption).toBe(false);
    }
  });

  it('follows the phone light/dark setting, which the design system relies on', () => {
    for (const app of ['rider', 'driver'] as const) {
      expect(buildExpoConfig(app, PRODUCTION).userInterfaceStyle).toBe('automatic');
    }
  });

  it('builds the driver with its own identity from the same rules', () => {
    const config = buildExpoConfig('driver', { APP_ENV: 'development' });

    expect(config).toMatchObject({
      name: 'TaxiKosmos Driver (Dev)',
      scheme: 'taxidriver-dev',
      ios: { bundleIdentifier: 'com.taxikosmos.driver.dev' },
      android: { package: 'com.taxikosmos.driver.dev' },
    });
  });

  it('exposes only the public values to the running app', () => {
    expect(buildExpoConfig('rider', PRODUCTION).extra?.app).toEqual({
      app: 'rider',
      environment: 'production',
      apiUrl: 'https://api.taxikosmos.am',
      sentryDsn: PRODUCTION.SENTRY_DSN,
      stripePublishableKey: 'pk_live_public',
    });
  });

  it('leaves unset optional values out of the manifest instead of writing nulls', () => {
    expect(buildExpoConfig('rider', {}).extra?.app).toEqual({
      app: 'rider',
      environment: 'development',
      apiUrl: 'http://localhost:8000',
    });
  });

  it('never copies a build secret into the app config', () => {
    const serialised = JSON.stringify(buildExpoConfig('rider', PRODUCTION));

    expect(serialised).not.toContain('SECRET');
  });

  it('adds the Sentry upload plugin only when the build names its Sentry org and project', () => {
    const pluginNames = (env: Record<string, string | undefined>) =>
      (buildExpoConfig('rider', env).plugins ?? []).map((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin));

    expect(pluginNames(PRODUCTION)).toContain('@sentry/react-native/expo');
    expect(pluginNames({ ...PRODUCTION, SENTRY_PROJECT: undefined })).not.toContain('@sentry/react-native/expo');
    expect(pluginNames({})).toEqual(['expo-router', 'expo-splash-screen']);
  });

  it('leaves out the maps key, EAS project id and owner when they are not set', () => {
    const config = buildExpoConfig('rider', {});

    expect(config.android).not.toHaveProperty('config');
    expect(config.extra).not.toHaveProperty('eas');
    expect(config).not.toHaveProperty('owner');
  });

  it('stops the build when the environment is invalid', () => {
    expect(() => buildExpoConfig('driver', { APP_ENV: 'production' })).toThrow(ConfigError);
  });
});

describe('readPublicConfig', () => {
  it('reads back what buildExpoConfig wrote', () => {
    const extra = buildExpoConfig('driver', { APP_ENV: 'staging', API_URL: 'https://staging.taxikosmos.am' }).extra;

    expect(readPublicConfig(extra)).toEqual({
      app: 'driver',
      environment: 'staging',
      apiUrl: 'https://staging.taxikosmos.am',
      sentryDsn: null,
      stripePublishableKey: null,
    });
  });

  it('reads a missing or non-string optional value as null, never as an object Sentry would choke on', () => {
    const config = readPublicConfig({
      app: {
        app: 'rider',
        environment: 'development',
        apiUrl: 'http://localhost:8000',
        sentryDsn: {},
        stripePublishableKey: '',
      },
    });

    expect(config.sentryDsn).toBeNull();
    expect(config.stripePublishableKey).toBeNull();
  });

  it.each([
    ['no extra', undefined],
    ['no app block', { eas: {} }],
    ['an unknown app', { app: { app: 'admin', environment: 'production', apiUrl: 'https://x.am' } }],
    ['an unknown environment', { app: { app: 'rider', environment: 'qa', apiUrl: 'https://x.am' } }],
    ['an empty API URL', { app: { app: 'rider', environment: 'production', apiUrl: '' } }],
  ])('fails loudly for a build with %s', (_, extra) => {
    expect(() => readPublicConfig(extra)).toThrow(ConfigError);
  });
});
