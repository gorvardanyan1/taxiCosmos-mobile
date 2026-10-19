# Design system (`packages/ui`)

The look of both apps, ported from `RiderTaxiAppTemplate` (a Figma export of the driver app): Manrope, the lime accent
`#C8F135`, ink `slate-950`, paper `#F5F6F2`, `rounded-[1.75rem]` cards, light and dark. Nothing is copied per app: colours,
radii, fonts, components, translations and the theme all live in `packages/ui`, and the apps import them.

## Using it

The root layout of each app wraps everything in `UiProvider` (already done in `apps/*/src/app/_layout.tsx`). It loads Manrope,
restores the saved theme and language, provides safe areas and toasts, and holds the splash screen until all of that is ready.

```tsx
import { Button, Card, ListGroup, MenuRow, useFormat, useUiTranslation } from '@taxikosmos/ui';

export default function Screen() {
  const { t } = useUiTranslation();
  const format = useFormat();

  return (
    <View className="flex-1 bg-paper p-5 dark:bg-slate-950">
      <Text className="text-xl font-manrope-extrabold text-slate-950 dark:text-white">{format.money(trip.fare)}</Text>
      <Button label={t('common.retry')} onPress={() => refetch()} />
    </View>
  );
}
```

Open **Design system** on the home screen of any non-production build (`/design-preview`) to see every block in light and
dark, in English, Russian and Armenian. A production build redirects that route to the home screen.

## Tokens

`src/theme/tokens.js` is the single source (plain CommonJS so both Node, for Tailwind, and Metro can read it). The Tailwind
preset `tailwind-preset.js` turns it into classes; each app's `tailwind.config.js` only does
`presets: [require('@taxikosmos/ui/tailwind-preset')]` and lists where its classes are used.

| Need          | Class / API                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand colours | `bg-accent`, `bg-accent-soft`, `bg-paper`, `bg-ink`, `bg-shell`, `bg-map-light`, `bg-map-dark`; slate, emerald, red, amber, blue            |
| Big radii     | `rounded-card` (1.75rem), `rounded-panel` (1.5rem), `rounded-t-sheet`                                                                       |
| Type          | Manrope: `font-manrope` (400), `font-manrope-medium`, `-semibold`, `-bold`, `-extrabold`; `text-micro`, `text-caption`, `text-screen-title` |
| Dark mode     | the template's `dark:` classes. Use `useTheme()` for things drawn in JS (SVG icons, placeholders): `colors.icon`, `colors.accent`           |

Rules: **no colour literals in the apps** (a test fails on `#RRGGBB` or `rgb(` in `apps/*/src`). Compose classes, do not
override them: a caller adds layout (margin, flex), not a second colour for the same property. Fonts are separate families
per weight in React Native, so use `font-manrope-extrabold`, not `font-extrabold`.

## Theme

`useTheme()` → `{ preference, scheme, colors, setPreference, toggleScheme }`. The default `preference` is `system` (follows the
phone); `light` and `dark` are manual overrides, saved in AsyncStorage (`taxikosmos.ui.theme`) and applied before the first
frame. The header's sun/moon button is `ThemeToggleButton`.

## Language

English, Russian and Armenian, through i18next. `useUiTranslation()` returns `t` for the kit's strings
(`src/i18n/locales/{en,ru,hy}.ts`); `useLocale()` returns `{ locale, setLocale }` (saved under `taxikosmos.ui.locale`; the first
launch uses the phone's language if the app has it, else English). A test fails when a key is missing in one language, has other
`{{placeholders}}`, or lacks a plural form that language needs (Russian has `_one`, `_few`, `_many`, `_other`).

An app adds its own strings next to the kit's:

```ts
const i18n = createI18n();                        // in the app's root, once
addTranslations(i18n, 'app', { en: {...}, ru: {...}, hy: {...} });
<UiProvider i18n={i18n}>…</UiProvider>            // then useTranslation('app') in screens
```

**Money and dates** are formatted only where drawn, from integer minor units: `useFormat().money({ amount: 2480, currency: 'USD' })`
→ `$24.80`; AMD is whole drams with the dram sign in every language (`֏1,500`, `1 500 ֏`). `useFormat().date(iso, 'weekdayDate' | 'time' | …)`.

## Components

| Group    | Components                                                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Actions  | `Button` (primary, accent, ghost, destructive; loading; an async `onPress` keeps it busy so it cannot double-submit), `IconButton` |
| Inputs   | `TextField`, `PhoneField` (country picker, E.164), `OtpInput` (SMS auto-fill), `SegmentedControl`                                  |
| Surfaces | `Card`, `DarkStatCard`, `ListGroup` + `MenuRow` / `ListRow`, `StatusBadge`                                                         |
| Feedback | `Skeleton`, `EmptyState`, `ErrorState` (generic/offline, retry), `Toast` (`useToast().show(...)`)                                  |
| Overlays | `BottomSheet`, `Modal`                                                                                                             |
| Chrome   | `ScreenHeader` (+ `ThemeToggleButton`, `NotificationBell`), `TabBar` (lime dot, count badge, safe area)                            |

Every control has an accessibility role and label; icons are decoration. Dark-mode note: the template's primary button is
`slate-950`, which disappears on the dark page, so in dark mode it is white with ink text.

## Testing

`packages/ui/src/__tests__` renders everything under the real `UiProvider` (`renderUi` in `helpers.tsx`) with an in-memory
preference store and asserts what the person sees or hears (roles, labels, hints). NativeWind does not compute styles in Jest, so
styling is covered separately: `design-tokens.test.ts` compiles the Tailwind preset against the kit's sources and checks the
generated rules. `jest/setup.js` (mocks for AsyncStorage and safe areas) and `jest/css-stub.js` are shared with the apps' Jest
configs.
