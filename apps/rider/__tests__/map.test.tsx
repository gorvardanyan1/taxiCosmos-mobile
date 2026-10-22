import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, userEvent, waitFor } from '@testing-library/react-native';
import { AddressSearch } from '@taxikosmos/app-shell';
import * as fixtures from '@taxikosmos/core/fixtures';
import * as Location from 'expo-location';
import { renderRouter, screen } from 'expo-router/testing-library';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import AppGroupLayout from '../src/app/(app)/_layout';
import AuthGroupLayout from '../src/app/(auth)/_layout';
import RootLayout from '../src/app/_layout';
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
      mapTileUrl: 'https://tiles.taxikosmos.test/{z}/{x}/{y}.png',
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

beforeEach(async () => {
  config.environment = 'development';
  ({ backend, requests } = installBackend());
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
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
const DENIED = { status: 'denied', canAskAgain: true, granted: false } as Location.LocationPermissionResponse;
const BLOCKED = { status: 'denied', canAskAgain: false, granted: false } as Location.LocationPermissionResponse;
const HERE = { coords: { latitude: 40.1811, longitude: 44.5136 } } as Location.LocationObject;

const calls = (path: string) => requests.filter((request) => request.path === path);
const searchBox = () => screen.getByLabelText('Search for an address');
const map = () => screen.getByTestId('Map');
const panTo = (lng: number, lat: number) =>
  act(() => map().props.onRegionDidChange({ nativeEvent: { center: [lng, lat], userInteraction: true } }));
const openMap = async () => {
  renderRouter('./src/app', { initialUrl: '/map-preview' });
  await screen.findByTestId('Map');
};

describe('the location permission', () => {
  it('explains why before the system asks, and asks nothing until the person agrees', async () => {
    await openMap();

    expect(await screen.findByRole('header', { name: 'Find you on the map' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Allow location' })).toBeOnTheScreen();
    expect(permissions.request).not.toHaveBeenCalled();
    expect(permissions.position).not.toHaveBeenCalled();
  });

  it('finds the position after Allow, moves the map there, and shows the address of the spot', async () => {
    const user = userEvent.setup();
    permissions.request.mockResolvedValue(GRANTED);
    permissions.position.mockResolvedValue(HERE);
    await openMap();

    await user.press(await screen.findByRole('button', { name: 'Allow location' }));

    await waitFor(() =>
      expect(camera.flyTo).toHaveBeenCalledWith({ center: [44.5136, 40.1811], zoom: 13, duration: 600 }),
    );
    expect(await screen.findByText('Selected: Fake street, near 40.18, 44.51')).toBeOnTheScreen();
    expect(calls('/geo/reverse')[0]?.query).toEqual({ lat: '40.1811', lng: '44.5136' });
    expect(screen.queryByRole('header', { name: 'Find you on the map' })).not.toBeOnTheScreen();
  });

  it('goes straight to the position when it was allowed on an earlier visit, with no prompt', async () => {
    permissions.get.mockResolvedValue(GRANTED);
    permissions.position.mockResolvedValue(HERE);
    await openMap();

    await waitFor(() => expect(camera.flyTo).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('header', { name: 'Find you on the map' })).not.toBeOnTheScreen();
    expect(permissions.request).not.toHaveBeenCalled();
  });

  describe('when location is refused', () => {
    it('keeps the map and the address box, says location is off, and lets the person ask again', async () => {
      const user = userEvent.setup();
      permissions.request.mockResolvedValue(DENIED);
      await openMap();

      await user.press(await screen.findByRole('button', { name: 'Allow location' }));

      expect(await screen.findByRole('header', { name: 'Location is off' })).toBeOnTheScreen();
      expect(map()).toBeOnTheScreen();
      expect(searchBox()).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Allow location' })).toBeOnTheScreen();
      expect(permissions.position).not.toHaveBeenCalled();
    });

    it('still lets the person type an address and pick it', async () => {
      const user = userEvent.setup();
      permissions.get.mockResolvedValue(DENIED);
      await openMap();
      await screen.findByRole('header', { name: 'Location is off' });

      await user.type(searchBox(), 'Abov');
      await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));

      expect(await screen.findByText('Selected: Fake address abovyan-1, Yerevan')).toBeOnTheScreen();
      await waitFor(() =>
        expect(camera.flyTo).toHaveBeenCalledWith({ center: [44.5021, 40.18241], zoom: 13, duration: 600 }),
      );
    });

    it('sends the person to Settings when the system will not ask again', async () => {
      const user = userEvent.setup();
      permissions.get.mockResolvedValue(BLOCKED);
      await openMap();

      await user.press(await screen.findByRole('button', { name: 'Open settings' }));

      expect(Linking.openSettings).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: 'Allow location' })).not.toBeOnTheScreen();
    });

    it('closes the card on "Enter an address instead" and leaves the box', async () => {
      const user = userEvent.setup();
      await openMap();

      await user.press(await screen.findByRole('button', { name: 'Enter an address instead' }));

      expect(screen.queryByRole('header', { name: 'Find you on the map' })).not.toBeOnTheScreen();
      expect(searchBox()).toBeOnTheScreen();
      expect(map()).toBeOnTheScreen();
    });

    it('brings the prompt back when the person taps the location button', async () => {
      const user = userEvent.setup();
      await openMap();
      await user.press(await screen.findByRole('button', { name: 'Enter an address instead' }));

      await user.press(screen.getByRole('button', { name: 'Show my location' }));

      expect(await screen.findByRole('header', { name: 'Find you on the map' })).toBeOnTheScreen();
    });

    it('picks up an allowance made in Settings when the app comes back', async () => {
      let onAppState: (state: AppStateStatus) => void = () => undefined;
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
        onAppState = listener as typeof onAppState;

        return { remove: jest.fn() };
      });
      permissions.get.mockResolvedValue(BLOCKED);
      permissions.position.mockResolvedValue(HERE);
      await openMap();
      await screen.findByRole('button', { name: 'Open settings' });

      permissions.get.mockResolvedValue(GRANTED);
      await act(async () => onAppState('active'));

      await waitFor(() => expect(camera.flyTo).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: 'Open settings' })).not.toBeOnTheScreen();
    });
  });

  it('says it could not find the position, keeps everything else, and finds it on the next try', async () => {
    const user = userEvent.setup();
    permissions.get.mockResolvedValue(GRANTED);
    permissions.position.mockRejectedValue(new Error('Location is unavailable'));
    await openMap();

    expect(await screen.findByText('We could not find your position. Try again or type an address.')).toBeOnTheScreen();
    expect(map()).toBeOnTheScreen();
    expect(searchBox()).toBeOnTheScreen();

    permissions.position.mockResolvedValue(HERE);
    await user.press(screen.getByRole('button', { name: 'Show my location' }));

    await waitFor(() => expect(camera.flyTo).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('We could not find your position. Try again or type an address.')).not.toBeOnTheScreen();
  });

  it('finds the position again when the button is pressed after it was allowed', async () => {
    const user = userEvent.setup();
    permissions.get.mockResolvedValue(GRANTED);
    permissions.position.mockResolvedValue(HERE);
    await openMap();
    await waitFor(() => expect(permissions.position).toHaveBeenCalledTimes(1));

    await user.press(screen.getByRole('button', { name: 'Show my location' }));

    await waitFor(() => expect(permissions.position).toHaveBeenCalledTimes(2));
  });

  it('asks for foreground accuracy only: no background location is requested', async () => {
    permissions.get.mockResolvedValue(GRANTED);
    permissions.position.mockResolvedValue(HERE);
    await openMap();
    await waitFor(() => expect(permissions.position).toHaveBeenCalled());

    expect(permissions.position).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Balanced });
    expect(Object.keys(Location)).not.toContain('requestBackgroundPermissionsAsync');
  });
});

