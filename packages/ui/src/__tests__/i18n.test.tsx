import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { getLocales, type Locale } from 'expo-localization';

import { ErrorState } from '../components/ErrorState';
import { Text } from '../components/Text';
import {
  addTranslations,
  createI18n,
  createMemoryPreferences,
  useFormat,
  useLocale,
  useUiTranslation,
  type PreferenceStore,
} from '../index';
import { en } from '../i18n/locales/en';
import { hy } from '../i18n/locales/hy';
import { ru } from '../i18n/locales/ru';
import { LOCALE_KEY } from '../preferences';
import { UiProvider } from '../UiProvider';
import { renderUi, resetTheme } from './helpers';

// The phone's language is the outside world: a test sets it, and every test starts from an English phone.
jest.mock('expo-localization', () => ({ getLocales: jest.fn() }));
const phoneSpeaks = (...codes: (string | null)[]) =>
  jest
    .mocked(getLocales)
    .mockReturnValue(codes.map((languageCode) => ({ languageCode }) as Locale) as ReturnType<typeof getLocales>);

beforeEach(() => phoneSpeaks('en'));
afterEach(resetTheme);

type Tree = { [key: string]: string | Tree };

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

/** `{ a: { b_one: 'x', b_other: 'y' } }` → Map('a.b' → { forms: {'one','other'}, placeholders: {...} }) */
function describeKeys(
  tree: Tree,
  prefix = '',
  into = new Map<string, { forms: Set<string>; placeholders: Set<string> }>(),
) {
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'object') {
      describeKeys(value, `${prefix}${key}.`, into);
      continue;
    }

    const plural = PLURAL_SUFFIX.exec(key);
    const base = `${prefix}${plural ? key.replace(PLURAL_SUFFIX, '') : key}`;
    const entry = into.get(base) ?? { forms: new Set<string>(), placeholders: new Set<string>() };

    if (plural?.[1]) {
      entry.forms.add(plural[1]);
    }

    for (const match of value.matchAll(/{{\s*(\w+)\s*}}/g)) {
      if (match[1]) {
        entry.placeholders.add(match[1]);
      }
    }

    into.set(base, entry);
  }

  return into;
}

describe('translation files', () => {
  const described = { en: describeKeys(en), ru: describeKeys(ru), hy: describeKeys(hy) };

  it('hold exactly the same keys in English, Russian and Armenian', () => {
    const keys = [...described.en.keys()].sort();

    expect([...described.ru.keys()].sort()).toEqual(keys);
    expect([...described.hy.keys()].sort()).toEqual(keys);
  });

  it('use the same {{placeholders}} in every language, so nothing prints a literal {{name}}', () => {
    for (const [key, entry] of described.en) {
      for (const locale of ['ru', 'hy'] as const) {
        expect([...(described[locale].get(key)?.placeholders ?? [])].sort()).toEqual([...entry.placeholders].sort());
      }
    }
  });

  it.each(['en', 'ru', 'hy'] as const)('have every plural form %s needs, and only those', (locale) => {
    const needed = new Intl.PluralRules(locale).resolvedOptions().pluralCategories.sort();

    for (const [key, entry] of described[locale]) {
      if (entry.forms.size > 0) {
        expect([key, [...entry.forms].sort()]).toEqual([key, needed]);
      }
    }
  });

  it('contain no empty strings', () => {
    const empty = (tree: Tree): boolean =>
      Object.values(tree).some((value) => (typeof value === 'string' ? value.trim() === '' : empty(value)));

    expect([empty(en), empty(ru), empty(hy)]).toEqual([false, false, false]);
  });
});

function Probe() {
  const { locale, setLocale } = useLocale();

  return (
    <>
      <Text>{`locale:${locale}`}</Text>
      <Text accessibilityRole="button" onPress={() => setLocale('ru')}>
        to Russian
      </Text>
      <Text accessibilityRole="button" onPress={() => setLocale('hy')}>
        to Armenian
      </Text>
      <Text accessibilityRole="button" onPress={() => setLocale('en')}>
        to English
      </Text>
      <ErrorState onRetry={() => undefined} />
    </>
  );
}

