import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { act, fireEvent, userEvent, waitFor } from '@testing-library/react-native';
import { decodePolyline, DEFAULT_MAP_CENTER, midpoint, zoomToFit } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';
import * as Location from 'expo-location';
import { renderRouter, screen } from 'expo-router/testing-library';
import { BackHandler, Linking } from 'react-native';

import {
  errorReply,
  installBackend,
  ok,
  signIn,
  signOut,
  type Backend,
  type RecordedRequest,
} from '../test-support/backend';

jest.mock('../src/config', () => {
  const state = { environment: 'development' };

  return {
    __state: state,
    appConfig: {
      get environment() {
        return state.environment;
      },
      apiUrl: 'http://10.0.2.2:8000',
      mapTileUrl: null,
      app: 'rider',
    },
  };
});

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

const config = jest.requireMock('../src/config').__state as { environment: string };
const camera = jest.requireMock('@maplibre/maplibre-react-native').__camera as { flyTo: jest.Mock };
const permissions = {
  get: jest.mocked(Location.getForegroundPermissionsAsync),
  request: jest.mocked(Location.requestForegroundPermissionsAsync),
  position: jest.mocked(Location.getCurrentPositionAsync),
};

let backend: Backend;
let requests: RecordedRequest[];

/** A quote that is good for ten minutes (the recorded one has long expired). */
const freshQuote = (expiresInMinutes = 10) =>
  ok({
    ...fixtures.fareEstimate,
    body: { ...fixtures.fareEstimate.body, expires_at: new Date(Date.now() + expiresInMinutes * 60_000).toISOString() },
  });

beforeEach(async () => {
  config.environment = 'development';
  ({ backend, requests } = installBackend());
  backend.fareEstimate = freshQuote();
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
  jest.mocked(Sentry.captureException).mockClear();
  camera.flyTo.mockClear();
  await signIn();
});

afterEach(async () => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  await signOut();
});

const GRANTED = { status: 'granted', canAskAgain: true, granted: true } as Location.LocationPermissionResponse;
const HERE = { coords: { latitude: 40.1811, longitude: 44.5136 } } as Location.LocationObject;
// The recorded answers: the reverse lookup of any spot, and the place a chosen suggestion resolves to.
const HERE_ADDRESS = 'Fake street, near 40.18, 44.51';
const PLACE = { lat: 40.18241, lng: 44.5021, address: 'Fake address abovyan-1, Yerevan' };

const calls = (path: string) => requests.filter((request) => request.path === path);
const dropoffRow = () => screen.findByRole('button', { name: /^Drop-off: / });
const continueButton = (name: string | RegExp) => screen.getByRole('button', { name });
const map = () => screen.getByTestId('Map');
const pan = (lng: number, lat: number) =>
  act(() => map().props.onRegionDidChange({ nativeEvent: { center: [lng, lat], userInteraction: true } }));

async function openHome(options: { located?: boolean } = {}) {
  if (options.located ?? true) {
    permissions.get.mockResolvedValue(GRANTED);
    permissions.position.mockResolvedValue(HERE);
  }

  renderRouter('./src/app', { initialUrl: '/' });
  await dropoffRow();
}

/** Chooses the drop-off the way a rider does: Where to? > type > tap a suggestion. */
async function chooseDropoff(user: ReturnType<typeof userEvent.setup>, suggestion = 'Abovyan street 1, Yerevan') {
  await user.press(await dropoffRow());
  await user.type(await screen.findByLabelText('Drop-off'), 'Abov');
  await user.press(await screen.findByRole('button', { name: suggestion }));
}

