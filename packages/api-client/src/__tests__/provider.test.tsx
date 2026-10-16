import * as fixtures from '@taxikosmos/core/fixtures';
import { act, renderHook } from '@testing-library/react-native';
import {
  queryKeys,
  useApi,
  useApiClient,
  usePollingInterval,
  useRealtime,
  useRealtimeStatus,
  useMe,
  useSessionStatus,
  createRealtimeClient,
} from '..';
import { replyWith } from './helpers';
import { captureAppState, fakeRealtime, renderWithApi, testQueryClient, waitFor } from './react-helpers';

afterEach(() => jest.restoreAllMocks());

describe('using the hooks', () => {
  it('refuses to work outside <ApiProvider> with a message that says what to do', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useApi())).toThrow('Wrap the app in <ApiProvider>');
    spy.mockRestore();
  });

  it('gives screens the client, the typed endpoints and the realtime connection', async () => {
    const { realtime } = fakeRealtime();
    const { result, client } = await renderWithApi(
      () => ({ client: useApiClient(), api: useApi(), realtime: useRealtime() }),
      [],
      { realtime },
    );

    expect(result.current.client).toBe(client);
    expect(typeof result.current.api.me.get).toBe('function');
    expect(result.current.realtime).toBe(realtime);
  });

  it('has no realtime connection unless the app gave one', async () => {
    const { result } = await renderWithApi(
      () => ({ realtime: useRealtime(), status: useRealtimeStatus(), interval: usePollingInterval(4_000) }),
      [],
    );

    expect(result.current).toEqual({ realtime: null, status: 'idle', interval: 4_000 });
  });
});

describe('signing out', () => {
  it("empties the whole cache so the next person never sees the previous one's data", async () => {
    const { result, queryClient, client } = await renderWithApi(
      () => ({ me: useMe(), status: useSessionStatus() }),
      [replyWith(fixtures.meRider)],
    );
    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));
    queryClient.setQueryData(['saved-places', 'list'], [{ id: 1 }]);

    await act(async () => {
      await client.session.clear();
    });

    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    expect(queryClient.getQueryData(queryKeys.me)).toBeUndefined();
    expect(queryClient.getQueryData(['saved-places', 'list'])).toBeUndefined();
    // A mounted screen re-creates its own (empty) entry; none of them may still hold data.
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .every((query) => query.state.data === undefined),
    ).toBe(true);
  });

  it('keeps the cache when the session is merely renewed', async () => {
    const { result, queryClient, client } = await renderWithApi(() => useMe(), [replyWith(fixtures.meRider)]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await act(async () => {
      await client.session.start(fixtures.authSessionRider.body);
    });

    expect(queryClient.getQueryData(queryKeys.me)).toBeDefined();
  });
});

describe('the realtime connection follows the session', () => {
  it('starts when a person is signed in and stops when they sign out', async () => {
    const { realtime, fake } = fakeRealtime();
    const { client } = await renderWithApi(() => useSessionStatus(), [], { realtime });

    await waitFor(() => expect(fake.start.calls).toHaveLength(1));
    expect(fake.stop.calls).toHaveLength(0);

    await act(async () => {
      await client.session.clear();
    });

    expect(fake.stop.calls).toHaveLength(1);
  });

  it('never starts for a signed-out app', async () => {
    const { realtime, fake } = fakeRealtime();
    const { result } = await renderWithApi(() => useSessionStatus(), [], { realtime, signedIn: null });
    await waitFor(() => expect(result.current).toBe('signed_out'));

    expect(fake.start.calls).toHaveLength(0);
  });

  it('stops when the app is closed', async () => {
    const { realtime, fake } = fakeRealtime();
    const { unmount } = await renderWithApi(() => useSessionStatus(), [], { realtime });
    await waitFor(() => expect(fake.start.calls).toHaveLength(1));
    unmount();

    expect(fake.stop.calls).toHaveLength(1);
  });

  it('refetches what is on screen over REST when the connection comes back', async () => {
    const { realtime, reconnect } = fakeRealtime();
    // Reads `data` while rendering, as a screen does (the cache only re-renders for what a render used).
    const { result, server, queryClient } = await renderWithApi(
      () => {
        const me = useMe();

        return { isSuccess: me.isSuccess, locale: me.data?.locale };
      },
      [replyWith(fixtures.meRider), replyWith(fixtures.meRiderUpdated)],
      { realtime },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.locale).toBe('en');

    await act(async () => {
      reconnect();
    });

    await waitFor(() => expect(result.current.locale).toBe('ru'));
    expect(server.requests).toHaveLength(2);
    expect(queryClient.getQueryData(queryKeys.me)).toEqual(fixtures.meRiderUpdated.body.user);
  });

  it('leaves a query nobody is looking at alone on reconnect', async () => {
    const { realtime, reconnect } = fakeRealtime();
    const { result, server, unmount } = await renderWithApi(() => useMe(), [replyWith(fixtures.meRider)], { realtime });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    unmount();
    reconnect();

    expect(server.requests).toHaveLength(1);
  });
});

