import { ApiRequestError, getApiError } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';
import { act } from '@testing-library/react-native';

import {
  useDebouncedValue,
  useDriverBankAccounts,
  useDriverDocuments,
  useDriverVehicles,
  useGeoAutocomplete,
  useGeoReverse,
  useGeoRoute,
  useMe,
  useSavedPlace,
  useSavedPlaces,
  useSessionStatus,
  useSupportTicket,
  useSupportTickets,
  shouldRetryQuery,
  retryDelay,
} from '..';
import { replyWith } from './helpers';
import { renderWithApi, waitFor } from './react-helpers';

describe('reads wait for a signed-in session', () => {
  it('sends nothing while signed out, and says so', async () => {
    const { result, server } = await renderWithApi(() => ({ me: useMe(), status: useSessionStatus() }), [], {
      signedIn: null,
    });
    await waitFor(() => expect(result.current.status).toBe('signed_out'));

    expect(server.requests).toHaveLength(0);
    expect(result.current.me.fetchStatus).toBe('idle');
  });

  it('starts once the saved session was read, and shows the signed-in person', async () => {
    const { result, server } = await renderWithApi(
      () => ({ me: useMe(), status: useSessionStatus() }),
      [replyWith(fixtures.meRider)],
      { settle: false },
    );
    expect(result.current.status).toBe('unknown');

    await waitFor(() => expect(result.current.me.isSuccess).toBe(true));

    expect(result.current.status).toBe('signed_in');
    expect(result.current.me.data).toEqual(fixtures.meRider.body.user);
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /me']);
  });

  it('respects `enabled: false` even when signed in', async () => {
    const { result, server } = await renderWithApi(() => useMe({ enabled: false }), []);
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));

    expect(server.requests).toHaveLength(0);
  });
});

describe('each read asks for the right resource and hands back the data', () => {
  const table: [string, () => unknown, ReturnType<typeof replyWith>, string, Record<string, string>, unknown][] = [
    [
      'useSavedPlaces',
      () => useSavedPlaces(),
      replyWith(fixtures.savedPlacesList),
      '/saved-places',
      {},
      fixtures.savedPlacesList.body.data,
    ],
    [
      'useSavedPlace',
      () => useSavedPlace(1),
      replyWith(fixtures.savedPlacesShow),
      '/saved-places/1',
      {},
      fixtures.savedPlacesShow.body.data,
    ],
    [
      'useSupportTickets',
      () => useSupportTickets(2),
      replyWith(fixtures.supportTicketList),
      '/support-tickets',
      { page: '2' },
      fixtures.supportTicketList.body,
    ],
    [
      'useSupportTicket',
      () => useSupportTicket(1),
      replyWith(fixtures.supportTicketShow),
      '/support-tickets/1',
      {},
      fixtures.supportTicketShow.body.data,
    ],
    [
      'useDriverVehicles',
      () => useDriverVehicles(),
      replyWith(fixtures.driverVehicles),
      '/driver/vehicles',
      {},
      fixtures.driverVehicles.body.data,
    ],
    [
      'useDriverBankAccounts',
      () => useDriverBankAccounts(),
      replyWith(fixtures.driverBankAccounts),
      '/driver/bank-accounts',
      {},
      fixtures.driverBankAccounts.body.data,
    ],
    [
      'useDriverDocuments',
      () => useDriverDocuments(),
      replyWith(fixtures.driverDocuments),
      '/driver/documents',
      {},
      fixtures.driverDocuments.body,
    ],
    [
      'useGeoReverse',
      () => useGeoReverse({ lat: 40.18, lng: 44.51 }),
      replyWith(fixtures.geoReverse),
      '/geo/reverse',
      { lat: '40.18', lng: '44.51' },
      fixtures.geoReverse.body.place,
    ],
    [
      'useGeoRoute',
      () => useGeoRoute({ lat: 40.18, lng: 44.51 }, { lat: 40.2, lng: 44.53 }),
      replyWith(fixtures.geoRoute),
      '/geo/route',
      { from: '40.18,44.51', to: '40.2,44.53' },
      fixtures.geoRoute.body.route,
    ],
  ];

  it.each(table)('%s', async (_name, hook, reply, path, query, data) => {
    const { result, server } = await renderWithApi(hook as () => { isSuccess: boolean; data: unknown }, [reply]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(server.requests[0]).toMatchObject({ method: 'GET', path });
    expect(server.requests[0]?.query).toEqual(query);
    expect(result.current.data).toEqual(data);
  });

  it.each([
    ['useSavedPlace(null)', () => useSavedPlace(null)],
    ['useSupportTicket(null)', () => useSupportTicket(null)],
    ['useGeoReverse(null)', () => useGeoReverse(null)],
    ['useGeoRoute(null, point)', () => useGeoRoute(null, { lat: 1, lng: 2 })],
    ['useGeoRoute(point, null)', () => useGeoRoute({ lat: 1, lng: 2 }, null)],
  ])('%s asks for nothing until it has what it needs', async (_name, hook) => {
    const { result, server } = await renderWithApi(hook as () => { fetchStatus: string }, []);
    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));

    expect(server.requests).toHaveLength(0);
  });
});

