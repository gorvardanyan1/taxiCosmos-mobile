import { userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';

const mockEnvironment = jest.fn<'development' | 'production', []>();

jest.mock('../src/config', () => ({
  appConfig: {
    get environment() {
      return mockEnvironment();
    },
    apiUrl: 'http://10.0.2.2:8000',
  },
}));

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { name: 'TaxiKosmos Driver (Dev)' } } }));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  wrap: (component: unknown) => component,
}));

beforeEach(() => mockEnvironment.mockReturnValue('development'));

describe('driver design preview', () => {
  it('opens from the home screen in a development build and shows the UI kit', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/' });

    await user.press(await screen.findByRole('button', { name: 'Design system' }));

    expect(await screen.findByRole('header', { name: 'Buttons' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Phone number')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
  });

  it('is reachable by its address and follows the theme and language pickers', async () => {
    const user = userEvent.setup();
    renderRouter('./src/app', { initialUrl: '/design-preview' });

    await user.press(await screen.findByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark', checked: true })).toBeOnTheScreen();

    await user.press(screen.getByRole('radio', { name: 'Русский' }));
    expect(screen.getByRole('header', { name: 'Кнопки' })).toBeOnTheScreen();
  });

  it('does not exist in a production build: no way in from home, and its address goes back home', async () => {
    mockEnvironment.mockReturnValue('production');
    renderRouter('./src/app', { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'TaxiKosmos Driver (Dev)' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Design system' })).not.toBeOnTheScreen();
  });

  it('sends a production build that is opened on the preview address back to the home screen', async () => {
    mockEnvironment.mockReturnValue('production');
    const { getPathname } = renderRouter('./src/app', { initialUrl: '/design-preview' });

    expect(await screen.findByRole('header', { name: 'TaxiKosmos Driver (Dev)' })).toBeOnTheScreen();
    expect(screen.queryByRole('header', { name: 'Buttons' })).not.toBeOnTheScreen();
    expect(getPathname()).toBe('/');
  });
});
