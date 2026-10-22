import * as Sentry from '@sentry/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, userEvent, waitFor } from '@testing-library/react-native';
import * as fixtures from '@taxikosmos/core/fixtures';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Linking, Text } from 'react-native';

import AppGroupLayout from '../src/app/(app)/_layout';
import Home from '../src/app/(app)/index';
import AuthGroupLayout from '../src/app/(auth)/_layout';
import SignIn from '../src/app/(auth)/sign-in';
import RootLayout from '../src/app/_layout';
import { appApi } from '../src/api';
import {
  configWith,
  errorReply,
  installBackend,
  ok,
  sessionFor,
  signOut,
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
  jest.spyOn(Linking, 'openURL').mockClear().mockResolvedValue(undefined);
  jest.mocked(Sentry.captureException).mockClear();
});

afterEach(async () => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  await AsyncStorage.clear();
  await signOut();
});

// The test numbers the backend accepts a fixed code for (`OTP_TEST_PHONES`).
const NATIONAL = '091770001';
const PHONE = '+37491770001';
const CODE = '123456';
const WRONG = '654321';

const calls = (path: string) => requests.filter((request) => request.path === path);
const phoneField = (label = 'Phone number') => screen.getByLabelText(label);
const codeField = (label = 'Verification code') => screen.getByLabelText(label);
const homeHeader = () => screen.findByRole('header', { name: 'TaxiKosmos Driver (Dev)' });

type User = ReturnType<typeof userEvent.setup>;