describe('the app returns to the foreground', () => {
  it('tells the realtime connection, which asks the screens to reconcile', async () => {
    const appState = captureAppState();
    const { realtime, fake } = fakeRealtime();
    renderWithApi(() => useSessionStatus(), [], { realtime });

    act(() => appState.change('background'));
    expect(fake.foreground.calls).toHaveLength(0);
    act(() => appState.change('active'));

    expect(fake.foreground.calls).toHaveLength(1);
  });

  it('without a realtime connection, refetches what is on screen itself (polling mode)', async () => {
    const appState = captureAppState();
    const { result, server } = await renderWithApi(() => {
      const me = useMe();

      return { isSuccess: me.isSuccess, locale: me.data?.locale };
    }, [replyWith(fixtures.meRider), replyWith(fixtures.meRiderUpdated)]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    act(() => appState.change('active'));

    await waitFor(() => expect(result.current.locale).toBe('ru'));
    expect(server.requests).toHaveLength(2);
  });

  it('listens to the app state once and stops listening when the app is closed', async () => {
    const appState = captureAppState();
    const { unmount } = await renderWithApi(() => useSessionStatus(), []);

    expect(appState.added()).toBe(1);
    expect(appState.removed()).toBe(0);
    unmount();
    expect(appState.removed()).toBe(1);
  });
});

describe('realtime status for screens', () => {
  it('shows the connection status and polls over REST only while it is not connected', async () => {
    const { realtime, setStatus } = fakeRealtime();
    const { result } = await renderWithApi(
      () => ({ status: useRealtimeStatus(), interval: usePollingInterval(4_000) }),
      [],
      { realtime },
    );
    expect(result.current).toEqual({ status: 'idle', interval: 4_000 });

    act(() => setStatus('connected'));
    expect(result.current).toEqual({ status: 'connected', interval: false });

    act(() => setStatus('reconnecting'));
    expect(result.current).toEqual({ status: 'reconnecting', interval: 4_000 });
  });

  it('polls when the realtime service does not exist yet (no address configured)', async () => {
    const realtime = createRealtimeClient({ url: null, app: 'rider', getToken: async () => 'token' });
    const { result } = await renderWithApi(
      () => ({ status: useRealtimeStatus(), interval: usePollingInterval(5_000) }),
      [],
      { realtime },
    );

    await waitFor(() => expect(result.current.status).toBe('polling'));
    expect(result.current.interval).toBe(5_000);
  });
});

describe('using your own cache', () => {
  it('lets the app pass its own query client', async () => {
    const queryClient = testQueryClient();
    const { result } = await renderWithApi(() => useMe(), [replyWith(fixtures.meRider)], { queryClient });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(queryClient.getQueryData(queryKeys.me)).toEqual(fixtures.meRider.body.user);
  });
});
