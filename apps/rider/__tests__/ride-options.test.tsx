import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { act, userEvent, waitFor, within } from '@testing-library/react-native';
import { decodePolyline } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';
import * as Location from 'expo-location';
import { renderRouter, screen } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { installBackend, ok, signIn, signOut, type Backend, type RecordedRequest } from '../test-support/backend';

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

const permissions = {
  get: jest.mocked(Location.getForegroundPermissionsAsync),
  position: jest.mocked(Location.getCurrentPositionAsync),
};

let backend: Backend;
let requests: RecordedRequest[];

type Class = 'economy' | 'comfort' | 'business';
const estimate = (vehicle_class: Class, amount: number, surge = '1.00') => ({
  vehicle_class,
  currency: 'AMD',
  amount,
  amount_min: Math.round(amount * 0.9),
  amount_max: Math.round(amount * 1.1),
  surge_multiplier: surge,
  eta_to_pickup_seconds: null,
});
/** economy 900–1,100, comfort 1,350–1,650 (busy ×1.5), business 2,250–2,750. */
const PRICES = [estimate('economy', 1000), estimate('comfort', 1500, '1.50'), estimate('business', 2500)];
const quoteWith = (estimates: unknown[], expiresInMinutes = 10, id = fixtures.fareEstimate.body.quote_id) =>
  ok({
    ...fixtures.fareEstimate,
    body: {
      ...fixtures.fareEstimate.body,
      quote_id: id,
      estimates,
      expires_at: new Date(Date.now() + expiresInMinutes * 60_000).toISOString(),
    },
  });

