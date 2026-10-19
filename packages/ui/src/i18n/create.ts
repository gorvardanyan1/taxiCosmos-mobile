import type { Locale } from '@taxikosmos/core';
import { createInstance, type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LOCALE, LOCALES, UI_NAMESPACE, uiResources } from './resources';

/** A translator holding the UI kit's strings in all three languages. One per app, created at startup, so tests get a fresh one each. */
export function createI18n(locale: Locale = DEFAULT_LOCALE): I18n {
  const instance = createInstance();

  void instance.use(initReactI18next).init({
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    ns: [UI_NAMESPACE],
    defaultNS: UI_NAMESPACE,
    resources: Object.fromEntries(LOCALES.map((code) => [code, { [UI_NAMESPACE]: uiResources[code] }])),
    interpolation: { escapeValue: false },
    initAsync: false,
    returnNull: false,
  });

  return instance;
}

/** Registers the app's own strings next to the UI kit's: `addTranslations(i18n, 'app', { en: {...}, ru: {...}, hy: {...} })`. */
export function addTranslations(
  instance: I18n,
  namespace: string,
  bundles: Readonly<Record<Locale, Record<string, unknown>>>,
): void {
  for (const code of LOCALES) {
    instance.addResourceBundle(code, namespace, bundles[code], true, true);
  }
}
