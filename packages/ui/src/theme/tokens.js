/**
 * The design tokens of RiderTaxiAppTemplate (`src/index.css` and the classes in `src/App.tsx`), in one place. Plain CommonJS so the
 * Tailwind preset (read by Node) and the components (read by Metro) use the very same values: neither app has its own colours.
 */

const brand = {
  /** The lime accent: active tab dot, goal progress, the car marker, the accent button. */
  accent: '#C8F135',
  /** `slate-950`: text in light mode, the dark cards and the primary button. */
  ink: '#020617',
  /** The light page background. */
  paper: '#F5F6F2',
  /** The tinted ring around the profile photo and soft accent surfaces. */
  accentSoft: '#EEF2E6',
  /** The page behind the phone frame and the splash background in dark mode. */
  shell: '#111511',
  mapLight: '#E8ECE7',
  mapDark: '#252C29',
};

/** Tailwind's default slate and status colours the template uses, listed because JS-side drawing (SVG icons) cannot read class names. */
const raw = {
  white: '#FFFFFF',
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
    950: '#020617',
  },
  emerald: { 400: '#34D399', 500: '#10B981', 600: '#059669' },
  red: { 400: '#F87171', 500: '#EF4444', 600: '#DC2626' },
  amber: { 500: '#F59E0B', 700: '#B45309' },
  blue: { 600: '#2563EB' },
};

/** What a screen needs in each theme, named by purpose. Components pair these with the `dark:` classes of the template. */
const themes = {
  light: {
    background: brand.paper,
    surface: raw.white,
    surfaceMuted: raw.slate[100],
    text: raw.slate[950],
    textMuted: raw.slate[400],
    textSecondary: raw.slate[500],
    border: raw.slate[200],
    icon: raw.slate[800],
    iconMuted: raw.slate[400],
    rowIcon: raw.slate[700],
    chevron: raw.slate[300],
    placeholder: raw.slate[400],
    skeleton: raw.slate[200],
    accent: brand.accent,
    onAccent: raw.slate[950],
    danger: raw.red[600],
    success: raw.emerald[600],
    warning: raw.amber[700],
    statusBar: 'dark',
  },
  dark: {
    background: raw.slate[950],
    surface: raw.slate[900],
    surfaceMuted: raw.slate[800],
    text: raw.white,
    textMuted: raw.slate[400],
    textSecondary: raw.slate[400],
    border: raw.slate[800],
    icon: raw.white,
    iconMuted: raw.slate[500],
    rowIcon: raw.slate[200],
    chevron: raw.slate[600],
    placeholder: raw.slate[500],
    skeleton: raw.slate[800],
    accent: brand.accent,
    onAccent: raw.slate[950],
    danger: raw.red[500],
    success: raw.emerald[500],
    warning: raw.amber[500],
    statusBar: 'light',
  },
};

/** Manrope in the weights the template loads (400–800). React Native picks a font by file, so each weight is its own family name. */
const fontFamily = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
};

const radii = {
  /** `rounded-[1.75rem]`: the big cards. */
  card: '1.75rem',
  /** `rounded-[1.5rem]`: the vehicle card. */
  panel: '1.5rem',
  /** `rounded-[2.25rem]`: the sheet. */
  sheet: '2.25rem',
};

/** The type scale used across the template's three screens. */
const fontSize = {
  micro: ['10px', { lineHeight: '14px' }],
  caption: ['11px', { lineHeight: '15px' }],
  'screen-title': ['1.4rem', { lineHeight: '1.75rem', letterSpacing: '-0.02em' }],
};

module.exports = { brand, raw, themes, fontFamily, radii, fontSize };
