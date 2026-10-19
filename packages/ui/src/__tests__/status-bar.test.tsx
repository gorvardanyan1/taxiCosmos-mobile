import { screen, userEvent } from '@testing-library/react-native';
import { StatusBar } from 'expo-status-bar';

import { ThemeToggleButton } from '../components/ScreenHeader';
import { renderUi, resetTheme } from './helpers';

// The native status bar is the outside world: record the style the app asks for.
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));

const lastStyle = () => jest.mocked(StatusBar).mock.lastCall?.[0]?.style;

afterEach(resetTheme);

describe('status bar', () => {
  it('has dark icons on the light page and light icons on the dark page', async () => {
    await renderUi(<ThemeToggleButton />);
    expect(lastStyle()).toBe('dark');

    await renderUi(<ThemeToggleButton />, { saved: { theme: 'dark' } });
    expect(lastStyle()).toBe('light');
  });

  it('follows the app theme when the person flips it by hand, in both directions, not the phone', async () => {
    const user = userEvent.setup();
    await renderUi(<ThemeToggleButton />);

    await user.press(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(lastStyle()).toBe('light');

    await user.press(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(lastStyle()).toBe('dark');
  });
});
