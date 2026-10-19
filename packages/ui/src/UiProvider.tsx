import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { useFonts } from 'expo-font';
import type { i18n as I18n } from 'i18next';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastProvider } from './components/Toast';
import { LocaleProvider } from './i18n/LocaleProvider';
import { asyncStoragePreferences, type PreferenceStore } from './preferences';
import { ThemeProvider, useTheme } from './theme/ThemeProvider';
import { fontFamily } from './theme/tokens.js';

export interface UiProviderProps {
  children: ReactNode;
  /** The app's translator when it has added its own strings (`addTranslations`); the UI kit makes a plain one otherwise. */
  i18n?: I18n;
  /** Where theme and language are remembered. Tests pass an in-memory one. */
  preferences?: PreferenceStore;
  /** Fires once the fonts are loaded and the saved theme and language are applied: the moment to hide the splash screen. */
  onReady?: () => void;
}

/**
 * Wrap the whole app in this, once, at the root layout: it loads Manrope, restores the saved theme and language, and provides safe areas and
 * toasts. Nothing is drawn until all of that is ready, so there is no flash of the wrong theme or font.
 */
export function UiProvider({ children, i18n, preferences = asyncStoragePreferences, onReady }: UiProviderProps) {
  const [fontsLoaded, fontError] = useFonts({
    [fontFamily.regular]: Manrope_400Regular,
    [fontFamily.medium]: Manrope_500Medium,
    [fontFamily.semibold]: Manrope_600SemiBold,
    [fontFamily.bold]: Manrope_700Bold,
    [fontFamily.extrabold]: Manrope_800ExtraBold,
  });

  // A font that fails to load is not worth a blank app: the system font is used instead.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider store={preferences}>
        <LocaleProvider store={preferences} i18n={i18n}>
          <ToastProvider>
            <ThemedStatusBar />
            <Ready onReady={onReady} />
            {children}
          </ToastProvider>
        </LocaleProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** The status bar follows the app's theme, not the phone's, so a manual dark mode does not leave dark icons on a dark screen. */
function ThemedStatusBar() {
  const { colors } = useTheme();

  return <StatusBar style={colors.statusBar === 'dark' ? 'dark' : 'light'} />;
}

function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
    // Once, when everything above has rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
