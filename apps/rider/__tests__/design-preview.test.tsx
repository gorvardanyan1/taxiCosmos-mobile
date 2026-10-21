import { userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

import { installBackend, signIn, signOut } from '../test-support/backend';

const mockEnvironment = jest.fn<'development' | 'production', []>();

jest.mock('../src/config', () => ({
  appConfig: {
    get environment() {
      return mockEnvironment();
    },
    apiUrl: 'http://10.0.2.2:8000',
    app: 'rider',
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'TaxiKosmos (Dev)', version: '0.1.0' } },
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
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

beforeEach(() => {
  mockEnvironment.mockReturnValue('development');
  installBackend();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await signOut();
});

describe('rider design preview', () => {
  it('opens from the sign-in screen in a development build and shows the UI kit', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });

    await user.press(await screen.findByRole('button', { name: 'Design system' }));

    expect(await screen.findByRole('header', { name: 'Buttons' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Phone number')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
  });

  it('also opens from the home screen of a signed-in rider', async () => {
    await signIn();
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });

    await user.press(await screen.findByRole('button', { name: 'Design system' }));

    expect(await screen.findByRole('header', { name: 'Buttons' })).toBeOnTheScreen();
  });

  it('is reachable by its address and follows the theme and language pickers', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/design-preview' });

    await user.press(await screen.findByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark', checked: true })).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Русский' }));
    expect(screen.getByRole('header', { name: 'Кнопки' })).toBeOnTheScreen();
  });

  it('does not exist in a production build: no way in from the sign-in or the home screen', async () => {
    mockEnvironment.mockReturnValue('production');
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Design system' })).not.toBeOnTheScreen();
  });

  it('has no way in from the home screen of a signed-in rider in a production build', async () => {
    mockEnvironment.mockReturnValue('production');
    await signIn();
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'TaxiKosmos (Dev)' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Design system' })).not.toBeOnTheScreen();
  });

  it('sends a production build that is opened on the preview address back to the start of the app', async () => {
    mockEnvironment.mockReturnValue('production');
    await signIn();
    const { getPathname } = renderRouter('./src/app', { initialUrl: '/design-preview' });

    expect(await screen.findByRole('header', { name: 'TaxiKosmos (Dev)' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Buttons' })).not.toBeOnTheScreen();
    expect(getPathname()).toBe('/');
  });
});