async function askForCode(user: User) {
  await user.type(await screen.findByLabelText('Phone number'), NATIONAL);
  await user.press(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByRole('header', { name: 'Enter the code' });
}

/** The code arrives whole, the way the phone's SMS auto-fill or a paste delivers it (typing it digit by digit would race the screen leaving). */
async function enterCode(code: string, label?: string) {
  await act(async () => fireEvent.changeText(codeField(label), code));
}

const withLegal = configWith({
  legal: {
    terms: {
      en: 'https://taxikosmos.test/terms',
      ru: 'https://taxikosmos.test/ru/terms',
      hy: 'https://taxikosmos.test/hy/terms',
    },
    privacy: {
      en: 'https://taxikosmos.test/privacy',
      ru: 'https://taxikosmos.test/ru/privacy',
      hy: 'https://taxikosmos.test/hy/privacy',
    },
  },
});

describe('the phone number step', () => {
  it('asks for a number, and offers no way to send until it is a complete valid one', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Enter your phone number' });

    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();

    await user.type(phoneField(), '0917');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeDisabled();

    await user.clear(phoneField());
    await user.type(phoneField(), NATIONAL);
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();
  });

  it('sends the E.164 number with the app name, then asks for the code', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });

    await askForCode(user);

    expect(calls('/auth/otp/request')).toHaveLength(1);
    expect(calls('/auth/otp/request')[0]).toMatchObject({ method: 'POST', body: { phone: PHONE, app: 'driver' } });
    expect(calls('/auth/otp/request')[0]?.authorization).toBeNull();
    expect(screen.getByText('We sent a 6-digit code to +374 91 770001.')).toBeOnTheScreen();
  });

  it('sends one request when the button is pressed twice', async () => {
    const user = userEvent.setup();
    let answer: (() => void) | undefined;
    backend.otpRequest = () => new Promise((resolve) => (answer = () => resolve(ok(fixtures.authOtpRequested))));
    renderRouter('./src/app', { initialUrl: '/' });
    await user.type(await screen.findByLabelText('Phone number'), NATIONAL);

    await user.press(screen.getByRole('button', { name: 'Send code' }));
    await user.press(screen.getByRole('button', { name: 'Send code' }));
    await act(async () => answer?.());

    expect(calls('/auth/otp/request')).toHaveLength(1);
  });

  it("sends one request when the keyboard's done key is pressed twice in the same instant", async () => {
    const user = userEvent.setup();
    let answer: (() => void) | undefined;
    backend.otpRequest = () => new Promise((resolve) => (answer = () => resolve(ok(fixtures.authOtpRequested))));
    renderRouter('./src/app', { initialUrl: '/' });
    await user.type(await screen.findByLabelText('Phone number'), NATIONAL);

    await act(async () => {
      fireEvent(phoneField(), 'submitEditing');
      fireEvent(phoneField(), 'submitEditing');
    });
    await act(async () => answer?.());

    expect(calls('/auth/otp/request')).toHaveLength(1);
  });

  it('takes the number back when the person changes it, ready to edit', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    await user.press(screen.getByRole('button', { name: 'Change number' }));

    expect(await screen.findByRole('header', { name: 'Enter your phone number' })).toBeOnTheScreen();
    expect(phoneField().props.value).toBe('091 770001');
  });

  it("shows the server's complaint about the number next to the field and lets the person fix it", async () => {
    const user = userEvent.setup();
    backend.otpRequest = {
      status: 422,
      body: {
        message: 'The phone field must be a valid phone number.',
        errors: { phone: ['This number cannot be used.'] },
      },
    };
    renderRouter('./src/app', { initialUrl: '/' });
    await user.type(await screen.findByLabelText('Phone number'), NATIONAL);

    await user.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText('This number cannot be used.')).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Enter the code' })).not.toBeOnTheScreen();

    await user.type(phoneField(), '9');
    expect(screen.queryByText('This number cannot be used.')).not.toBeOnTheScreen();
  });

  it.each([
    ['there is no connection', 'network-error' as const, 'No connection. Check your internet and try again.'],
    ['the server fails', { status: 503, body: { message: 'Server Error' } }, 'We could not send the code. Try again.'],
  ])('says so when %s, and the person can try again', async (_, reply, message) => {
    const user = userEvent.setup();
    backend.otpRequest = reply;
    renderRouter('./src/app', { initialUrl: '/' });
    await user.type(await screen.findByLabelText('Phone number'), NATIONAL);

    await user.press(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();

    backend.otpRequest = ok(fixtures.authOtpRequested);
    await user.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByRole('header', { name: 'Enter the code' })).toBeOnTheScreen();
    expect(screen.queryByText(message)).not.toBeOnTheScreen();
  });

  it('shows how long to wait after a 429 and keeps that number blocked until then, but not another number', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.otpRequest = errorReply(fixtures.errorRateLimited);
    renderRouter('./src/app', { initialUrl: '/' });
    await user.type(await screen.findByLabelText('Phone number'), NATIONAL);

    await user.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText('Too many tries. Try again in 60 s.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send a new code in 60 s' })).toBeDisabled();

    act(() => jest.advanceTimersByTime(30_000));
    expect(screen.getByRole('button', { name: 'Send a new code in 30 s' })).toBeDisabled();

    // Another number is not held back by the first one's limit.
    await user.clear(phoneField());
    await user.type(phoneField(), '091770002');
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();

    // Back to the first one: still waiting, then free.
    await user.clear(phoneField());
    await user.type(phoneField(), NATIONAL);
    expect(screen.getByRole('button', { name: 'Send a new code in 30 s' })).toBeDisabled();
    act(() => jest.advanceTimersByTime(30_000));
    expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled();
    expect(calls('/auth/otp/request')).toHaveLength(1);
  });

  it('says to try later when a 429 does not say how long', async () => {
    const user = userEvent.setup();
    backend.otpRequest = { status: 429, body: { message: 'Too Many Attempts.' } };
    renderRouter('./src/app', { initialUrl: '/' });
    await user.type(await screen.findByLabelText('Phone number'), NATIONAL);

    await user.press(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText('Too many tries. Try again in a little while.')).toBeOnTheScreen();
  });
});

