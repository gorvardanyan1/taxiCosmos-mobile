import * as Sentry from '@sentry/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-constants', () => {
  const { buildExpoConfig: build } = jest.requireActual('@taxikosmos/core/config');

  return {
    __esModule: true,
    default: { expoConfig: build('driver', { APP_ENV: 'development', API_URL: 'http://10.0.2.2:8000' }) },
  };
});

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

describe('driver app boot', () => {
  it("boots through the root layout to the placeholder home with this build's identity and environment", async () => {
    // The real route tree in src/app, so a broken layout or a missing home route fails here.
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'TaxiKosmos Driver (Dev)' })).toBeOnTheScreen();
    expect(screen.getByText('Environment: development')).toBeOnTheScreen();
    expect(screen.getByText('API: http://10.0.2.2:8000')).toBeOnTheScreen();
  });

  it('starts Sentry with the shared policy: off without a DSN and never sending personal data', () => {
    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: undefined,
      enabled: false,
      environment: 'development',
      sendDefaultPii: false,
      tracesSampleRate: 1,
    });
  });
});
