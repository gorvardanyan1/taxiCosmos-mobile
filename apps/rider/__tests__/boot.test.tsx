import * as Sentry from '@sentry/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-constants', () => {
  const { buildExpoConfig: build } = jest.requireActual('@taxikosmos/core/config');

  return {
    __esModule: true,
    default: { expoConfig: build('rider', { APP_ENV: 'development', API_URL: 'http://10.0.2.2:8000' }) },
  };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

describe('rider app boot', () => {
  it("boots through the root layout to the placeholder home with this build's identity and environment", async () => {
    // The real route tree in src/app, so a broken layout or a missing home route fails here.
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'TaxiKosmos (Dev)' })).toBeOnTheScreen();
    expect(screen.getByText('Environment: development')).toBeOnTheScreen();
    expect(screen.getByText('API: http://10.0.2.2:8000')).toBeOnTheScreen();
  });

  it('keeps the splash screen up from startup and hides it once, when fonts, theme and language are ready', async () => {
    jest.mocked(SplashScreen.hideAsync).mockClear();
    renderRouter('./src/app', { initialUrl: '/' });

    // Held at startup (module load) so the first frame is already in the right theme and font.
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalled();
    await screen.findByRole('header');
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
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
