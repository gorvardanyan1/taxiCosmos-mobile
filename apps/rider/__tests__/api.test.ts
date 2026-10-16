import { appApi } from '../src/api';

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
  const { buildExpoConfig } = jest.requireActual('@taxikosmos/core/config');

  return {
    __esModule: true,
    default: { expoConfig: buildExpoConfig('rider', { APP_ENV: 'development', API_URL: 'http://10.0.2.2:8000' }) },
  };
});

describe('rider app: connection to the backend', () => {
  it('talks to the backend this build was configured for, in the language of the app', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ user: { id: 1 } }), { status: 200 }));
    await appApi.client.get('/me', { auth: false });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('http://10.0.2.2:8000/api/v1/me');
    expect(new Headers(init.headers).get('accept-language')).toBe('en');
    fetchSpy.mockRestore();
  });

  it('polls over REST because this build has no realtime service address', () => {
    expect(appApi.realtime.mode).toBe('polling');
  });

  it("keeps the rider session apart from the driver app's: they can be installed side by side", async () => {
    const SecureStore = jest.requireMock('expo-secure-store') as {
      getItemAsync: (key: string) => Promise<string | null>;
    };
    await appApi.client.session.start({
      access_token: 'access',
      access_token_expires_at: '2099-01-01T00:00:00+00:00',
      refresh_token: 'refresh',
      needs_phone: false,
      user: {} as never,
    });

    expect(await SecureStore.getItemAsync('taxikosmos.session.rider')).toContain('access');
    expect(await SecureStore.getItemAsync('taxikosmos.session.driver')).toBeNull();
  });
});