describe('address search', () => {
  it('asks nothing for fewer than two characters and trims what was typed', async () => {
    const short = await renderWithApi(() => useGeoAutocomplete({ q: ' a ' }), []);
    await waitFor(() => expect(short.result.current.fetchStatus).toBe('idle'));
    expect(short.server.requests).toHaveLength(0);

    const search = await renderWithApi(
      () => useGeoAutocomplete({ q: '  Abovyan  ', near: { lat: 40.18, lng: 44.51 }, session: 'search-1' }),
      [replyWith(fixtures.geoAutocomplete)],
    );
    await waitFor(() => expect(search.result.current.isSuccess).toBe(true));

    expect(search.server.requests[0]?.query).toEqual({ q: 'Abovyan', lat: '40.18', lng: '44.51', session: 'search-1' });
    expect(search.result.current.data).toEqual(fixtures.geoAutocomplete.body.suggestions);
  });

  it('sends no position when only half of one is known', async () => {
    const { result, server } = await renderWithApi(
      () => useGeoAutocomplete({ q: 'Aba', near: { lat: 40.18 } }),
      [replyWith(fixtures.geoAutocomplete)],
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(server.requests[0]?.query).toEqual({ q: 'Aba' });
  });

  it('keeps the previous suggestions on screen while the next search loads, and does not pay for the same search twice', async () => {
    let q = 'Aba';
    const { result, rerender, server } = await renderWithApi(
      () => useGeoAutocomplete({ q }),
      [replyWith(fixtures.geoAutocomplete), { status: 200, body: { suggestions: [] } }],
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    q = 'Abov';
    rerender({});

    expect(result.current.data).toEqual(fixtures.geoAutocomplete.body.suggestions);
    await waitFor(() => expect(result.current.data).toEqual([]));
    q = 'Aba';
    rerender({});
    await waitFor(() => expect(result.current.data).toEqual(fixtures.geoAutocomplete.body.suggestions));

    expect(server.requests).toHaveLength(2);
  });
});

describe('errors and retries', () => {
  it('hands the screen the tagged error', async () => {
    const { result } = await renderWithApi(() => useSavedPlace(999999), [replyWith(fixtures.errorNotFound)]);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(getApiError(result.current.error)).toEqual({ kind: 'not_found', status: 404, message: null, code: null });
  });

  it('tries again after a server failure and then shows the data, with no error on screen', async () => {
    const { result, server } = await renderWithApi(
      () => useMe(),
      [{ status: 503, body: {} }, 'network-error', replyWith(fixtures.meRider)],
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(server.requests).toHaveLength(3);
    expect(result.current.isError).toBe(false);
  });

  it('gives up after two extra tries', async () => {
    const { result, server } = await renderWithApi(
      () => useMe(),
      [
        { status: 503, body: {} },
        { status: 503, body: {} },
        { status: 503, body: {} },
      ],
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(server.requests).toHaveLength(3);
    expect(getApiError(result.current.error)).toMatchObject({ kind: 'server' });
  });

  it.each([
    [replyWith(fixtures.errorValidation)],
    [replyWith(fixtures.errorNotFound)],
    [replyWith(fixtures.errorDriverNotVerified)],
    [replyWith(fixtures.errorRateLimited)],
  ])('does not repeat an answer that would not change (%#)', async (reply) => {
    const { result, server } = await renderWithApi(() => useMe(), [reply]);
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(server.requests).toHaveLength(1);
  });

  it('decides what to retry: no connection, timeout and server failures, at most twice; never an answer that would not change', () => {
    const failing = (kind: string, status: number | null) =>
      new ApiRequestError({ kind, status, message: null, code: null } as never);

    for (const [kind, status, expected] of [
      ['network', null, true],
      ['timeout', null, true],
      ['server', 503, true],
      ['rate_limited', 429, false],
      ['validation', 422, false],
      ['not_found', 404, false],
      ['forbidden', 403, false],
      ['unauthenticated', 401, false],
      ['conflict', 409, false],
    ] as const) {
      expect([kind, shouldRetryQuery(0, failing(kind, status))]).toEqual([kind, expected]);
    }

    expect(shouldRetryQuery(1, failing('network', null))).toBe(true);
    expect(shouldRetryQuery(2, failing('network', null))).toBe(false);
    expect(shouldRetryQuery(0, new Error('bug'))).toBe(false);
  });

  it('waits 1 s, 2 s, 4 s… between tries, never more than 8 s', () => {
    expect([0, 1, 2, 3, 4, 10].map(retryDelay)).toEqual([1_000, 2_000, 4_000, 8_000, 8_000, 8_000]);
  });
});

describe('refetching on an interval', () => {
  it('polls a ticket over REST when asked to (no realtime connection)', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const { result, server } = await renderWithApi(
        () => useSupportTicket(1, { refetchInterval: 4_000 }),
        [replyWith(fixtures.supportTicketShow), replyWith(fixtures.supportTicketShow)],
      );
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(4_100);
      });
      await waitFor(() => expect(server.requests).toHaveLength(2));
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('follows the value only after it stopped changing', async () => {
    const { renderHook } = jest.requireActual(
      '@testing-library/react-native',
    ) as typeof import('@testing-library/react-native');
    let value = 'a';
    const { result, rerender } = renderHook(() => useDebouncedValue(value, 300));
    expect(result.current).toBe('a');

    value = 'ab';
    rerender({});
    await act(async () => {
      await jest.advanceTimersByTimeAsync(200);
    });
    value = 'abc';
    rerender({});
    await act(async () => {
      await jest.advanceTimersByTimeAsync(299);
    });
    expect(result.current).toBe('a');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2);
    });
    expect(result.current).toBe('abc');
  });
});
