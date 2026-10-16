import { renderRouter, waitFor } from 'expo-router/testing-library';

import { appApi } from '../src/api';

jest.mock('expo-constants', () => {
  const { buildExpoConfig } = jest.requireActual('@taxikosmos/core/config');

  return {
    __esModule: true,
    default: { expoConfig: buildExpoConfig('rider', { APP_ENV: 'development', API_URL: 'http://10.0.2.2:8000' }) },
  };
});

jest.mock('@sentry/react-native', () => ({ init: jest.fn(), wrap: (component: unknown) => component }));

// A phone that already holds a signed-in session for this app.
jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>([
    [
      'taxikosmos.session.rider',
      JSON.stringify({
        accessToken: 'access',
        accessTokenExpiresAt: '2099-01-01T00:00:00+00:00',
        refreshToken: 'refresh',
      }),
    ],
  ]);

  return {
    AFTER_FIRST_UNLOCK: 1,
    getItemAsync: async (key: string) => items.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void items.set(key, value),
    deleteItemAsync: async (key: string) => void items.delete(key),
  };
});

describe('rider app: live updates', () => {
  it('starts the realtime connection once a person is signed in (this build has no realtime address, so the screens poll over REST)', async () => {
    expect(appApi.realtime.status).toBe('idle');

    renderRouter('./src/app', { initialUrl: '/' });

    await waitFor(() => expect(appApi.realtime.status).toBe('polling'));
    expect(appApi.realtime.mode).toBe('polling');
  });
});