describe('consent links', () => {
  it("opens the terms and privacy pages of the person's language from the app config", async () => {
    const user = userEvent.setup();
    backend.config = withLegal;
    renderRouter('./src/app', { initialUrl: '/' });

    await user.press(await screen.findByRole('button', { name: 'Terms of Service' }));
    await user.press(screen.getByRole('button', { name: 'Privacy Policy' }));

    expect(screen.getByText('By continuing you agree to our')).toBeOnTheScreen();
    expect(Linking.openURL).toHaveBeenNthCalledWith(1, 'https://taxikosmos.test/terms');
    expect(Linking.openURL).toHaveBeenNthCalledWith(2, 'https://taxikosmos.test/privacy');
  });

  it.each([
    ['not given for the language', configWith({}), []],
    [
      'not https',
      configWith({
        legal: {
          terms: { en: 'http://taxikosmos.test/terms', ru: null, hy: null },
          privacy: { en: 'javascript:alert(1)', ru: null, hy: null },
        },
      }),
      [],
    ],
    [
      'given for one page only',
      configWith({
        legal: {
          terms: { en: null, ru: null, hy: null },
          privacy: { en: 'https://taxikosmos.test/privacy', ru: null, hy: null },
        },
      }),
      ['Privacy Policy'],
    ],
  ])('leaves out a link that is %s', async (_, config, shown) => {
    backend.config = config;
    renderRouter('./src/app', { initialUrl: '/' });
    await screen.findByRole('header', { name: 'Enter your phone number' });

    for (const label of ['Terms of Service', 'Privacy Policy']) {
      expect(screen.queryByRole('button', { name: label }) !== null).toBe(shown.includes(label));
    }
    expect(screen.queryByText('By continuing you agree to our') !== null).toBe(shown.length > 0);
  });
});

describe('languages', () => {
  it.each([
    [
      'ru',
      'Введите номер телефона',
      'Номер телефона',
      'Код подтверждения',
      'Отправить код',
      'Условия использования',
      'Политику конфиденциальности',
      'Введите код',
    ],
    [
      'hy',
      'Մուտքագրեք հեռախոսահամարը',
      'Հեռախոսահամար',
      'Հաստատման կոդ',
      'Ուղարկել կոդը',
      'Օգտագործման պայմանները',
      'Գաղտնիության քաղաքականությունը',
      'Մուտքագրեք կոդը',
    ],
  ])(
    "follows the person's language (%s): the texts, the legal links, and the language sent with the code",
    async (locale, title, phoneLabel, codeLabel, send, terms, privacy, codeTitle) => {
      const user = userEvent.setup();
      await AsyncStorage.setItem('taxikosmos.ui.locale', locale);
      backend.config = withLegal;
      backend.otpVerify = sessionFor('Anna');
      renderRouter('./src/app', { initialUrl: '/' });
      await screen.findByRole('header', { name: title });

      await user.press(screen.getByRole('button', { name: terms }));
      await user.press(screen.getByRole('button', { name: privacy }));
      expect(Linking.openURL).toHaveBeenNthCalledWith(1, `https://taxikosmos.test/${locale}/terms`);
      expect(Linking.openURL).toHaveBeenNthCalledWith(2, `https://taxikosmos.test/${locale}/privacy`);

      await user.type(phoneField(phoneLabel), NATIONAL);
      await user.press(screen.getByRole('button', { name: send }));
      await screen.findByRole('header', { name: codeTitle });
      await enterCode(CODE, codeLabel);

      await waitFor(() => expect(calls('/auth/otp/verify')).toHaveLength(1));
      expect(calls('/auth/otp/verify')[0]?.body).toMatchObject({ locale });
    },
  );
});

