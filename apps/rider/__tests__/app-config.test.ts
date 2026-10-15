/** @jest-environment node */
import buildConfig from '../app.config';

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe('rider app.config.ts', () => {
  it('builds the rider identity for a production build from the EAS environment variables', () => {
    process.env = {
      ...saved,
      APP_ENV: 'production',
      API_URL: 'https://api.taxikosmos.am',
      SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2',
    };

    expect(buildConfig()).toMatchObject({
      name: 'TaxiKosmos',
      scheme: 'taxirider',
      ios: { bundleIdentifier: 'com.taxikosmos.rider' },
      android: { package: 'com.taxikosmos.rider' },
      extra: { app: { app: 'rider', environment: 'production', apiUrl: 'https://api.taxikosmos.am' } },
    });
  });

  it('never builds as the driver app', () => {
    process.env = { ...saved, APP_ENV: 'development' };

    expect(JSON.stringify(buildConfig())).not.toContain('com.taxikosmos.driver');
  });

  it('refuses a production build without an API URL', () => {
    process.env = { ...saved, APP_ENV: 'production', API_URL: '', SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2' };

    expect(() => buildConfig()).toThrow('API_URL is required for a production build.');
  });
});
