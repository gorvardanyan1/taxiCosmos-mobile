import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, userEvent, waitFor } from '@testing-library/react-native';
import * as fixtures from '@taxikosmos/core/fixtures';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';

import {
  errorReply,
  installBackend,
  ok,
  signIn,
  signOut,
  tripWith,
  type Backend,
  type RecordedRequest,
  type Reply,
} from '../test-support/backend';
import { MATCHED, openRideOptions, PRICES, quoteWith, tripReply } from '../test-support/booking';

jest.mock('../src/config', () => ({
  appConfig: { environment: 'development', apiUrl: 'http://10.0.2.2:8000', mapTileUrl: null, app: 'rider' },
}));

jest.mock('expo-secure-store', () => {
  const items = new Map<string, string>();

  return {
    AFTER_FIRST_UNLOCK: 1,
    getItemAsync: async (key: string) => items.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void items.set(key, value),
    deleteItemAsync: async (key: string) => void items.delete(key),
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'TaxiKosmos (Dev)', version: '0.1.0' } },
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
  wrap: (component: unknown) => component,
}));

let backend: Backend;
let requests: RecordedRequest[];

beforeEach(async () => {
  ({ backend, requests } = installBackend());
  backend.fareEstimate = quoteWith(PRICES);
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
    granted: true,
  } as Location.LocationPermissionResponse);
  jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({
    coords: { latitude: 40.1811, longitude: 44.5136 },
  } as Location.LocationObject);
  await signIn();
});

afterEach(async () => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  await signOut();
});

