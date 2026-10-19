import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Appearance } from 'react-native';

import { asyncStoragePreferences, createMemoryPreferences, useLocale, useTheme } from '../index';
import { ThemeToggleButton } from '../components/ScreenHeader';
import { Text } from '../components/Text';
import { LOCALE_KEY, THEME_KEY } from '../preferences';
import { ThemeProvider } from '../theme/ThemeProvider';
import { renderUi, resetTheme } from './helpers';

function Probe() {
  const { preference, scheme, colors, setPreference } = useTheme();

  return (
    <>
      <Text>{`preference:${preference}`}</Text>
      <Text>{`scheme:${scheme}`}</Text>
      <Text>{`background:${colors.background}`}</Text>
      <Text accessibilityRole="button" onPress={() => setPreference('system')}>
        follow system
      </Text>
      <ThemeToggleButton />
    </>
  );
}

function Both() {
  const { scheme } = useTheme();
  const { locale, setLocale } = useLocale();

  return (
    <>
      <Text>{`scheme:${scheme}`}</Text>
      <Text>{`locale:${locale}`}</Text>
      <Text accessibilityRole="button" onPress={() => setLocale('ru')}>
        to Russian
      </Text>
      <ThemeToggleButton />
    </>
  );
}

afterEach(() => {
  resetTheme();
  jest.restoreAllMocks();
});

describe('theme', () => {
  it('follows the phone by default (light here) and uses the template paper colour', async () => {
    await renderUi(<Probe />);

    expect(screen.getByText('preference:system')).toBeOnTheScreen();
    expect(screen.getByText('scheme:light')).toBeOnTheScreen();
    expect(screen.getByText('background:#F5F6F2')).toBeOnTheScreen();
  });

  it('switches to dark and back with the sun/moon button, naming the action it will take', async () => {
    const user = userEvent.setup();
    await renderUi(<Probe />);

    await user.press(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(screen.getByText('scheme:dark')).toBeOnTheScreen();
    expect(screen.getByText('preference:dark')).toBeOnTheScreen();
    expect(screen.getByText('background:#020617')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Switch to light mode' }));

    expect(screen.getByText('scheme:light')).toBeOnTheScreen();
  });

  it('remembers a manual choice: it is saved, and a fresh launch with the same storage opens dark', async () => {
    const user = userEvent.setup();
    const preferences = createMemoryPreferences();
    const first = await renderUi(<Probe />, { preferences });

    await user.press(screen.getByRole('button', { name: 'Switch to dark mode' }));
    await waitFor(async () => expect(await preferences.get(THEME_KEY)).toBe('dark'));

    first.unmount();
    resetTheme();
    await renderUi(<Probe />, { preferences });

    expect(screen.getByText('preference:dark')).toBeOnTheScreen();
    expect(screen.getByText('scheme:dark')).toBeOnTheScreen();
  });

  it('applies the saved choice before the first frame, so there is no light flash for a dark-mode user', async () => {
    await renderUi(<Probe />, { saved: { theme: 'dark' } });

    expect(screen.getByText('scheme:dark')).toBeOnTheScreen();
  });

  it('never draws a frame in the wrong theme: with a saved dark choice, no child renders light first', async () => {
    const seen: string[] = [];

    function Recorder() {
      const { scheme } = useTheme();
      seen.push(scheme);

      return <Text>recorded</Text>;
    }

    // The provider on its own: the language gate above it in `UiProvider` would otherwise hide a missing theme gate.
    render(
      <ThemeProvider store={createMemoryPreferences({ [THEME_KEY]: 'dark' })}>
        <Recorder />
      </ThemeProvider>,
    );
    await screen.findByText('recorded');

    expect(seen.length).toBeGreaterThan(0);
    expect(seen).not.toContain('light');
  });

  it('keeps the theme and the language apart: both are saved and both come back on the next launch', async () => {
    const user = userEvent.setup();
    const preferences = createMemoryPreferences();
    const first = await renderUi(<Both />, { preferences });

    await user.press(screen.getByRole('button', { name: 'Switch to dark mode' }));
    await user.press(screen.getByRole('button', { name: 'to Russian' }));
    await waitFor(async () => expect(await preferences.get(LOCALE_KEY)).toBe('ru'));

    expect(THEME_KEY).not.toBe(LOCALE_KEY);
    expect(await preferences.get(THEME_KEY)).toBe('dark');

    first.unmount();
    resetTheme();
    await renderUi(<Both />, { preferences });

    expect(screen.getByText('scheme:dark')).toBeOnTheScreen();
    expect(screen.getByText('locale:ru')).toBeOnTheScreen();
  });

  it('ignores a saved value it does not know', async () => {
    await renderUi(<Probe />, { saved: { theme: 'purple' } });

    expect(screen.getByText('preference:system')).toBeOnTheScreen();
    expect(screen.getByText('scheme:light')).toBeOnTheScreen();
  });

  it('hands the choice to the operating system: dark and light are forced, "system" releases the override', async () => {
    const user = userEvent.setup();
    const setScheme = jest.spyOn(Appearance, 'setColorScheme');
    await renderUi(<Probe />, { saved: { theme: 'light' } });
    expect(setScheme).toHaveBeenLastCalledWith('light');

    await user.press(screen.getByRole('button', { name: 'Switch to dark mode' }));
    expect(setScheme).toHaveBeenLastCalledWith('dark');

    await user.press(screen.getByRole('button', { name: 'follow system' }));
    // React Native 0.86 releases the override with 'unspecified' (older versions used null).
    expect([null, 'unspecified']).toContain(setScheme.mock.lastCall?.[0]);
  });

  it('still works when the storage is broken: defaults apply and the choice lasts for the session', async () => {
    const user = userEvent.setup();
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('storage unavailable'));
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('storage unavailable'));
    await renderUi(<Probe />, { preferences: asyncStoragePreferences });

    expect(screen.getByText('preference:system')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(screen.getByText('scheme:dark')).toBeOnTheScreen();
  });
});
