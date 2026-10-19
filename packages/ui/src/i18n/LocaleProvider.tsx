import type { Locale } from '@taxikosmos/core';
import { getLocales } from 'expo-localization';
import type { i18n as I18n } from 'i18next';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import { LOCALE_KEY, type PreferenceStore } from '../preferences';
import { createI18n } from './create';
import { DEFAULT_LOCALE, isLocale } from './resources';

/** The phone's first language when the app has it, else English. */
export function detectDeviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;

  return isLocale(code) ? code : DEFAULT_LOCALE;
}

interface LocaleContextValue {
  locale: Locale;
  /** Switches every translated string at once and remembers the choice. */
  setLocale: (locale: Locale) => void;
  i18n: I18n;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LocaleProviderProps {
  store: PreferenceStore;
  /** The app's translator when it has added its own strings; the UI kit creates a plain one otherwise. */
  i18n?: I18n;
  children: ReactNode;
}

export function LocaleProvider({ store, i18n: provided, children }: LocaleProviderProps) {
  const [i18n] = useState(() => provided ?? createI18n(detectDeviceLocale()));
  const [locale, setLocaleState] = useState<Locale>(() => (isLocale(i18n.language) ? i18n.language : DEFAULT_LOCALE));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void store.get(LOCALE_KEY).then(async (saved) => {
      if (!active) {
        return;
      }

      if (isLocale(saved)) {
        await i18n.changeLanguage(saved);
        setLocaleState(saved);
      }

      setReady(true);
    });

    return () => {
      active = false;
    };
    // The saved language is read once, when the provider mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(
    (next: Locale) => {
      void i18n.changeLanguage(next);
      setLocaleState(next);
      void store.set(LOCALE_KEY, next);
    },
    [i18n, store],
  );

  const value = useMemo(() => ({ locale, setLocale, i18n }), [locale, setLocale, i18n]);

  return ready ? (
    <LocaleContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </LocaleContext.Provider>
  ) : null;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);

  if (value === null) {
    throw new Error('useLocale must be used inside <UiProvider>.');
  }

  return value;
}
