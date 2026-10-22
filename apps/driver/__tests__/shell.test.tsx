import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { act, userEvent, waitFor } from '@testing-library/react-native';
import * as fixtures from '@taxikosmos/core/fixtures';
import { renderRouter, screen } from 'expo-router/testing-library';
import { router, useLocalSearchParams } from 'expo-router';
import { AppState, Linking, Pressable, Text } from 'react-native';

import NotFound from '../src/app/+not-found';
import AppGroupLayout from '../src/app/(app)/_layout';
import Home from '../src/app/(app)/index';
import AuthGroupLayout from '../src/app/(auth)/_layout';
import SignIn from '../src/app/(auth)/sign-in';
import RootLayout from '../src/app/_layout';
import { appApi } from '../src/api';
import {
  configWith,
  forcedUpdate,
  installBackend,
  meWith,
  ok,
  signIn,
  signOut,
  SUPPORT,
  type Backend,
  type RecordedRequest,
} from '../test-support/backend';

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
    default: { expoConfig: build('driver', { APP_ENV: 'development', API_URL: 'http://10.0.2.2:8000' }) },
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

let backend: Backend;
let requests: RecordedRequest[];

beforeEach(() => {
  ({ backend, requests } = installBackend());
  // React Native's own Jest setup already fakes `openURL`; spying on it gives back that same fake, so forget the calls of earlier tests.
  jest.spyOn(Linking, 'openURL').mockClear().mockResolvedValue(undefined);
  jest.mocked(Sentry.captureException).mockClear();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await signOut();
});

const cancelTrip = jest.fn();