describe('address search', () => {
  it('sends one request per pause of 300 ms in typing, not one per key', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openMap();

    for (const text of ['A', 'b', 'o', 'v']) {
      await user.type(searchBox(), text);
      act(() => jest.advanceTimersByTime(100));
    }

    expect(calls('/geo/autocomplete')).toHaveLength(0);

    act(() => jest.advanceTimersByTime(200));

    await waitFor(() => expect(calls('/geo/autocomplete')).toHaveLength(1));
    expect(calls('/geo/autocomplete')[0]?.query.q).toBe('Abov');
  });

  it('does not search under two characters, and stops at once when the box is cleared', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openMap();

    await user.type(searchBox(), 'A');
    act(() => jest.advanceTimersByTime(400));
    expect(calls('/geo/autocomplete')).toHaveLength(0);

    await user.type(searchBox(), 'bo');
    act(() => jest.advanceTimersByTime(300));
    await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' });
    const before = calls('/geo/autocomplete').length;

    await user.press(screen.getByRole('button', { name: 'Clear the search' }));
    act(() => jest.advanceTimersByTime(400));

    expect(searchBox().props.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Abovyan street 1, Yerevan' })).not.toBeOnTheScreen();
    expect(calls('/geo/autocomplete')).toHaveLength(before);
  });

  it('uses one session token for every request of a search and for the chosen place, then a new one for the next search', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openMap();

    await user.type(searchBox(), 'Ab');
    act(() => jest.advanceTimersByTime(300));
    await waitFor(() => expect(calls('/geo/autocomplete')).toHaveLength(1));
    await user.type(searchBox(), 'ov');
    act(() => jest.advanceTimersByTime(300));
    await waitFor(() => expect(calls('/geo/autocomplete')).toHaveLength(2));
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));
    await waitFor(() => expect(calls('/geo/places/fake-abovyan-1')).toHaveLength(1));

    const first = calls('/geo/autocomplete')[0]?.query.session;
    expect(first).toEqual(expect.any(String));
    expect(calls('/geo/autocomplete')[1]?.query.session).toBe(first);
    expect(calls('/geo/places/fake-abovyan-1')[0]?.query.session).toBe(first);

    await user.clear(searchBox());
    await user.type(searchBox(), 'Mash');
    act(() => jest.advanceTimersByTime(300));
    await waitFor(() => expect(calls('/geo/autocomplete')).toHaveLength(3));

    expect(calls('/geo/autocomplete')[2]?.query.session).not.toBe(first);
  });

  it('starts a new session when the person edits the text after choosing, without clearing it first', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openMap();
    await user.type(searchBox(), 'Abov');
    act(() => jest.advanceTimersByTime(300));
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));
    await waitFor(() => expect(calls('/geo/places/fake-abovyan-1')).toHaveLength(1));
    const first = calls('/geo/autocomplete')[0]?.query.session;

    await user.type(searchBox(), ' 2');
    act(() => jest.advanceTimersByTime(300));
    await waitFor(() => expect(calls('/geo/autocomplete')).toHaveLength(2));

    expect(calls('/geo/autocomplete')[1]?.query.session).toEqual(expect.any(String));
    expect(calls('/geo/autocomplete')[1]?.query.session).not.toBe(first);
  });

  it('gives a chosen place as {lat, lng, address} with its id', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const routes = {
      _layout: RootLayout,
      '(app)/_layout': AppGroupLayout,
      '(app)/index': () => <AddressSearch near={null} onSelect={onSelect} />,
      '(auth)/_layout': AuthGroupLayout,
    };
    renderRouter(routes, { initialUrl: '/' });

    await user.type(await screen.findByLabelText('Search for an address'), 'Abov');
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 2, Yerevan' }));

    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith({
      lat: 40.18241,
      lng: 44.5021,
      address: 'Fake address abovyan-1, Yerevan',
      place_id: 'fake-abovyan-1',
    });
    expect(calls('/geo/places/fake-abovyan-2')).toHaveLength(1);
  });

  it('ranks suggestions near the phone when its position is known', async () => {
    const user = userEvent.setup();
    permissions.get.mockResolvedValue(GRANTED);
    permissions.position.mockResolvedValue(HERE);
    await openMap();
    await waitFor(() => expect(camera.flyTo).toHaveBeenCalled());

    await user.type(searchBox(), 'Abov');
    await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' });

    expect(calls('/geo/autocomplete')[0]?.query).toMatchObject({ lat: '40.1811', lng: '44.5136' });
  });

  it('shows the list with each street and area, and nothing is looked up until one is tapped', async () => {
    const user = userEvent.setup();
    await openMap();

    await user.type(searchBox(), 'Abov');

    expect(await screen.findByRole('button', { name: 'Abovyan street 3, Yerevan' })).toBeOnTheScreen();
    expect(screen.getAllByText('Yerevan')).toHaveLength(3);
    expect(calls('/geo/places/fake-abovyan-3')).toHaveLength(0);
  });

  it('says when nothing was found', async () => {
    const user = userEvent.setup();
    backend.autocomplete = ok({ ...fixtures.geoAutocomplete, body: { suggestions: [] } });
    await openMap();

    await user.type(searchBox(), 'zzzz');

    expect(await screen.findByText('No places found. Check the spelling or try a nearby street.')).toBeOnTheScreen();
  });

  it.each([
    ['there is no connection', 'network-error' as const, 'No connection. Check your internet and try again.'],
    [
      'the server fails',
      { status: 503, body: { message: 'Server Error' } },
      'Search is not available right now. Try again.',
    ],
    ['it is rate limited', errorReply(fixtures.errorRateLimited), 'Search is not available right now. Try again.'],
  ])(
    'says so when %s, and Try again searches again',
    async (_, reply, message) => {
      const user = userEvent.setup();
      backend.autocomplete = reply;
      await openMap();
      await user.type(searchBox(), 'Abov');
      expect(await screen.findByText(message, undefined, { timeout: 15000 })).toBeOnTheScreen();

      backend.autocomplete = ok(fixtures.geoAutocomplete);
      await user.press(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' })).toBeOnTheScreen();
      expect(screen.queryByText(message)).not.toBeOnTheScreen();
    },
    30000,
  );

  it('says so when the chosen place cannot be fetched, and the person can choose again', async () => {
    const user = userEvent.setup();
    backend.place = { status: 404, body: { message: 'No query results' } };
    await openMap();
    await user.type(searchBox(), 'Abov');

    await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));

    expect(await screen.findByText('Search is not available right now. Try again.')).toBeOnTheScreen();
    expect(screen.queryByText(/Selected:/)).not.toBeOnTheScreen();
  });

  it('looks the place up once when a suggestion is tapped twice', async () => {
    const user = userEvent.setup();
    let answer: (() => void) | undefined;
    backend.place = () => new Promise((resolve) => (answer = () => resolve(ok(fixtures.geoPlace))));
    await openMap();
    await user.type(searchBox(), 'Abov');
    const row = await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' });

    await user.press(row);
    await user.press(row);
    await act(async () => answer?.());

    expect(calls('/geo/places/fake-abovyan-1')).toHaveLength(1);
  });
});