beforeEach(async () => {
  ({ backend, requests } = installBackend());
  backend.fareEstimate = quoteWith(PRICES);
  jest.mocked(Sentry.captureException).mockClear();
  permissions.get.mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
    granted: true,
  } as Location.LocationPermissionResponse);
  permissions.position.mockResolvedValue({
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

const estimates = () => requests.filter((request) => request.path === '/trips/fare-estimate');
const card = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}, `) });
const cards = () => screen.getAllByRole('radio');

type User = ReturnType<typeof userEvent.setup>;

/** Home > Where to? > a drop-off > Continue: the way a rider gets to the ride options. */
async function openRideOptions(user: User) {
  renderRouter('./src/app', { initialUrl: '/' });
  await user.press(await screen.findByRole('button', { name: /^Drop-off: / }));
  await user.type(await screen.findByLabelText('Drop-off'), 'Abov');
  await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));
  await user.press(await screen.findByRole('button', { name: 'Continue' }));
  await screen.findByRole('header', { name: 'Choose your ride' });
}

/** The listeners the app registered for the app coming back to the front; calling them is the rider opening the app again. */
function captureAppState() {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
    listeners.push(listener as (state: AppStateStatus) => void);

    return { remove: () => void listeners.splice(listeners.indexOf(listener as (state: AppStateStatus) => void), 1) };
  });

  return () => listeners.slice().forEach((listener) => listener('active'));
}

describe('the cards', () => {
  it('show one card per vehicle class with its estimated price range, the first one chosen', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);

    expect(cards().map((c) => c.props.accessibilityLabel)).toEqual([
      'Economy, ֏900 – ֏1,100',
      'Comfort, ֏1,350 – ֏1,650',
      'Business, ֏2,250 – ֏2,750',
    ]);
    expect(card('Economy')).toBeSelected();
    expect(card('Comfort')).not.toBeSelected();
    expect(card('Business')).not.toBeSelected();
    expect(screen.getByText('Estimated: the final fare may vary.')).toBeOnTheScreen();
  });

  it('show a surge note on a class whose price is raised, and only there', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);

    expect(within(card('Comfort')).getByText('Busy now ×1.5')).toBeOnTheScreen();
    expect(within(card('Economy')).queryByText(/Busy now/)).not.toBeOnTheScreen();
    expect(within(card('Business')).queryByText(/Busy now/)).not.toBeOnTheScreen();
    expect(card('Comfort').props.accessibilityHint).toBe(
      'Prices are higher than usual because many people are riding.',
    );
    expect(card('Economy').props.accessibilityHint).toBeUndefined();
  });

  it('change the choice and the price shown without asking the server again', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    const before = estimates().length;

    await user.press(card('Comfort'));

    expect(card('Comfort')).toBeSelected();
    expect(card('Economy')).not.toBeSelected();
    expect(screen.getAllByText('֏1,350 – ֏1,650').length).toBeGreaterThanOrEqual(2); // the card and the fare line
    await user.press(card('Business'));
    expect(card('Business')).toBeSelected();
    expect(screen.getAllByText('֏2,250 – ֏2,750').length).toBeGreaterThanOrEqual(2);
    expect(estimates()).toHaveLength(before);
    expect(screen.getByRole('header', { name: 'Choose your ride' })).toBeOnTheScreen();
  });

  it('leave out a class whose price is zero or broken, and show no cards at all if none is usable', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = quoteWith([
      estimate('economy', 0),
      estimate('comfort', 1500),
      { ...estimate('business', 2500), amount_min: 3000 },
    ]);
    await openRideOptions(user);

    expect(cards().map((c) => c.props.accessibilityLabel)).toEqual(['Comfort, ֏1,350 – ֏1,650']);
    expect(card('Comfort')).toBeSelected();
  });

  it('say prices are not available, with a retry, instead of showing a zero price when no class has a usable price', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = quoteWith([estimate('economy', 0), estimate('comfort', -5)]);
    await openRideOptions(user);

    expect(await screen.findByText('Prices are not available')).toBeOnTheScreen();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText(/֏/)).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('show how the rider pays: cash', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);

    expect(screen.getByText('Cash')).toBeOnTheScreen();
    expect(screen.getByText('Pay the driver at the end of the ride.')).toBeOnTheScreen();
  });
});

describe('the map', () => {
  it('shows the route and both ends of the chosen trip', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);

    expect(screen.getAllByTestId('ViewAnnotation').map((a) => a.props.lngLat)).toEqual([
      [44.5136, 40.1811],
      [44.5021, 40.18241],
    ]);
    await waitFor(() =>
      expect(screen.getByTestId('GeoJSONSource').props.data.geometry.coordinates).toEqual(
        decodePolyline(fixtures.geoRoute.body.route.polyline).map(({ lat, lng }) => [lng, lat]),
      ),
    );
  });

  it('draws no line when the route cannot be had, and the prices still show', async () => {
    const user = userEvent.setup();
    backend.route = { status: 500, body: { message: 'Server Error' } };
    await openRideOptions(user);

    expect(cards()).toHaveLength(3);
    expect(screen.queryByTestId('GeoJSONSource')).not.toBeOnTheScreen();
  });
});

describe('an expired quote', () => {
  it('is replaced when it runs out while the rider is looking, and the new price is shown', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.fareEstimate = quoteWith(PRICES, 1);
    await openRideOptions(user);
    expect(estimates()).toHaveLength(1);
    backend.fareEstimate = quoteWith(
      [estimate('economy', 2000), estimate('comfort', 3000), estimate('business', 4000)],
      10,
      'second-quote',
    );

    act(() => jest.advanceTimersByTime(60_000));

    await waitFor(() => expect(estimates()).toHaveLength(2));
    expect(await screen.findByLabelText('Economy, ֏1,800 – ֏2,200')).toBeOnTheScreen();
    expect(estimates()[1]?.body).toEqual({
      pickup: { lat: 40.1811, lng: 44.5136 },
      dropoff: { lat: 40.18241, lng: 44.5021 },
    });
    expect(screen.queryByLabelText('Economy, ֏900 – ֏1,100')).not.toBeOnTheScreen();
  });

  it('is replaced when the app comes back after it expired, and keeps the class the rider chose', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const comeBack = captureAppState();
    backend.fareEstimate = quoteWith(PRICES, 5);
    await openRideOptions(user);
    await user.press(card('Comfort'));
    backend.fareEstimate = quoteWith([
      estimate('economy', 2000),
      estimate('comfort', 3000),
      estimate('business', 4000),
    ]);

    // The phone was in a pocket: the clock moved on, no timer ran.
    jest.setSystemTime(Date.now() + 6 * 60_000);
    act(() => comeBack());

    expect(await screen.findByLabelText('Comfort, ֏2,700 – ֏3,300')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Comfort, / })).toBeSelected();
    expect(estimates()).toHaveLength(2);
  });

  it('is not replaced when the app comes back and the quote is still good', async () => {
    const user = userEvent.setup();
    const comeBack = captureAppState();
    await openRideOptions(user);

    await act(async () => comeBack());

    expect(estimates()).toHaveLength(1);
    expect(cards()).toHaveLength(3);
  });

  it('is asked for once when the timer and the app coming back both notice it', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const comeBack = captureAppState();
    backend.fareEstimate = quoteWith(PRICES, 1);
    await openRideOptions(user);
    let answer: (() => void) | undefined;
    backend.fareEstimate = () => new Promise((resolve) => (answer = () => resolve(quoteWith(PRICES))));

    act(() => {
      jest.advanceTimersByTime(60_000);
      comeBack();
    });
    await act(async () => answer?.());

    await waitFor(() => expect(estimates()).toHaveLength(2));
  });

  it('keeps the old cards, marked busy, while the new price is on its way', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.fareEstimate = quoteWith(PRICES, 1);
    await openRideOptions(user);
    let answer: (() => void) | undefined;
    backend.fareEstimate = () => new Promise((resolve) => (answer = () => resolve(quoteWith(PRICES))));

    act(() => jest.advanceTimersByTime(60_000));

    expect(await screen.findByText('Updating prices')).toBeOnTheScreen();
    expect(card('Economy')).toBeBusy();
    expect(card('Economy')).toBeDisabled();
    await act(async () => answer?.());
    await waitFor(() => expect(screen.queryByText('Updating prices')).not.toBeOnTheScreen());
    expect(card('Economy')).not.toBeBusy();
  });

  it('falls back to the first class when the new quote no longer prices the one the rider chose', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.fareEstimate = quoteWith(PRICES, 1);
    await openRideOptions(user);
    await user.press(card('Business'));
    backend.fareEstimate = quoteWith([estimate('economy', 2000), estimate('comfort', 3000)]);

    act(() => jest.advanceTimersByTime(60_000));

    expect(await screen.findByLabelText('Economy, ֏1,800 – ֏2,200')).toBeOnTheScreen();
    expect(card('Economy')).toBeSelected();
    expect(screen.queryByRole('radio', { name: /^Business/ })).not.toBeOnTheScreen();
  });

  it.each([
    [
      'there is no connection',
      'network-error' as const,
      'No connection',
      'No connection. Check your internet and try again.',
    ],
    [
      'the server fails',
      { status: 503, body: { message: 'Server Error' } },
      'Prices are not available',
      'We could not get the prices for this ride. Try again.',
    ],
  ])(
    'shows why and a retry, never an old or empty price, when %s',
    async (_, reply, title, message) => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      backend.fareEstimate = quoteWith(PRICES, 1);
      await openRideOptions(user);
      backend.fareEstimate = reply;

      act(() => jest.advanceTimersByTime(60_000));

      expect(await screen.findByText(title, undefined, { timeout: 15000 })).toBeOnTheScreen();
      expect(screen.getByText(message)).toBeOnTheScreen();
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
      expect(screen.queryByText(/֏/)).not.toBeOnTheScreen();

      backend.fareEstimate = quoteWith([estimate('economy', 2000), estimate('comfort', 3000)]);
      await user.press(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByLabelText('Economy, ֏1,800 – ֏2,200')).toBeOnTheScreen();
      expect(screen.queryByText(title)).not.toBeOnTheScreen();
    },
    30000,
  );

  it.each([
    [
      'the pickup is no longer served',
      { status: 422, body: { message: 'Sorry', code: 'outside_service_area' } },
      'Not available here',
      'We do not serve this pickup location yet. Go back and choose another pickup.',
    ],
    [
      'the area has no prices',
      { status: 422, body: { message: 'Prices are not available for this area yet.', code: 'no_fare_rules' } },
      'Not available here',
      'Prices are not available here yet. Go back and choose another pickup.',
    ],
  ])('says so, with no retry, when %s', async (_, reply, title, message) => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.fareEstimate = quoteWith(PRICES, 1);
    await openRideOptions(user);
    backend.fareEstimate = reply;

    act(() => jest.advanceTimersByTime(60_000));

    expect(await screen.findByText(title)).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });
});

describe('leaving and coming back', () => {
  it('goes back to the home screen with the pickup and drop-off as they were', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    await user.press(card('Comfort'));

    await user.press(screen.getAllByRole('button', { name: 'Back' })[0] as never);

    expect(await screen.findByRole('button', { name: /^Drop-off: Fake address/ })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('sends a cold visit back to the start', async () => {
    renderRouter('./src/app', { initialUrl: '/ride-options' });

    expect(await screen.findByRole('button', { name: /^Drop-off: / })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Choose your ride' })).not.toBeOnTheScreen();
  });

  it('forgets the class when the rider chooses another route (a new quote starts again from the first class)', async () => {
    const user = userEvent.setup();
    await openRideOptions(user);
    await user.press(card('Business'));
    await user.press(screen.getAllByRole('button', { name: 'Back' })[0] as never);
    await user.press(await screen.findByRole('button', { name: /^Drop-off: / }));
    await user.type(await screen.findByLabelText('Drop-off'), 'Abov');
    backend.place = ok({
      ...fixtures.geoPlace,
      body: {
        place: { ...fixtures.geoPlace.body.place, address: 'Elsewhere, Yerevan', location: { lat: 40.2, lng: 44.55 } },
      },
    });
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 2, Yerevan' }));
    await user.press(await screen.findByRole('button', { name: 'Continue' }));

    await screen.findByRole('header', { name: 'Choose your ride' });

    expect(card('Economy')).toBeSelected();
  });
});

describe('texts', () => {
  it("speak the rider's language: class names, the note and the payment", async () => {
    await AsyncStorage.setItem('taxikosmos.ui.locale', 'ru');
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });
    await user.press(await screen.findByRole('button', { name: /^Назначение: / }));
    await user.type(await screen.findByLabelText('Назначение'), 'Abov');
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));
    await user.press(await screen.findByRole('button', { name: 'Продолжить' }));
    await screen.findByRole('header', { name: 'Выберите поездку' });

    expect(screen.getByRole('radio', { name: /^Эконом, / })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Комфорт, / })).toBeOnTheScreen();
    expect(screen.getByText('Цена ориентировочная: итоговая может отличаться.')).toBeOnTheScreen();
    expect(screen.getByText('Наличные')).toBeOnTheScreen();
    expect(within(card('Комфорт')).getByText('Высокий спрос ×1,5')).toBeOnTheScreen();
  });

  it('keep prices and addresses out of the error reports', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.fareEstimate = quoteWith(PRICES, 1);
    await openRideOptions(user);
    backend.fareEstimate = { status: 503, body: { message: 'Server Error' } };

    act(() => jest.advanceTimersByTime(60_000));
    await screen.findByText('Prices are not available', undefined, { timeout: 15000 });

    expect(Sentry.captureException).not.toHaveBeenCalled();
  }, 30000);
});