describe('language', () => {
  it('starts in English and switches every UI-kit string at once, then back', async () => {
    const user = userEvent.setup();
    await renderUi(<Probe />);

    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'to Russian' }));
    expect(screen.getByText('Что-то пошло не так')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeOnTheScreen();
    expect(screen.queryByText('Something went wrong')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'to Armenian' }));
    expect(screen.getByText('Ինչ-որ բան սխալ ընթացավ')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Կրկին փորձել' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'to English' }));
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
  });

  it('remembers the choice and opens in it on the next launch', async () => {
    const user = userEvent.setup();
    const preferences = createMemoryPreferences();
    const first = await renderUi(<Probe />, { preferences });

    await user.press(screen.getByRole('button', { name: 'to Armenian' }));
    await waitFor(async () => expect(await preferences.get(LOCALE_KEY)).toBe('hy'));

    first.unmount();
    await renderUi(<Probe />, { preferences });

    expect(screen.getByText('locale:hy')).toBeOnTheScreen();
    expect(screen.getByText('Ինչ-որ բան սխալ ընթացավ')).toBeOnTheScreen();
  });

  it("uses the phone's language the first time when the app has it", async () => {
    phoneSpeaks('ru');

    await renderUi(<Probe />);

    expect(screen.getByText('locale:ru')).toBeOnTheScreen();
    expect(screen.getByText('Что-то пошло не так')).toBeOnTheScreen();
  });

  it.each([['fr'], [null]])('falls back to English when the phone speaks %p', async (code) => {
    phoneSpeaks(code);

    await renderUi(<Probe />);

    expect(screen.getByText('locale:en')).toBeOnTheScreen();
  });

  it('falls back to English when the phone reports no language at all', async () => {
    jest.mocked(getLocales).mockReturnValue([] as unknown as ReturnType<typeof getLocales>);

    await renderUi(<Probe />);

    expect(screen.getByText('locale:en')).toBeOnTheScreen();
  });

  it('prefers the saved choice over the phone, and ignores a saved language it does not offer', async () => {
    phoneSpeaks('ru');
    const first = await renderUi(<Probe />, { saved: { locale: 'hy' } });
    expect(screen.getByText('locale:hy')).toBeOnTheScreen();
    first.unmount();

    await renderUi(<Probe />, { saved: { locale: 'de' } });
    expect(screen.getByText('locale:ru')).toBeOnTheScreen();
  });

  it('keeps working when the choice cannot be saved', async () => {
    const user = userEvent.setup();
    const store: PreferenceStore = { get: () => Promise.resolve(null), set: () => Promise.resolve() };
    await renderUi(<Probe />, { preferences: store });

    await user.press(screen.getByRole('button', { name: 'to Russian' }));

    expect(screen.getByText('locale:ru')).toBeOnTheScreen();
  });
});

function Money() {
  const format = useFormat();

  return (
    <>
      <Text>{`usd:${format.money({ amount: 2480, currency: 'USD' })}`}</Text>
      <Text>{`amd:${format.money({ amount: 1500, currency: 'AMD' })}`}</Text>
      <Text>{`weekday:${format.date('2026-06-24T12:00:00Z', 'weekdayDate')}`}</Text>
      <Text>{`bad:${format.date('nope')}`}</Text>
    </>
  );
}

describe('money and dates', () => {
  it('turns minor units into text only at render time, per language', async () => {
    await renderUi(<Money />);

    expect(screen.getByText('usd:$24.80')).toBeOnTheScreen();
    expect(screen.getByText('amd:֏1,500')).toBeOnTheScreen();
  });

  it('follows the chosen language for amounts and dates', async () => {
    await renderUi(<Money />, { saved: { locale: 'ru' } });

    expect(screen.getByText(/^usd:24,80\s\$$/)).toBeOnTheScreen();
    expect(screen.getByText(/^amd:1\s500\s֏$/)).toBeOnTheScreen();
    expect(screen.getByText(/^weekday:среда, 24 июня$/)).toBeOnTheScreen();
  });

  it('writes Armenian dates in Armenian and an invalid date as nothing', async () => {
    await renderUi(<Money />, { saved: { locale: 'hy' } });

    expect(screen.getByText(/^amd:1500\s֏$/)).toBeOnTheScreen();
    expect(screen.getByText(/հունիսի/)).toBeOnTheScreen();
    expect(screen.getByText('bad:')).toBeOnTheScreen();
  });
});

function AppText() {
  const { t } = useUiTranslation();
  const { setLocale } = useLocale();

  return (
    <>
      <Text>{t('app:greeting')}</Text>
      <Text>{t('common.close')}</Text>
      <Text accessibilityRole="button" onPress={() => setLocale('ru')}>
        to Russian
      </Text>
    </>
  );
}

describe('addTranslations', () => {
  it("lets an app register its own strings next to the UI kit's, in all three languages", async () => {
    const user = userEvent.setup();
    const i18n = createI18n('en');
    addTranslations(i18n, 'app', {
      en: { greeting: 'Good morning' },
      ru: { greeting: 'Доброе утро' },
      hy: { greeting: 'Բարի լույս' },
    });
    const preferences = createMemoryPreferences();
    render(
      <UiProvider i18n={i18n} preferences={preferences}>
        <AppText />
      </UiProvider>,
    );

    expect(await screen.findByText('Good morning')).toBeOnTheScreen();
    expect(screen.getByText('Close')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'to Russian' }));
    await act(async () => undefined);

    expect(screen.getByText('Доброе утро')).toBeOnTheScreen();
    expect(screen.getByText('Закрыть')).toBeOnTheScreen();
  });
});