describe('dragging the map to pick a spot', () => {
  it('shows a pin in the middle and the address under it once the map is let go', async () => {
    await openMap();
    expect(screen.getByLabelText('Selected point')).toBeOnTheScreen();

    await panTo(44.52, 40.19);

    expect(await screen.findByText('Selected: Fake street, near 40.18, 44.51')).toBeOnTheScreen();
    expect(calls('/geo/reverse')).toHaveLength(1);
    expect(calls('/geo/reverse')[0]?.query).toEqual({ lat: '40.19', lng: '44.52' });
  });

  it('asks once per let-go, not while the map is still moving', async () => {
    await openMap();

    act(() => map().props.onRegionDidChange({ nativeEvent: { center: [44.5, 40.1], userInteraction: false } }));

    expect(calls('/geo/reverse')).toHaveLength(0);
  });

  it('says it is finding the address, and says when it could not, with a way to try again', async () => {
    const user = userEvent.setup();
    backend.reverse = 'network-error';
    await openMap();

    await panTo(44.52, 40.19);

    expect(
      await screen.findByText('We could not find the address of this spot.', undefined, { timeout: 15000 }),
    ).toBeOnTheScreen();

    backend.reverse = ok(fixtures.geoReverse);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Selected: Fake street, near 40.18, 44.51')).toBeOnTheScreen();
  }, 30000);

  it('shows a place chosen by typing instead of the address under the pin, until the map is moved again', async () => {
    const user = userEvent.setup();
    await openMap();
    await user.type(searchBox(), 'Abov');
    await user.press(await screen.findByRole('button', { name: 'Abovyan street 1, Yerevan' }));
    await screen.findByText('Selected: Fake address abovyan-1, Yerevan');
    expect(calls('/geo/reverse')).toHaveLength(0);

    await panTo(44.6, 40.25);

    expect(await screen.findByText('Selected: Fake street, near 40.18, 44.51')).toBeOnTheScreen();
    expect(screen.queryByText('Selected: Fake address abovyan-1, Yerevan')).not.toBeOnTheScreen();
  });
});

