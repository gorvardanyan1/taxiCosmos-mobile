import { act, render, screen } from '@testing-library/react-native';
import { useFonts } from 'expo-font';

import { Text } from '../components/Text';
import { createMemoryPreferences } from '../preferences';
import { UiProvider } from '../UiProvider';

// Whether Manrope has loaded is the outside world here: the native font loader.
jest.mock('expo-font', () => ({ useFonts: jest.fn() }));

const fontsAre = (loaded: boolean, error: Error | null) => jest.mocked(useFonts).mockReturnValue([loaded, error]);

function renderApp() {
  return render(
    <UiProvider preferences={createMemoryPreferences()}>
      <Text>app content</Text>
    </UiProvider>,
  );
}

describe('UiProvider fonts', () => {
  it('draws nothing while Manrope is still loading, so there is no flash of the wrong font', async () => {
    fontsAre(false, null);
    renderApp();

    // Give the theme and language (which read their saved choices) time to be ready, so only the fonts can still be holding it back.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByText('app content')).not.toBeOnTheScreen();
  });

  it('draws the app once Manrope has loaded', async () => {
    fontsAre(true, null);
    renderApp();

    expect(await screen.findByText('app content')).toBeOnTheScreen();
  });

  it('still draws the app, in the system font, when Manrope fails to load, instead of staying blank forever', async () => {
    fontsAre(false, new Error('font download failed'));
    renderApp();

    expect(await screen.findByText('app content')).toBeOnTheScreen();
  });
});
