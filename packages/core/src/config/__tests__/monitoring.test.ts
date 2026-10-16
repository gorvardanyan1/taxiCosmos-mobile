import type { PublicAppConfig } from '../expo-config.ts';
import { monitoringOptions } from '../monitoring.ts';

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
    });
  });

  it('tags staging reports with their environment', () => {
    expect(
      monitoringOptions(config({ environment: 'staging', sentryDsn: 'https://k@o1.ingest.sentry.io/2' })).environment,
    ).toBe('staging');
  });
});