describe('the look of the map', () => {
  it('uses the tile server the build was given', async () => {
    await openMap();

    expect(map().props.mapStyle.sources.tiles.tiles).toEqual(['https://tiles.taxikosmos.test/{z}/{x}/{y}.png']);
  });

  it.each([
    ['light', '#E8ECE7'],
    ['dark', '#252C29'],
  ])('follows the app theme: %s', async (theme, grey) => {
    await AsyncStorage.setItem('taxikosmos.ui.theme', theme);
    await openMap();

    await waitFor(() =>
      expect(
        map().props.mapStyle.layers.find((layer: { id: string }) => layer.id === 'background').paint[
          'background-color'
        ],
      ).toBe(grey),
    );
  });

  it("speaks the person's language in the prompt and the search box", async () => {
    await AsyncStorage.setItem('taxikosmos.ui.locale', 'ru');
    await openMap();

    expect(await screen.findByRole('header', { name: 'Найдём вас на карте' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Поиск адреса')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Показать моё местоположение' })).toBeOnTheScreen();
  });
});

describe('availability', () => {
  it('opens from the home screen of a development build', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });

    await user.press(await screen.findByRole('button', { name: 'Map' }));

    expect(await screen.findByTestId('Map')).toBeOnTheScreen();
  });

  it('is not reachable in a production build: no button, and its address leads home', async () => {
    config.environment = 'production';
    renderRouter('./src/app', { initialUrl: '/' });
    expect(await screen.findByRole('header', { name: 'TaxiKosmos (Dev)' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeOnTheScreen();

    screen.unmount();
    renderRouter('./src/app', { initialUrl: '/map-preview' });

    expect(await screen.findByRole('header', { name: 'TaxiKosmos (Dev)' })).toBeOnTheScreen();
    expect(screen.queryByTestId('Map')).not.toBeOnTheScreen();
  });
});
