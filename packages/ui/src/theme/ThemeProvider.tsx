import { colorScheme, useColorScheme } from 'nativewind';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { THEME_KEY, type PreferenceStore } from '../preferences';
import { themes } from './tokens.js';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeScheme = 'light' | 'dark';
export type ThemeColors = (typeof themes)['light'];

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value);
}

interface ThemeContextValue {
  /** What the person chose: follow the phone (`system`, the default) or force light or dark. */
  preference: ThemePreference;
  /** What is actually showing right now. */
  scheme: ThemeScheme;
  /** The template's colours for the scheme that is showing, for things drawn in JS (icons, placeholders, the status bar). */
  colors: ThemeColors;
  setPreference: (preference: ThemePreference) => void;
  /** Flips between light and dark (the template's sun/moon button); the choice is remembered. */
  toggleScheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  store: PreferenceStore;
  children: ReactNode;
}

export function ThemeProvider({ store, children }: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const { colorScheme: current } = useColorScheme();
  const scheme: ThemeScheme = current === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    let active = true;

    void store.get(THEME_KEY).then((saved) => {
      if (!active) {
        return;
      }

      const next = isThemePreference(saved) ? saved : 'system';
      colorScheme.set(next);
      setPreferenceState(next);
      setReady(true);
    });

    return () => {
      active = false;
    };
    // The saved choice is read once, when the provider mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      colorScheme.set(next);
      setPreferenceState(next);
      void store.set(THEME_KEY, next);
    },
    [store],
  );

  const toggleScheme = useCallback(() => setPreference(scheme === 'dark' ? 'light' : 'dark'), [scheme, setPreference]);

  const value = useMemo(
    () => ({ preference, scheme, colors: themes[scheme], setPreference, toggleScheme }),
    [preference, scheme, setPreference, toggleScheme],
  );

  // Nothing is drawn until the saved choice is known, or a dark-mode user would see a light flash on every launch.
  return ready ? <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider> : null;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);

  if (value === null) {
    throw new Error('useTheme must be used inside <UiProvider>.');
  }

  return value;
}