describe('the pickup', () => {
  it('is where the phone is, with the address the maps give for it', async () => {
    await openHome();

    expect(await screen.findByText(HERE_ADDRESS)).toBeOnTheScreen();
    expect(calls('/geo/reverse')[0]?.query).toEqual({ lat: '40.1811', lng: '44.5136' });
    expect(screen.getByText('Pickup')).toBeOnTheScreen();
  });

  it('says the location is being found while the address is on its way', async () => {
    let answer: (() => void) | undefined;
    backend.reverse = () => new Promise((resolve) => (answer = () => resolve(ok(fixtures.geoReverse))));
    await openHome();

    expect(await screen.findByText('Finding your location')).toBeOnTheScreen();

    await act(async () => answer?.());

    expect(await screen.findByText(HERE_ADDRESS)).toBeOnTheScreen();
  });

  it('says it could not find the address, and finds it on retry', async () => {
    const user = userEvent.setup();
    backend.reverse = 'network-error';
    await openHome();
    expect(
      await screen.findByText('We could not find the address of this spot.', undefined, { timeout: 15000 }),
    ).toBeOnTheScreen();

    backend.reverse = ok(fixtures.geoReverse);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText(HERE_ADDRESS)).toBeOnTheScreen();
  }, 30000);

  it('moves the map to the phone when its position arrives', async () => {
    await openHome();

    await waitFor(() =>
      expect(camera.flyTo).toHaveBeenCalledWith({ center: [44.5136, 40.1811], zoom: 15, duration: 600 }),
    );
  });

  it('can be set by the rider when the location is off: the prompt explains, and Set your pickup opens the picker', async () => {
    const user = userEvent.setup();
    await openHome({ located: false });

    expect(await screen.findByRole('header', { name: 'Find you on the map' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Set your pickup' })).toBeOnTheScreen();
    expect(continueButton('Set your pickup to continue')).toBeDisabled();
    expect(permissions.request).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'Enter an address instead' }));
    await user.press(screen.getByRole('button', { name: 'Set your pickup' }));
    await user.type(await screen.findByLabelText('Pickup'), 'Abov');
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));

    expect(await screen.findByText(PLACE.address)).toBeOnTheScreen();
    expect(continueButton('Choose where you are going')).toBeDisabled();
  });

  it('is found after Allow when the rider agrees to share the location', async () => {
    const user = userEvent.setup();
    permissions.request.mockResolvedValue(GRANTED);
    permissions.position.mockResolvedValue(HERE);
    await openHome({ located: false });

    await user.press(await screen.findByRole('button', { name: 'Allow location' }));

    expect(await screen.findByText(HERE_ADDRESS)).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Find you on the map' })).not.toBeOnTheScreen();
  });

  it('offers Settings when location is blocked, and a pickup can still be set by hand', async () => {
    const user = userEvent.setup();
    permissions.get.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
      granted: false,
    } as Location.LocationPermissionResponse);
    await openHome({ located: false });

    await user.press(await screen.findByRole('button', { name: 'Open settings' }));

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    // Settings is the only way to turn it on, but the rider can still set a pickup without it.
    expect(screen.getByRole('button', { name: 'Set your pickup' })).toBeOnTheScreen();
    expect(continueButton('Set your pickup to continue')).toBeDisabled();
  });

  it('can be moved by dragging the map under the pin, and the rider confirms the spot', async () => {
    const user = userEvent.setup();
    await openHome();
    await screen.findByText(HERE_ADDRESS);

    await user.press(screen.getByRole('button', { name: 'Change' }));
    expect(await screen.findByRole('header', { name: 'Move the map to set your pickup' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Pickup point')).toBeOnTheScreen();
    await pan(44.52, 40.19);
    await waitFor(() =>
      expect(
        calls('/geo/reverse').some((request) => request.query.lat === '40.19' && request.query.lng === '44.52'),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm pickup' })).toBeEnabled());
    await user.press(screen.getByRole('button', { name: 'Confirm pickup' }));

    expect(screen.queryByRole('header', { name: 'Move the map to set your pickup' })).not.toBeOnTheScreen();
    expect(await screen.findByText(HERE_ADDRESS)).toBeOnTheScreen();
    // The ride starts where the pin was, not where the phone is.
    await chooseDropoff(user);
    await waitFor(() => expect(calls('/trips/fare-estimate')).toHaveLength(1));
    expect(calls('/trips/fare-estimate')[0]?.body).toEqual({
      pickup: { lat: 40.19, lng: 44.52 },
      dropoff: { lat: PLACE.lat, lng: PLACE.lng },
    });
  });

  it('keeps Confirm off until the address of the spot is known, and says when it could not be found', async () => {
    const user = userEvent.setup();
    backend.reverse = 'network-error';
    await openHome({ located: false });
    await user.press(await screen.findByRole('button', { name: 'Enter an address instead' }));
    await user.press(screen.getByRole('button', { name: 'Set your pickup' }));

    expect(
      await screen.findByText('We could not find the address of this spot.', undefined, { timeout: 15000 }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Confirm pickup' })).toBeDisabled();

    backend.reverse = ok(fixtures.geoReverse);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm pickup' })).toBeEnabled());
  }, 30000);

  it('goes back to following the phone with the location button, and leaves the picker with Back', async () => {
    const user = userEvent.setup();
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await user.press(screen.getByRole('button', { name: 'Change' }));
    await user.type(await screen.findByLabelText('Pickup'), 'Abov');
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));
    expect(await screen.findByText(PLACE.address)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Show my location' }));

    expect(await screen.findByText(HERE_ADDRESS)).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Change' }));
    await user.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(HERE_ADDRESS)).toBeOnTheScreen();
  });
});

describe('the drop-off', () => {
  it('starts as "Where to?", and a searched address becomes the drop-off', async () => {
    const user = userEvent.setup();
    await openHome();
    expect(await dropoffRow()).toHaveAccessibleName('Drop-off: Where to?');

    await chooseDropoff(user);

    expect(await screen.findByText(PLACE.address)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `Drop-off: ${PLACE.address}` })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Move the map to set your drop-off' })).not.toBeOnTheScreen();
  });

  it('can be picked on the map instead: move the map under the pin and confirm', async () => {
    const user = userEvent.setup();
    await openHome();
    await screen.findByText(HERE_ADDRESS);

    await user.press(await dropoffRow());
    expect(await screen.findByRole('header', { name: 'Move the map to set your drop-off' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Drop-off point')).toBeOnTheScreen();
    await pan(44.55, 40.2);
    await waitFor(() =>
      expect(
        calls('/geo/reverse').some((request) => request.query.lat === '40.2' && request.query.lng === '44.55'),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm drop-off' })).toBeEnabled());
    await user.press(screen.getByRole('button', { name: 'Confirm drop-off' }));

    await waitFor(() => expect(calls('/trips/fare-estimate')).toHaveLength(1));
    expect(calls('/trips/fare-estimate')[0]?.body).toEqual({
      pickup: { lat: 40.1811, lng: 44.5136 },
      dropoff: { lat: 40.2, lng: 44.55 },
    });
  });

  it("goes back to the overview with the phone's own Back button, and leaves it to the phone from the overview", async () => {
    const user = userEvent.setup();
    const handlers: Parameters<typeof BackHandler.addEventListener>[1][] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
      handlers.push(handler);

      return { remove: () => void handlers.splice(handlers.indexOf(handler), 1) };
    });
    await openHome();
    // The router has listeners of its own; the picker adds one on top while it is open.
    const others = handlers.length;
    await user.press(await dropoffRow());
    await screen.findByRole('header', { name: 'Move the map to set your drop-off' });
    expect(handlers).toHaveLength(others + 1);

    let handled: boolean | null | undefined;
    act(() => {
      handled = handlers[handlers.length - 1]?.({} as never);
    });

    expect(handled).toBe(true);
    expect(await dropoffRow()).toHaveAccessibleName('Drop-off: Where to?');
    expect(screen.queryByRole('header', { name: 'Move the map to set your drop-off' })).not.toBeOnTheScreen();
    // From the overview the picker's listener is gone: the phone's default (leaving the app) applies.
    expect(handlers).toHaveLength(others);
  });

  it('can be left unchanged with Back', async () => {
    const user = userEvent.setup();
    await openHome();

    await user.press(await dropoffRow());
    await user.press(await screen.findByRole('button', { name: 'Back' }));

    expect(await dropoffRow()).toHaveAccessibleName('Drop-off: Where to?');
  });
});

describe('going on', () => {
  it('is not possible without a pickup, and says why on the button', async () => {
    await openHome({ located: false });

    expect(continueButton('Set your pickup to continue')).toBeDisabled();
  });

  it('says the location is being found while the phone has not answered', async () => {
    permissions.get.mockResolvedValue(GRANTED);
    permissions.position.mockImplementation(() => new Promise(() => undefined));
    renderRouter('./src/app', { initialUrl: '/' });
    await dropoffRow();

    expect(continueButton('Finding your location')).toBeDisabled();
  });

  it('is not possible without a drop-off, and says why on the button', async () => {
    await openHome();
    await screen.findByText(HERE_ADDRESS);

    expect(continueButton('Choose where you are going')).toBeDisabled();
    expect(calls('/trips/fare-estimate')).toHaveLength(0);
  });

  it('waits for the price and then opens: the disabled button says it is checking, the estimate gets both coordinates', async () => {
    const user = userEvent.setup();
    let answer: (() => void) | undefined;
    backend.fareEstimate = () => new Promise((resolve) => (answer = () => resolve(freshQuote())));
    await openHome();
    await screen.findByText(HERE_ADDRESS);

    await chooseDropoff(user);

    expect(await screen.findByRole('button', { name: 'Checking prices' })).toBeDisabled();
    await act(async () => answer?.());
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(calls('/trips/fare-estimate')).toHaveLength(1);
    expect(calls('/trips/fare-estimate')[0]?.body).toEqual({
      pickup: { lat: 40.1811, lng: 44.5136 },
      dropoff: { lat: PLACE.lat, lng: PLACE.lng },
    });
  });

  it('refuses a drop-off that is the same place as the pickup, without asking for a price', async () => {
    const user = userEvent.setup();
    backend.place = ok({
      ...fixtures.geoPlace,
      body: { place: { ...fixtures.geoPlace.body.place, location: { lat: 40.18115, lng: 44.5136 } } },
    });
    await openHome();
    await screen.findByText(HERE_ADDRESS);

    await chooseDropoff(user);

    expect(await screen.findByRole('button', { name: 'Pickup and drop-off are the same place' })).toBeDisabled();
    expect(calls('/trips/fare-estimate')).toHaveLength(0);
  });

  it('shows "not available here" on the home screen when the pickup is outside every zone, and does not go on', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = {
      status: 422,
      body: { message: 'Sorry, we do not serve this pickup location yet.', code: 'outside_service_area' },
    };
    await openHome();
    await screen.findByText(HERE_ADDRESS);

    await chooseDropoff(user);

    expect(await screen.findByText('Not available here')).toBeOnTheScreen();
    expect(
      screen.getByText('We do not serve this pickup location yet. Move the pin or choose another pickup.'),
    ).toBeOnTheScreen();
    const button = screen.getByRole('button', { name: 'Not available at this pickup yet' });
    expect(button).toBeDisabled();
    await user.press(button);
    expect(screen.queryByRole('header', { name: 'Choose your ride' })).not.toBeOnTheScreen();
  });

  it('lets the rider fix an unserved pickup: the notice goes away with a pickup that is served', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = { status: 422, body: { message: 'Sorry', code: 'outside_service_area' } };
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);
    await screen.findByText('Not available here');

    backend.fareEstimate = freshQuote();
    backend.place = ok({
      ...fixtures.geoPlace,
      body: {
        place: {
          ...fixtures.geoPlace.body.place,
          address: 'Another address, Yerevan',
          location: { lat: 40.2, lng: 44.55 },
        },
      },
    });
    await user.press(screen.getByRole('button', { name: 'Change' }));
    await user.type(await screen.findByLabelText('Pickup'), 'Abov');
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 2, Yerevan' }));

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.queryByText('Not available here')).not.toBeOnTheScreen();
  });

  it('says prices are not available in an area without fare rules', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = {
      status: 422,
      body: { message: 'Prices are not available for this area yet.', code: 'no_fare_rules' },
    };
    await openHome();
    await screen.findByText(HERE_ADDRESS);

    await chooseDropoff(user);

    expect(await screen.findByRole('button', { name: 'Prices are not available here yet' })).toBeDisabled();
  });

  it.each([
    ['there is no connection', 'network-error' as const, 'No connection. Check your internet and try again.'],
    ['the server fails', { status: 503, body: { message: 'Server Error' } }, 'We could not check prices. Try again.'],
    ['the price check is rate limited', errorReply(fixtures.errorRateLimited), 'We could not check prices. Try again.'],
  ])(
    'says so when %s and Try again asks again',
    async (_, reply, message) => {
      const user = userEvent.setup();
      backend.fareEstimate = reply;
      await openHome();
      await screen.findByText(HERE_ADDRESS);
      await chooseDropoff(user);
      // The message is said twice: by the notice under the route (an alert) and by the disabled button.
      await waitFor(() => expect(screen.getAllByText(message)).toHaveLength(2), { timeout: 15000 });
      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(screen.getByRole('button', { name: message })).toBeDisabled();

      backend.fareEstimate = freshQuote();
      await user.press(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('button', { name: 'Continue' })).toBeEnabled();
    },
    30000,
  );

  it('uses only the answer for the route the rider has now: a slow answer for an older route is dropped', async () => {
    const user = userEvent.setup();
    const answers: (() => void)[] = [];
    let n = 0;
    backend.fareEstimate = () =>
      new Promise((resolve) => {
        n += 1;
        const mine = n;
        answers.push(() =>
          resolve(
            mine === 1 ? { status: 422, body: { message: 'Sorry', code: 'outside_service_area' } } : freshQuote(),
          ),
        );
      });
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);
    await waitFor(() => expect(answers).toHaveLength(1));
    backend.place = ok({
      ...fixtures.geoPlace,
      body: {
        place: {
          ...fixtures.geoPlace.body.place,
          address: 'Another address, Yerevan',
          location: { lat: 40.2, lng: 44.55 },
        },
      },
    });
    await user.press(screen.getByRole('button', { name: `Drop-off: ${PLACE.address}` }));
    await user.type(await screen.findByLabelText('Drop-off'), 'Abov');
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 2, Yerevan' }));
    await waitFor(() => expect(answers).toHaveLength(2));

    await act(async () => {
      answers[1]?.();
      answers[0]?.();
    });

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.queryByText('Not available here')).not.toBeOnTheScreen();
  });

  it('opens the ride options with the chosen route, and Back returns to the same choice', async () => {
    const user = userEvent.setup();
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);

    await user.press(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('header', { name: 'Choose your ride' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Economy, / })).toBeOnTheScreen();
    expect(calls('/trips/fare-estimate')).toHaveLength(1);

    await user.press(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('button', { name: `Drop-off: ${PLACE.address}` })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('asks for a new price when the one in hand has expired, and goes on once', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = freshQuote(-1);
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);
    await waitFor(() => expect(calls('/trips/fare-estimate')).toHaveLength(1));
    backend.fareEstimate = freshQuote();

    const button = await screen.findByRole('button', { name: 'Continue' });
    act(() => {
      fireEvent.press(button);
      fireEvent.press(button);
    });

    expect(await screen.findByRole('header', { name: 'Choose your ride' })).toBeOnTheScreen();
    expect(calls('/trips/fare-estimate')).toHaveLength(2);
  });

  it('stays on the home screen and says so when the new price cannot be had', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = freshQuote(-1);
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);
    await waitFor(() => expect(calls('/trips/fare-estimate')).toHaveLength(1));
    backend.fareEstimate = { status: 422, body: { message: 'Sorry', code: 'outside_service_area' } };

    await user.press(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Not available here')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Choose your ride' })).not.toBeOnTheScreen();
  });

  it('sends a cold visit to the ride options back to the start', async () => {
    renderRouter('./src/app', { initialUrl: '/ride-options' });

    expect(await dropoffRow()).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Choose your ride' })).not.toBeOnTheScreen();
  });
});

