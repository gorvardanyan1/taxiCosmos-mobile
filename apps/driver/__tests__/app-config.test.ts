/** @jest-environment node */
import buildConfig from '../app.config';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe('driver app.config.ts', () => {
  it('builds the driver identity for a production build from the EAS environment variables', () => {
    process.env = {
      ...saved,
      APP_ENV: 'production',
      API_URL: 'https://api.taxikosmos.am',
      SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2',
    };

    expect(buildConfig()).toMatchObject({
      name: 'TaxiKosmos Driver',
      scheme: 'taxidriver',
      ios: { bundleIdentifier: 'com.taxikosmos.driver' },
      android: { package: 'com.taxikosmos.driver' },
      extra: { app: { app: 'driver', environment: 'production', apiUrl: 'https://api.taxikosmos.am' } },
    });
  });

  it('never builds as the rider app', () => {
    process.env = { ...saved, APP_ENV: 'development' };

    expect(JSON.stringify(buildConfig())).not.toContain('com.taxikosmos.rider');
  });

  it('refuses a production build without an API URL', () => {
    process.env = { ...saved, APP_ENV: 'production', API_URL: '', SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2' };

    expect(() => buildConfig()).toThrow('API_URL is required for a production build.');
  });
});