function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Text accessibilityRole="header">{`Trip ${id}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel trip" onPress={cancelTrip}>
        <Text>Cancel</Text>
      </Pressable>
    </>
  );
}

/** The app's real layouts and screens, plus one more signed-in screen (a deep link target) the app does not have yet. */
const routes = {
  _layout: RootLayout,
  '(app)/_layout': AppGroupLayout,
  '(app)/index': Home,
  '(app)/trips/[id]': TripScreen,
  '(auth)/_layout': AuthGroupLayout,
  '(auth)/sign-in': SignIn,
  '+not-found': NotFound,
};

const homeHeader = () => screen.findByRole('header', { name: 'TaxiKosmos Driver (Dev)' });

describe('signed out: the app sends people to sign-in, and brings them back', () => {
  it('shows the sign-in screen on a fresh install, remembering the start screen as where to go next', async () => {
    const { getPathname, getSearchParams } = renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Enter your phone number' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'TaxiKosmos Driver (Dev)' })).not.toBeOnTheScreen();
    expect(getPathname()).toBe('/sign-in');
    expect(getSearchParams()).toEqual({ next: '/' });
  });

  it('lands on sign-in from a deep link into the signed-in app, and after signing in continues to that link', async () => {
    const { getPathname, getSearchParams } = renderRouter(routes, { initialUrl: '/trips/42' });

    expect(await screen.findByRole('header', { name: 'Enter your phone number' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Trip 42' })).not.toBeOnTheScreen();
    expect(getSearchParams()).toEqual({ next: '/trips/42' });

    await act(signIn);

    expect(await screen.findByRole('header', { name: 'Trip 42' })).toBeOnTheScreen();
    expect(getPathname()).toBe('/trips/42');
    expect(screen.queryByRole('header', { name: 'Enter your phone number' })).not.toBeOnTheScreen();
  });

  it('follows a valid return address that arrives in the link itself, not only the one the app adds', async () => {
    const { getPathname } = renderRouter(routes, { initialUrl: `/sign-in?next=${encodeURIComponent('/trips/42')}` });
    await screen.findByRole('header', { name: 'Enter your phone number' });

    await act(signIn);

    expect(await screen.findByRole('header', { name: 'Trip 42' })).toBeOnTheScreen();
    expect(getPathname()).toBe('/trips/42');
  });

  it('follows the newest link when a second one is opened while the sign-in screen is up', async () => {
    const { getPathname } = renderRouter(routes, { initialUrl: `/sign-in?next=${encodeURIComponent('/trips/1')}` });
    await screen.findByRole('header', { name: 'Enter your phone number' });

    act(() => router.navigate({ pathname: '/sign-in', params: { next: '/trips/9' } }));
    await act(signIn);

    expect(await screen.findByRole('header', { name: 'Trip 9' })).toBeOnTheScreen();
    expect(getPathname()).toBe('/trips/9');
  });

  it.each([
    ['a web address', 'https://evil.test/phish'],
    ['a protocol-relative address', '//evil.test/x'],
    ['the other app', 'taxirider://trips/1'],
    ['the sign-in screen itself', '/sign-in'],
    ['a script', 'javascript:alert(1)'],
  ])('ignores a return address that is %s and goes to the start instead', async (_, next) => {
    const { getPathname } = renderRouter(routes, { initialUrl: `/sign-in?next=${encodeURIComponent(next)}` });
    await screen.findByRole('header', { name: 'Enter your phone number' });

    await act(signIn);

    expect(await homeHeader()).toBeOnTheScreen();
    expect(getPathname()).toBe('/');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('keeps the design-system preview reachable from the sign-in screen in a development build', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });

    await user.press(await screen.findByRole('button', { name: 'Design system' }));

    expect(await screen.findByRole('header', { name: 'Buttons' })).toBeOnTheScreen();
  });

  it('does not give someone who is not signed in the account behind a link: the trip screen never renders', async () => {
    renderRouter(routes, { initialUrl: '/trips/7' });
    await screen.findByRole('header', { name: 'Enter your phone number' });

    expect(requests.filter((r) => r.path === '/me')).toHaveLength(0);
    expect(screen.queryByRole('header', { name: 'Trip 7' })).not.toBeOnTheScreen();
  });
});

describe('signed in with an active account', () => {
  it('opens the home screen and does not show sign-in', async () => {
    await signIn();
    const { getPathname } = renderRouter('./src/app', { initialUrl: '/' });

    expect(await homeHeader()).toBeOnTheScreen();
    expect(screen.getByText('Environment: development')).toBeOnTheScreen();
    expect(getPathname()).toBe('/');
    expect(requests.find((r) => r.path === '/me')?.authorization).toBe('Bearer 1|fixture-access-token');
  });

  it('opens a deep link straight to its screen from a cold start', async () => {
    await signIn();
    const { getPathname } = renderRouter(routes, { initialUrl: '/trips/42' });

    expect(await screen.findByRole('header', { name: 'Trip 42' })).toBeOnTheScreen();
    expect(getPathname()).toBe('/trips/42');
  });

  it('moves someone who is already signed in on from the sign-in screen', async () => {
    await signIn();
    const { getPathname } = renderRouter(routes, { initialUrl: '/sign-in' });

    expect(await homeHeader()).toBeOnTheScreen();
    expect(getPathname()).toBe('/');
  });

  it("asks the start-up config with this build's identity before anything else", async () => {
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Enter your phone number' });

    expect(requests[0]).toMatchObject({ method: 'GET', path: '/app-config', authorization: null });
    expect(requests[0]?.query).toEqual({ app: 'driver', platform: 'ios', version: '0.1.0' });
  });
});

describe('an account that may not use the app', () => {
  it.each([
    ['suspended', 'Account suspended'],
    ['deactivated', 'Account turned off'],
    ['pending_deletion', 'Account being deleted'],
  ] as const)(
    'a %s driver sees the status screen with a way to reach support, never a broken home screen',
    async (status, title) => {
      await signIn();
      backend.me = meWith(status);
      backend.config = configWith({ support: SUPPORT });
      const user = userEvent.setup();
      renderRouter(routes, { initialUrl: '/' });

      expect(await screen.findByRole('header', { name: title })).toBeOnTheScreen();
      expect(screen.queryByRole('header', { name: 'TaxiKosmos Driver (Dev)' })).not.toBeOnTheScreen();

      await user.press(screen.getByRole('button', { name: 'Email help@taxikosmos.test' }));
      await user.press(screen.getByRole('button', { name: 'Call +37410123456' }));

      expect(Linking.openURL).toHaveBeenNthCalledWith(1, 'mailto:help@taxikosmos.test');
      expect(Linking.openURL).toHaveBeenNthCalledWith(2, 'tel:+37410123456');
    },
  );

  it('does not open a deep link for a suspended account: the screen behind it never renders', async () => {
    await signIn();
    backend.me = meWith('suspended');
    renderRouter(routes, { initialUrl: '/trips/42' });

    expect(await screen.findByRole('header', { name: 'Account suspended' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Trip 42' })).not.toBeOnTheScreen();
  });

  it('says so, instead of offering a dead end, when the config has no support contacts yet', async () => {
    await signIn();
    backend.me = meWith('suspended');
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Account suspended' })).toBeOnTheScreen();
    expect(screen.getByText(/Support contacts will appear here soon\./)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Email/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Call/ })).not.toBeOnTheScreen();
  });

  it('refuses to build a link from a contact that is not an address or a number', async () => {
    await signIn();
    backend.me = meWith('suspended');
    backend.config = configWith({ support: { phone: 'call me maybe', email: 'not an email' } });
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Account suspended' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Email/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Call/ })).not.toBeOnTheScreen();
  });

  it('lets the person sign out of a blocked account and lands on sign-in', async () => {
    await signIn();
    backend.me = meWith('suspended');
    const user = userEvent.setup();
    renderRouter(routes, { initialUrl: '/' });

    await user.press(await screen.findByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('header', { name: 'Enter your phone number' })).toBeOnTheScreen();
    expect(requests.some((r) => r.method === 'POST' && r.path === '/auth/logout')).toBe(true);
    expect(appApi.client.session.isSignedIn).toBe(false);
  });

  it('speaks the language the person chose', async () => {
    await signIn();
    backend.me = meWith('suspended');
    await AsyncStorage.setItem('taxikosmos.ui.locale', 'ru');
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Аккаунт заблокирован' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeOnTheScreen();
  });

  it('notices a suspension that happened while the app was in the pocket, as soon as it comes back, over the open screen', async () => {
    await signIn();
    const handlers: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => {
      handlers.push(handler as (state: string) => void);

      return { remove: () => undefined };
    });
    renderRouter(routes, { initialUrl: '/trips/42' });
    expect(await screen.findByRole('header', { name: 'Trip 42' })).toBeOnTheScreen();

    backend.me = meWith('suspended');
    await act(async () => handlers.forEach((handler) => handler('active')));

    expect(await screen.findByRole('header', { name: 'Account suspended' })).toBeOnTheScreen();
    // The trip screen stays mounted underneath (the router keeps its place) but cannot be seen or used.
    expect(screen.queryByRole('header', { name: 'Trip 42' })).not.toBeOnTheScreen();
    cancelTrip.mockClear();
    await userEvent.setup().press(screen.getByLabelText('Cancel trip', { includeHiddenElements: true }));
    expect(cancelTrip).not.toHaveBeenCalled();
  });

  it('gives the app back, on the same screen, once the account is fine again', async () => {
    await signIn();
    const handlers: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => {
      handlers.push(handler as (state: string) => void);

      return { remove: () => undefined };
    });
    backend.me = meWith('suspended');
    const { getPathname } = renderRouter(routes, { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Account suspended' });

    backend.me = meWith('active');
    await act(async () => handlers.forEach((handler) => handler('active')));

    expect(await homeHeader()).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Account suspended' })).not.toBeOnTheScreen();
    expect(getPathname()).toBe('/');
  });
});

describe('a build that is too old', () => {
  it('shows the update screen with the store link and cannot be left, even by a signed-out visitor', async () => {
    backend.config = forcedUpdate('https://apps.apple.com/app/taxikosmos-driver');
    const user = userEvent.setup();
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Update required' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Enter your phone number' })).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Update the app' }));

    expect(Linking.openURL).toHaveBeenCalledWith('https://apps.apple.com/app/taxikosmos-driver');
  });

  it('stops a signed-in driver too, before their account is even looked at', async () => {
    await signIn();
    backend.config = forcedUpdate('https://apps.apple.com/app/taxikosmos-driver');
    backend.me = meWith('suspended');
    renderRouter(routes, { initialUrl: '/trips/42' });

    expect(await screen.findByRole('header', { name: 'Update required' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Account suspended' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Trip 42' })).not.toBeOnTheScreen();
  });

  it.each([
    ['there is none', null],
    ['it is not https', 'javascript:alert(1)'],
    ['it opens another app', 'itms-apps://apps.apple.com/app/x'],
    ['it is not an address', 'the app store'],
  ])('offers no button, only the instruction, when the store link is unusable because %s', async (_, link) => {
    backend.config = forcedUpdate(link);
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Update required' })).toBeOnTheScreen();
    expect(screen.getByText('Open the App Store or Google Play and update the app.')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('takes over an app that is open when the next start-up check says it is too old', async () => {
    await signIn();
    const handlers: ((state: string) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => {
      handlers.push(handler as (state: string) => void);

      return { remove: () => undefined };
    });
    renderRouter(routes, { initialUrl: '/' });
    await homeHeader();

    backend.config = forcedUpdate('https://apps.apple.com/app/taxikosmos-driver');
    await act(async () => handlers.forEach((handler) => handler('active')));

    expect(await screen.findByRole('header', { name: 'Update required' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'TaxiKosmos Driver (Dev)' })).not.toBeOnTheScreen();
  });

  it('does not stop a build the server says may run, even when a newer one exists', async () => {
    backend.config = configWith({ update: { force_update: false, update_available: true } });
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Enter your phone number' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Update required' })).not.toBeOnTheScreen();
  });
});

describe('when the server cannot be reached', () => {
  it('lets the app carry on if the start-up config cannot be fetched: an outage must not lock people out', async () => {
    backend.config = { status: 500, body: { message: 'boom' } };
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Enter your phone number' }, { timeout: 5000 })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Update required' })).not.toBeOnTheScreen();
    // It was asked twice (the client tries a failing start-up call once more) and then given up on.
    expect(requests.filter((r) => r.path === '/app-config')).toHaveLength(2);
  });

  it('says the account could not be loaded, with a retry, instead of guessing; retrying brings the app', async () => {
    await signIn();
    backend.me = { status: 429, body: { message: 'Too many requests' } };
    const user = userEvent.setup();
    renderRouter(routes, { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'TaxiKosmos Driver (Dev)' })).not.toBeOnTheScreen();

    backend.me = ok(fixtures.meDriver);
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await homeHeader()).toBeOnTheScreen();
  });

  it('lets the person sign out from the "could not load" screen', async () => {
    await signIn();
    backend.me = { status: 429, body: { message: 'Too many requests' } };
    const user = userEvent.setup();
    renderRouter(routes, { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Something went wrong' });

    await user.press(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('header', { name: 'Enter your phone number' })).toBeOnTheScreen();
  });

  it('shows the loading state while the account is on its way, and neither the app nor an error', async () => {
    await signIn();
    let releaseConfig: () => void = () => undefined;
    let releaseAccount: () => void = () => undefined;
    const configGate = new Promise<void>((resolve) => (releaseConfig = resolve));
    const accountGate = new Promise<void>((resolve) => (releaseAccount = resolve));
    backend.config = async () => {
      await configGate;

      return ok(fixtures.appConfigOk);
    };
    backend.me = async () => {
      await accountGate;

      return ok(fixtures.meDriver);
    };
    renderRouter(routes, { initialUrl: '/' });
    await waitFor(() => expect(requests.map((r) => r.path).sort()).toEqual(['/app-config', '/me']));
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeOnTheScreen();

    // The start-up config is answered; now only the account is outstanding.
    await act(async () => {
      releaseConfig();
      // Let the answer travel through the client and the query cache to the screen.
      await jest.advanceTimersByTimeAsync(100);
    });

    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'TaxiKosmos Driver (Dev)' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Something went wrong' })).not.toBeOnTheScreen();

    await act(async () => releaseAccount());

    expect(await homeHeader()).toBeOnTheScreen();
    expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
  });
});

describe('an error in a screen', () => {
  // React logs the errors it hands to the boundary; the tests expect them.
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));

  const state = { broken: true };

  function BrokenScreen() {
    if (state.broken) {
      throw new Error('trip screen exploded');
    }

    return <Text accessibilityRole="header">Trip recovered</Text>;
  }

  it('is caught deep in a screen, reported with the component stack, and recovered with "Try again" without restarting', async () => {
    await signIn();
    state.broken = true;
    const user = userEvent.setup();
    renderRouter({ ...routes, '(app)/broken': BrokenScreen }, { initialUrl: '/broken' });

    expect(await screen.findByRole('header', { name: 'Something went wrong' })).toBeOnTheScreen();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'trip screen exploded' }), {
      contexts: { react: { componentStack: expect.any(String) } },
    });

    state.broken = false;
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'Trip recovered' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Something went wrong' })).not.toBeOnTheScreen();
  });

  it('keeps the rest of the app usable: another screen opens after the broken one is left', async () => {
    await signIn();
    state.broken = true;
    renderRouter({ ...routes, '(app)/broken': BrokenScreen }, { initialUrl: '/broken' });
    await screen.findByRole('header', { name: 'Something went wrong' });

    state.broken = false;
    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalled());
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('header', { name: 'Trip recovered' })).toBeOnTheScreen();
  });
});

describe('a link that leads nowhere', () => {
  it("shows a plain page with a way back instead of the router's technical one", async () => {
    const user = userEvent.setup();
    const { getPathname } = renderRouter(routes, { initialUrl: '/nothing/here' });

    expect(await screen.findByRole('header', { name: 'Page not found' })).toBeOnTheScreen();
    expect(screen.queryByText(/Unmatched Route/i)).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Go to the start' }));

    expect(await screen.findByRole('header', { name: 'Enter your phone number' })).toBeOnTheScreen();
    expect(getPathname()).toBe('/sign-in');
  });
});