describe('the map', () => {
  it('shows both ends and the route once the price is known', async () => {
    const user = userEvent.setup();
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);

    await screen.findByRole('button', { name: 'Continue' });

    expect(screen.getAllByTestId('ViewAnnotation').map((annotation) => annotation.props.lngLat)).toEqual([
      [44.5136, 40.1811],
      [PLACE.lng, PLACE.lat],
    ]);
    expect(screen.getByLabelText('Your pickup')).toBeOnTheScreen();
    expect(screen.getByLabelText('Your drop-off')).toBeOnTheScreen();
    await waitFor(() => expect(calls('/geo/route')).toHaveLength(1));
    expect(calls('/geo/route')[0]?.query).toEqual({ from: '40.1811,44.5136', to: `${PLACE.lat},${PLACE.lng}` });
    await waitFor(() =>
      expect(screen.getByTestId('GeoJSONSource').props.data.geometry.coordinates).toEqual(
        decodePolyline(fixtures.geoRoute.body.route.polyline).map(({ lat, lng }) => [lng, lat]),
      ),
    );
  });

  it('hides the markers while a pin is being placed, and shows them again afterwards', async () => {
    const user = userEvent.setup();
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    expect(screen.getAllByTestId('ViewAnnotation')).toHaveLength(1);

    await user.press(await dropoffRow());

    expect(screen.queryAllByTestId('ViewAnnotation')).toHaveLength(0);
    await user.press(await screen.findByRole('button', { name: 'Back' }));
    expect(screen.getAllByTestId('ViewAnnotation')).toHaveLength(1);
  });

  it('is framed around the whole trip', async () => {
    const user = userEvent.setup();
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    camera.flyTo.mockClear();

    await chooseDropoff(user);

    const here = { lat: 40.1811, lng: 44.5136 };
    const there = { lat: PLACE.lat, lng: PLACE.lng };
    const middle = midpoint(here, there);
    await waitFor(() =>
      expect(camera.flyTo).toHaveBeenCalledWith({
        center: [middle.lng, middle.lat],
        zoom: zoomToFit(here, there),
        duration: 600,
      }),
    );
  });

  it('draws no line, and still lets the rider go on, when the route cannot be had', async () => {
    const user = userEvent.setup();
    backend.route = { status: 500, body: { message: 'Server Error' } };
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeEnabled();
    await waitFor(() => expect(calls('/geo/route').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('GeoJSONSource')).not.toBeOnTheScreen();
  });

  it('draws no line for a route that cannot be read', async () => {
    const user = userEvent.setup();
    backend.route = ok({
      ...fixtures.geoRoute,
      body: { route: { ...fixtures.geoRoute.body.route, polyline: '_p~iF' } },
    });
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeEnabled();
    await waitFor(() => expect(calls('/geo/route').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('GeoJSONSource')).not.toBeOnTheScreen();
  });

  it('asks for no route until the pickup is known to be served', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = { status: 422, body: { message: 'Sorry', code: 'outside_service_area' } };
    await openHome();
    await screen.findByText(HERE_ADDRESS);

    await chooseDropoff(user);
    await screen.findByText('Not available here');

    expect(calls('/geo/route')).toHaveLength(0);
  });

  it('opens on the city centre when nothing is known about where the rider is', async () => {
    await openHome({ located: false });

    expect(map().props.mapStyle).toBeDefined();
    expect(screen.getByTestId('Camera').props.initialViewState.center).toEqual([
      DEFAULT_MAP_CENTER.lng,
      DEFAULT_MAP_CENTER.lat,
    ]);
  });
});