describe('the code step', () => {
  it('signs in with the right code: sends the number, code, app, install id and language, and opens the app', async () => {
    const user = userEvent.setup();
    backend.otpVerify = sessionFor('Anna');
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    await enterCode(CODE);

    expect(await homeHeader()).toBeOnTheScreen();
    const [verify] = calls('/auth/otp/verify');
    expect(verify).toMatchObject({ method: 'POST', body: { phone: PHONE, code: CODE, app: 'driver', locale: 'en' } });
    expect(typeof verify?.body?.device_id).toBe('string');
    expect(verify?.body?.device_id).toBe(await appApi.getDeviceId());
    expect(calls('/auth/otp/verify')).toHaveLength(1);
    expect(screen.queryByRole('header', { name: 'What should we call you?' })).not.toBeOnTheScreen();
    expect(await appApi.client.session.accessToken()).toBe('1|fixture-access-token');
  });

  it('goes on to the screen the person was heading to', async () => {
    const user = userEvent.setup();
    backend.otpVerify = sessionFor('Anna');
    const Trip = () => <Text accessibilityRole="header">Trip 42</Text>;
    const routes = {
      _layout: RootLayout,
      '(app)/_layout': AppGroupLayout,
      '(app)/index': Home,
      '(app)/trips/[id]': Trip,
      '(auth)/_layout': AuthGroupLayout,
      '(auth)/sign-in': SignIn,
    };
    const { getPathname } = renderRouter(routes, { initialUrl: '/trips/42' });
    await askForCode(user);

    await enterCode(CODE);

    expect(await screen.findByRole('header', { name: 'Trip 42' })).toBeOnTheScreen();
    expect(getPathname()).toBe('/trips/42');
  });

  it('keeps the person signed in when the app is opened again', async () => {
    const user = userEvent.setup();
    backend.otpVerify = sessionFor('Anna');
    const first = renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);
    await enterCode(CODE);
    await homeHeader();
    first.unmount();
    const before = calls('/auth/otp/request').length;

    renderRouter('./src/app', { initialUrl: '/' });

    expect(await homeHeader()).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Enter your phone number' })).not.toBeOnTheScreen();
    expect(calls('/auth/otp/request')).toHaveLength(before);
  });

  it('sends the code once when it is completed twice in the same instant (a paste and an auto-fill)', async () => {
    const user = userEvent.setup();
    backend.otpVerify = errorReply(fixtures.errorInvalidCode);
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    await act(async () => {
      fireEvent.changeText(codeField(), CODE);
      fireEvent.changeText(codeField(), '');
      fireEvent.changeText(codeField(), CODE);
    });
    await screen.findByText(/not right/);

    expect(calls('/auth/otp/verify')).toHaveLength(1);
  });

  it('does not send the code twice when it is completed again while the first is being checked', async () => {
    const user = userEvent.setup();
    let answer: (() => void) | undefined;
    backend.otpVerify = () => new Promise((resolve) => (answer = () => resolve(sessionFor('Anna'))));
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    await enterCode(CODE);
    expect(await screen.findByText('Checking the code')).toBeOnTheScreen();
    expect(codeField().props.editable).toBe(false);
    await act(async () => answer?.());

    expect(calls('/auth/otp/verify')).toHaveLength(1);
  });

  it('says a wrong code is wrong, clears it for another try, and warns before the last one', async () => {
    const user = userEvent.setup();
    backend.otpVerify = errorReply(fixtures.errorInvalidCode);
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    for (let attempt = 1; attempt <= 3; attempt++) {
      await enterCode(WRONG);
      expect(await screen.findByText('That code is not right. Check it and try again.')).toBeOnTheScreen();
      expect(codeField().props.value).toBe('');
      expect(codeField().props.editable).toBe(true);
    }

    await enterCode(WRONG);

    expect(await screen.findByText('That code is not right. One try left.')).toBeOnTheScreen();
    expect(calls('/auth/otp/verify')).toHaveLength(4);
  });

  it('locks after the fifth wrong code: no more guesses are sent and a new code is the way on', async () => {
    const user = userEvent.setup();
    backend.otpVerify = errorReply(fixtures.errorInvalidCode);
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    for (let attempt = 1; attempt <= 4; attempt++) {
      await enterCode(WRONG);
      await screen.findByText(attempt === 4 ? 'That code is not right. One try left.' : /not right/);
    }
    await enterCode(WRONG);

    expect(await screen.findByText('Too many wrong codes. Send a new one.')).toBeOnTheScreen();
    expect(codeField().props.editable).toBe(false);
    expect(calls('/auth/otp/verify')).toHaveLength(5);
  });

  it('counts wrong codes from zero again after a new code is sent', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    backend.otpVerify = errorReply(fixtures.errorInvalidCode);
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await enterCode(WRONG);
      await screen.findByText(/not right|Too many wrong/);
    }
    act(() => jest.advanceTimersByTime(60_000));

    await user.press(screen.getByRole('button', { name: 'Send a new code' }));

    expect(await screen.findByText('A new code is on its way.')).toBeOnTheScreen();
    expect(codeField().props.editable).toBe(true);
    expect(screen.queryByText('Too many wrong codes. Send a new one.')).not.toBeOnTheScreen();
    expect(calls('/auth/otp/request')).toHaveLength(2);
    expect(calls('/auth/otp/request')[1]?.body).toEqual({ phone: PHONE, app: 'driver' });

    await enterCode(WRONG);
    expect(await screen.findByText('That code is not right. Check it and try again.')).toBeOnTheScreen();
  });

  it('says the code expired once its five minutes are up, sends nothing, and a new code works again', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    act(() => jest.advanceTimersByTime(299_000));
    expect(screen.queryByText('This code has expired. Send a new one.')).not.toBeOnTheScreen();
    expect(codeField().props.editable).toBe(true);

    act(() => jest.advanceTimersByTime(1_000));

    expect(screen.getByText('This code has expired. Send a new one.')).toBeOnTheScreen();
    expect(codeField().props.editable).toBe(false);
    expect(calls('/auth/otp/verify')).toHaveLength(0);

    await user.press(screen.getByRole('button', { name: 'Send a new code' }));

    expect(await screen.findByText('A new code is on its way.')).toBeOnTheScreen();
    expect(screen.queryByText('This code has expired. Send a new one.')).not.toBeOnTheScreen();
    expect(codeField().props.editable).toBe(true);
  });

  it('counts the resend wait down from a minute, and offers a new code only after it', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    expect(screen.getByRole('button', { name: 'Send a new code in 60 s' })).toBeDisabled();
    act(() => jest.advanceTimersByTime(45_000));
    expect(screen.getByRole('button', { name: 'Send a new code in 15 s' })).toBeDisabled();
    act(() => jest.advanceTimersByTime(15_000));

    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();

    await user.press(screen.getByRole('button', { name: 'Send a new code' }));
    expect(await screen.findByRole('button', { name: 'Send a new code in 60 s' })).toBeDisabled();
    expect(calls('/auth/otp/request')).toHaveLength(2);
  });

  it('follows a 429 on resend: the wait the server asks for', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);
    act(() => jest.advanceTimersByTime(60_000));
    backend.otpRequest = {
      status: 429,
      headers: { 'retry-after': '1800' },
      body: { message: 'Too Many Attempts.' },
    };

    await user.press(screen.getByRole('button', { name: 'Send a new code' }));

    expect(await screen.findByText('Too many tries. Try again in 1800 s.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Send a new code in 1800 s' })).toBeDisabled();
  });

  it('shows a 429 on checking the code with the wait, and does not count it as a wrong code', async () => {
    const user = userEvent.setup();
    backend.otpVerify = errorReply(fixtures.errorRateLimited);
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    for (let attempt = 1; attempt <= 6; attempt++) {
      await enterCode(WRONG);
      expect(await screen.findByText('Too many tries. Wait 60 s and try again.')).toBeOnTheScreen();
      expect(codeField().props.editable).toBe(true);
    }

    expect(calls('/auth/otp/verify')).toHaveLength(6);
  });

  it.each([
    [
      'there is no connection',
      'network-error' as const,
      'No connection. Check your internet and enter the code again.',
    ],
    ['the server fails', { status: 500, body: { message: 'Server Error' } }, 'We could not check the code. Try again.'],
    [
      'the number may not use this app',
      { status: 403, body: { message: 'Forbidden', code: 'admin_account' } },
      'This number cannot sign in to this app.',
    ],
  ])('says so when %s, keeps the code usable, and signs in on the next try', async (_, reply, message) => {
    const user = userEvent.setup();
    backend.otpVerify = reply;
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    await enterCode(CODE);
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(codeField().props.editable).toBe(true);

    backend.otpVerify = sessionFor('Anna');
    await enterCode(CODE);

    expect(await homeHeader()).toBeOnTheScreen();
  });

  it('does not send the code it was given to Sentry or anywhere but the verify call', async () => {
    const user = userEvent.setup();
    backend.otpVerify = errorReply(fixtures.errorInvalidCode);
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    await enterCode(WRONG);
    await screen.findByText(/not right/);

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(requests.filter((request) => JSON.stringify(request).includes(WRONG))).toHaveLength(1);
  });
});

describe('a driver is never asked for a name', () => {
  it('opens the app straight after the code, even when the account has no name yet (it comes from the driver application)', async () => {
    const user = userEvent.setup();
    backend.otpVerify = sessionFor(null);
    renderRouter('./src/app', { initialUrl: '/' });
    await askForCode(user);

    await enterCode(CODE);

    expect(await homeHeader()).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'What should we call you?' })).not.toBeOnTheScreen();
    expect(calls('/me').filter((request) => request.method === 'PATCH')).toHaveLength(0);
  });
});