const booked = () => requests.filter((request) => request.method === 'POST' && request.path === '/trips');
const cancelled = () => requests.filter((request) => request.path === '/trips/1/cancel');
const reads = (path: string) => requests.filter((request) => request.method === 'GET' && request.path === path);
const keysOf = (list: RecordedRequest[]) => new Set(list.map((request) => request.idempotencyKey));
const card = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}, `) });
const requestButton = (name = 'Economy') => screen.getByRole('button', { name: `Request ${name}` });
const SEARCHING = { name: 'Looking for a driver' };
const LONG = { timeout: 10_000 };

/** A reply that is only given when the test lets it go (a request kept in flight while the test looks at the screen). */
function held() {
  let release: (reply: Reply) => void = () => undefined;
  const reply = new Promise<Reply>((resolve) => {
    release = resolve;
  });

  return { script: () => reply, release };
}

describe('requesting a ride', () => {
  it('sends the chosen class, the quote and both places with an Idempotency-Key, once, and opens the search', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    await user.press(card('Comfort'));

    await user.press(requestButton('Comfort'));

    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    expect(booked()).toHaveLength(1);
    expect(booked()[0]?.body).toEqual({
      quote_id: fixtures.fareEstimate.body.quote_id,
      vehicle_class: 'comfort',
      payment_method: 'cash',
      pickup: { lat: 40.1811, lng: 44.5136, address: fixtures.geoReverse.body.place.address },
      dropoff: { ...fixtures.geoPlace.body.place.location, address: fixtures.geoPlace.body.place.address },
    });
    expect(booked()[0]?.idempotencyKey).toEqual(expect.any(String));
    expect(reads('/trips/1').length).toBeGreaterThan(0);
  });

  it('is sent once when the button is tapped twice', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    const gate = held();
    backend.requestTrip = gate.script;

    await user.press(requestButton());
    await user.press(requestButton());
    expect(booked()).toHaveLength(1);
    expect(card('Comfort')).toBeDisabled();

    gate.release(ok(fixtures.tripsRequested));
    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    expect(booked()).toHaveLength(1);
  });

  it('is retried after a dropped connection with the same key, and books one ride', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    backend.requestTrip = 'network-error';

    await user.press(requestButton());

    expect(await screen.findByText('Request not confirmed', {}, LONG)).toBeOnTheScreen();
    expect(
      screen.getByText('We could not confirm your request. Try again: it will not book two rides.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('header', SEARCHING)).not.toBeOnTheScreen();
    expect(keysOf(booked()).size).toBe(1);

    backend.requestTrip = ok(fixtures.tripsRequested);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    expect(keysOf(booked()).size).toBe(1);
  });

  it('forgets a failure once a new price arrives: it belonged to the old one', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.fareEstimate = quoteWith(PRICES, 1);
    await openRideOptions(user);
    backend.requestTrip = errorReply(fixtures.errorRateLimited);
    await user.press(requestButton());
    expect(await screen.findByText('Too many attempts')).toBeOnTheScreen();

    backend.fareEstimate = quoteWith(PRICES, 10, '0197a000-0000-7000-8000-00000000beef');
    await act(async () => jest.advanceTimersByTimeAsync(61_000));

    await waitFor(() => expect(screen.queryByText('Too many attempts')).not.toBeOnTheScreen());
    expect(requestButton()).toBeOnTheScreen();
  });

  it('says something went wrong, with a retry, when the server fails', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    backend.requestTrip = { status: 500, body: { message: 'Server Error' } };

    await user.press(requestButton());

    expect(await screen.findByText('Something went wrong', {}, LONG)).toBeOnTheScreen();
    expect(screen.queryByText('Server Error')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('asks the rider to wait, with a retry, when there are too many attempts', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    backend.requestTrip = errorReply(fixtures.errorRateLimited);

    await user.press(requestButton());

    expect(await screen.findByText('Too many attempts')).toBeOnTheScreen();
    expect(screen.getByText('Wait a moment and try again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('offers to open the ride the rider already has, instead of booking another', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    backend.requestTrip = errorReply(fixtures.errorTripActive);

    await user.press(requestButton());

    expect(await screen.findByText('You already have a ride')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Request / })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Open my ride' }));

    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    expect(booked()).toHaveLength(1);
  });

  it('says the pickup is not served, with no retry', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    backend.requestTrip = errorReply(fixtures.errorOutsideServiceArea);

    await user.press(requestButton());

    expect(await screen.findByText('Not available here')).toBeOnTheScreen();
    expect(screen.getByText(/We do not serve this pickup location yet/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Request |Try again/ })).not.toBeOnTheScreen();
    // The map's own Back, and the one that answers this refusal.
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(2);
  });

  it("shows the server's reason when it refuses the request", async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    backend.requestTrip = errorReply(fixtures.errorValidation);

    await user.press(requestButton());

    expect(await screen.findByText('We could not book this ride')).toBeOnTheScreen();
    expect(screen.getByText('The dropoff field is required. (and 2 more errors)')).toBeOnTheScreen();
    expect(screen.queryByRole('header', SEARCHING)).not.toBeOnTheScreen();
  });

  it.each([
    ['expired', fixtures.errorQuoteExpired],
    ['unknown', fixtures.errorQuoteNotFound],
    ['for another route', fixtures.errorQuoteRouteChanged],
  ])(
    'asks for a new price when the quote is %s, shows it, and books with the new quote and a new key',
    async (_, refusal) => {
      const user = userEvent.setup();
      await openRideOptions(user);
      backend.requestTrip = errorReply(refusal);
      backend.fareEstimate = quoteWith(PRICES, 10, '0197a000-0000-7000-8000-00000000beef');

      await user.press(requestButton());

      expect(await screen.findByText('The price changed')).toBeOnTheScreen();
      expect(requests.filter((request) => request.path === '/trips/fare-estimate')).toHaveLength(2);

      backend.requestTrip = ok(fixtures.tripsRequested);
      await user.press(requestButton());

      expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
      expect(booked()).toHaveLength(2);
      expect(booked()[1]?.body?.quote_id).toBe('0197a000-0000-7000-8000-00000000beef');
      expect(keysOf(booked()).size).toBe(2);
    },
  );

  it('replaces a quote that expired while the rider looked, before anything is sent', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.fareEstimate = quoteWith(PRICES, 1);
    await openRideOptions(user);
    backend.fareEstimate = quoteWith(PRICES, 10, '0197a000-0000-7000-8000-00000000beef');

    // The phone was in a pocket: the clock moved on, no timer ran.
    jest.setSystemTime(Date.now() + 2 * 60_000);
    await user.press(requestButton());

    await waitFor(() => expect(requests.filter((request) => request.path === '/trips/fare-estimate')).toHaveLength(2));
    expect(booked()).toHaveLength(0);

    await user.press(requestButton());

    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    expect(booked()[0]?.body?.quote_id).toBe('0197a000-0000-7000-8000-00000000beef');
  });
});

describe('the search', () => {
  const openTrip = (id = '1') => renderRouter('./src/app', { initialUrl: `/trip?id=${id}` });

  it('shows who is coming once a driver has the trip, found by polling', async () => {
    jest.useFakeTimers();
    openTrip();
    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    const before = reads('/trips/1').length;

    backend.trip = tripReply(MATCHED);
    await act(async () => jest.advanceTimersByTime(4000));

    expect(await screen.findByRole('header', { name: 'Your driver is on the way' })).toBeOnTheScreen();
    expect(screen.getByText('Aram M.')).toBeOnTheScreen();
    expect(screen.getByText('Silver Toyota Camry · FIX 123')).toBeOnTheScreen();
    expect(reads('/trips/1').length).toBeGreaterThan(before);
    expect(screen.queryByRole('button', { name: 'Cancel ride' })).not.toBeOnTheScreen();
  });

  it('says nobody could be found: not a connection problem, not a refusal', async () => {
    backend.trip = ok(fixtures.tripsNoDriverFound);
    openTrip();

    expect(await screen.findByRole('header', { name: 'No drivers available' })).toBeOnTheScreen();
    expect(screen.getByText('All nearby drivers are busy right now. Try again in a moment.')).toBeOnTheScreen();
    expect(screen.queryByText('Request not confirmed')).not.toBeOnTheScreen();
    expect(screen.queryByText('We could not book this ride')).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', SEARCHING)).not.toBeOnTheScreen();
  });

  it('goes back to the ride options to try again, and the new request is a new ride with a new key', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openRideOptions(user);
    await user.press(requestButton());
    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();

    backend.trip = ok(fixtures.tripsNoDriverFound);
    await act(async () => jest.advanceTimersByTime(4000));
    await user.press(await screen.findByRole('button', { name: 'Try again' }));
    await screen.findByRole('header', { name: 'Choose your ride' });
    backend.trip = ok(fixtures.tripsShow);
    await user.press(requestButton());

    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    expect(booked()).toHaveLength(2);
    expect(keysOf(booked()).size).toBe(2);
  });

  it('goes back to the start from "no drivers"', async () => {
    backend.trip = ok(fixtures.tripsNoDriverFound);
    const user = userEvent.setup();
    openTrip();

    await user.press(await screen.findByRole('button', { name: 'Back to home' }));

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
  });

  it('keeps showing the search, and says so, while the connection is down, and recovers', async () => {
    jest.useFakeTimers();
    openTrip();
    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();

    backend.trip = 'network-error';
    await act(async () => jest.advanceTimersByTimeAsync(30_000));

    expect(await screen.findByText('Connection lost. Trying again…')).toBeOnTheScreen();
    expect(screen.getByRole('header', SEARCHING)).toBeOnTheScreen();

    backend.trip = ok(fixtures.tripsShow);
    await act(async () => jest.advanceTimersByTimeAsync(30_000));

    await waitFor(() => expect(screen.queryByText('Connection lost. Trying again…')).not.toBeOnTheScreen());
  });

  it('shows a retry when the trip cannot be loaded at all', async () => {
    backend.trip = { status: 500, body: { message: 'Server Error' } };
    const user = userEvent.setup();
    openTrip();

    expect(await screen.findByText('Could not load your ride', {}, LONG)).toBeOnTheScreen();

    backend.trip = ok(fixtures.tripsShow);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
  });

  it.each([
    ['a trip that is not the rider’s', '1', errorReply(fixtures.errorNotFound)],
    ['a trip cancelled elsewhere', '1', tripReply({ status: 'cancelled' })],
    ['a trip that is completed', '1', tripReply({ status: 'completed' })],
    ['a link with no trip number', 'abc', ok(fixtures.tripsShow)],
    ['a link with a zero trip number', '0', ok(fixtures.tripsShow)],
  ])('sends the rider back to the start for %s', async (_, id, reply) => {
    backend.trip = reply;
    openTrip(id);

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
    expect(screen.queryByRole('header', SEARCHING)).not.toBeOnTheScreen();
  });
});

describe('cancelling', () => {
  async function searching(user: ReturnType<typeof userEvent.setup>) {
    await openRideOptions(user);
    await user.press(requestButton());
    await screen.findByRole('header', SEARCHING);
  }

  it('cancels on the server and returns to booking, where a new ride can be requested', async () => {
    const user = userEvent.setup();
    await searching(user);

    await user.press(screen.getByRole('button', { name: 'Cancel ride' }));

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
    expect(cancelled()).toHaveLength(1);
    expect(cancelled()[0]?.idempotencyKey).toEqual(expect.any(String));
    expect(screen.queryByRole('header', SEARCHING)).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('header', { name: 'Choose your ride' });
    await user.press(requestButton());

    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    expect(booked()).toHaveLength(2);
    expect(keysOf(booked()).size).toBe(2);
  });

  it('forgets the route: the ride options do not open on the cancelled ride', async () => {
    const user = userEvent.setup();
    await searching(user);
    await user.press(screen.getByRole('button', { name: 'Cancel ride' }));
    await screen.findByRole('button', { name: /^Drop-off: / });

    act(() => router.push('/ride-options'));

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Choose your ride' })).not.toBeOnTheScreen();
  });

  it('is sent once when the button is tapped twice', async () => {
    const user = userEvent.setup();
    await searching(user);
    const gate = held();
    backend.cancelTrip = gate.script;

    await user.press(screen.getByRole('button', { name: 'Cancel ride' }));
    await user.press(screen.getByRole('button', { name: 'Cancel ride' }));
    expect(cancelled()).toHaveLength(1);

    gate.release(ok(fixtures.tripsCancelled));
    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
    expect(cancelled()).toHaveLength(1);
  });

  it('stays on the search with a retry when the connection drops, and the retry carries the same key', async () => {
    const user = userEvent.setup();
    await searching(user);
    backend.cancelTrip = 'network-error';

    await user.press(screen.getByRole('button', { name: 'Cancel ride' }));

    expect(await screen.findByText('Ride not cancelled', {}, LONG)).toBeOnTheScreen();
    expect(
      screen.getByText('We could not reach the server. Try again: the ride is still searching.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('header', SEARCHING)).toBeOnTheScreen();

    backend.cancelTrip = ok(fixtures.tripsCancelled);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
    expect(keysOf(cancelled()).size).toBe(1);
  });

  it('shows the trip as it is when a driver accepted just before the cancel (409)', async () => {
    const user = userEvent.setup();
    await searching(user);
    backend.cancelTrip = {
      status: 409,
      body: {
        message: 'A trip cannot move from in_progress to cancelled.',
        code: 'trip_state_conflict',
        trip: tripWith(MATCHED),
      },
    };

    await user.press(screen.getByRole('button', { name: 'Cancel ride' }));

    expect(await screen.findByRole('header', { name: 'Your driver is on the way' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', SEARCHING)).not.toBeOnTheScreen();
  });

  it('returns to booking when the trip was already cancelled (409)', async () => {
    const user = userEvent.setup();
    await searching(user);
    backend.cancelTrip = errorReply(fixtures.errorTripConflict);

    await user.press(screen.getByRole('button', { name: 'Cancel ride' }));

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
  });
});

describe('opening the app again', () => {
  it('goes back to the search of a ride that is still being looked for', async () => {
    backend.currentTrip = ok(fixtures.tripsCurrent);
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', SEARCHING)).toBeOnTheScreen();
    expect(reads('/trips/current')).toHaveLength(1);
    expect(booked()).toHaveLength(0);
  });

  it('goes back to a ride that already has a driver', async () => {
    backend.currentTrip = tripReply(MATCHED);
    backend.trip = tripReply(MATCHED);
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Your driver is on the way' })).toBeOnTheScreen();
  });

  it('shows the booking screen when there is no ride going', async () => {
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
    await waitFor(() => expect(reads('/trips/current')).toHaveLength(1));
    expect(screen.queryByRole('header', SEARCHING)).not.toBeOnTheScreen();
  });

  it('still shows the booking screen when the ride cannot be looked up', async () => {
    backend.currentTrip = 'network-error';
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
  });
});
