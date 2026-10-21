import * as Sentry from '@sentry/react-native';
import { scrubEvent, scrubTransaction } from '@taxikosmos/core/config';
import * as SplashScreen from 'expo-splash-screen';
import { renderRouter, screen } from 'expo-router/testing-library';

import { installBackend, signIn, signOut } from '../test-support/backend';

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();

  return {
    AFTER_FIRST_UNLOCK: 1,
    getItemAsync: async (key: string) => items.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void items.set(key, value),
    deleteItemAsync: async (key: string) => void items.delete(key),
  };
});

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
  captureException: jest.fn(),
  wrap: (component: unknown) => component,
}));

beforeEach(() => {
  installBackend();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await signOut();
});

describe('rider app boot', () => {
  it("boots through the root layout to the placeholder home with this build's identity and environment", async () => {
    await signIn();
    // The real route tree in src/app, so a broken layout or a missing home route fails here.
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'TaxiKosmos (Dev)' })).toBeOnTheScreen();
    expect(screen.getByText('Environment: development')).toBeOnTheScreen();
    expect(screen.getByText('API: http://10.0.2.2:8000')).toBeOnTheScreen();
  });

  it('boots a fresh install to the sign-in screen, not to the home screen', async () => {
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'TaxiKosmos (Dev)' })).not.toBeOnTheScreen();
  });

  it('keeps the splash screen up from startup and hides it once, when fonts, theme and language are ready', async () => {
    jest.mocked(SplashScreen.hideAsync).mockClear();
    renderRouter('./src/app', { initialUrl: '/' });

    // Held at startup (module load) so the first frame is already in the right theme and font.
    expect(SplashScreen.preventAutoHideAsync).toHaveBeenCalled();
    await screen.findByRole('header');
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('starts Sentry with the shared policy: off without a DSN, no personal data by default, every error and every trace scrubbed', () => {
    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: undefined,
      enabled: false,
      environment: 'development',
      sendDefaultPii: false,
      tracesSampleRate: 1,
      beforeSend: scrubEvent,
      beforeSendTransaction: scrubTransaction,
    });
  });

  it('removes the person from a report before it is sent: no user, no request data, no phone number in the text', () => {
    const options = jest.mocked(Sentry.init).mock.calls[0]?.[0] as unknown as {
      beforeSend: (event: object) => Record<string, unknown>;
    };
    const sent = options.beforeSend({
      message: 'sign-in failed for +37491770058',
      user: { id: '1', phone: '+37491770058' },
      request: { url: 'https://api/x', data: { phone: '+37491770058' } },
      exception: { values: [{ type: 'Error', value: 'bad Bearer 1|secret-token' }] },
    });

    expect(sent).not.toHaveProperty('user');
    expect(sent).not.toHaveProperty('request');
    expect(JSON.stringify(sent)).not.toContain('37491770058');
    expect(JSON.stringify(sent)).not.toContain('secret-token');
  });

  it('removes the coordinates and typed addresses of a request from a performance trace before it is sent', () => {
    const options = jest.mocked(Sentry.init).mock.calls[0]?.[0] as unknown as {
      beforeSendTransaction: (event: object) => Record<string, unknown>;
    };
    const sent = options.beforeSendTransaction({
      type: 'transaction',
      spans: [
        {
          op: 'http.client',
          description: 'GET https://api.test/api/v1/geo/reverse?lat=40.18123&lng=44.51456',
          data: { 'http.query': '?lat=40.18123&lng=44.51456', 'http.method': 'GET' },
        },
      ],
    });

    expect(JSON.stringify(sent)).not.toContain('40.18123');
    expect(JSON.stringify(sent)).not.toContain('lat=');
    expect(JSON.stringify(sent)).toContain('https://api.test/api/v1/geo/reverse');
  });
});
