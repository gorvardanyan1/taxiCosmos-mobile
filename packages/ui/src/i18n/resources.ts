import type { Locale } from '@taxikosmos/core';

import { en } from './locales/en';
import { hy } from './locales/hy';
import { ru } from './locales/ru';

export const LOCALES: readonly Locale[] = ['en', 'ru', 'hy'];
export const DEFAULT_LOCALE: Locale = 'en';

/** Each language in its own words, so a person who cannot read the current language can still find theirs. */
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = { en: 'English', ru: 'Русский', hy: 'Հայերեն' };

/** The namespace of the UI kit's own strings. The apps add theirs under another one (see `addTranslations`). */
export const UI_NAMESPACE = 'ui';

export const uiResources = { en, ru, hy };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