describe('texts and tools', () => {
  it("speaks the rider's language", async () => {
    await AsyncStorage.setItem('taxikosmos.ui.locale', 'ru');
    permissions.get.mockResolvedValue(GRANTED);
    permissions.position.mockResolvedValue(HERE);
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('button', { name: 'Назначение: Куда едем?' })).toBeOnTheScreen();
    expect(await screen.findByText('Посадка')).toBeOnTheScreen();
    await screen.findByText(HERE_ADDRESS);
    expect(screen.getByRole('button', { name: 'Выберите, куда вы едете' })).toBeDisabled();
  });

  it('offers the design system and map tools in a development build only', async () => {
    await openHome();
    expect(screen.getByRole('button', { name: 'Design system' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Map' })).toBeOnTheScreen();

    screen.unmount();
    config.environment = 'production';
    renderRouter('./src/app', { initialUrl: '/' });
    await dropoffRow();

    expect(screen.queryByRole('button', { name: 'Design system' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeOnTheScreen();
  });

  it('keeps coordinates and addresses out of the error reports', async () => {
    const user = userEvent.setup();
    backend.fareEstimate = { status: 503, body: { message: 'Server Error' } };
    await openHome();
    await screen.findByText(HERE_ADDRESS);
    await chooseDropoff(user);
    await screen.findAllByText('We could not check prices. Try again.', undefined, { timeout: 15000 });

    expect(Sentry.captureException).not.toHaveBeenCalled();
  }, 30000);
});
