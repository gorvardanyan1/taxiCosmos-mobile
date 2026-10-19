import { render, screen, waitFor } from '@testing-library/react-native';
import { colorScheme } from 'nativewind';
import type { ReactElement } from 'react';

import { createMemoryPreferences, LOCALE_KEY, THEME_KEY, type PreferenceStore } from '../preferences';
import { UiProvider } from '../UiProvider';

interface RenderUiOptions {
  /** What the person saved on an earlier launch. */
  saved?: { theme?: string; locale?: string };
  preferences?: PreferenceStore;
}

/** Renders under the real `<UiProvider>` (fonts, theme, language, toasts) and waits until it has drawn its children. */
export async function renderUi(element: ReactElement, options: RenderUiOptions = {}) {
  const saved: Record<string, string> = {};

  if (options.saved?.theme) {
    saved[THEME_KEY] = options.saved.theme;
  }

  if (options.saved?.locale) {
    saved[LOCALE_KEY] = options.saved.locale;
  }

  const preferences = options.preferences ?? createMemoryPreferences(saved);
  const view = render(<UiProvider preferences={preferences}>{element}</UiProvider>);

  await waitFor(() => expect(screen.toJSON()).not.toBeNull());

  return { ...view, preferences };
}

/** The theme is a global of the styling library: put it back between tests. */
export function resetTheme() {
  colorScheme.set('system');
}
