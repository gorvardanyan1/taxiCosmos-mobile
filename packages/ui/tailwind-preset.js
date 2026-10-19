/**
 * The Tailwind preset both apps use (`presets: [require('@taxikosmos/ui/tailwind-preset')]` in their tailwind.config.js), so the template's
 * tokens exist once. Dark mode is the `dark:` variant driven by the theme provider (system default, manual override).
 */
const { brand, fontFamily, radii, fontSize } = require('./src/theme/tokens.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: brand.accent, soft: brand.accentSoft },
        ink: brand.ink,
        paper: brand.paper,
        shell: brand.shell,
        map: { light: brand.mapLight, dark: brand.mapDark },
      },
      fontFamily: {
        manrope: [fontFamily.regular],
        'manrope-regular': [fontFamily.regular],
        'manrope-medium': [fontFamily.medium],
        'manrope-semibold': [fontFamily.semibold],
        'manrope-bold': [fontFamily.bold],
        'manrope-extrabold': [fontFamily.extrabold],
      },
      borderRadius: { card: radii.card, panel: radii.panel, sheet: radii.sheet },
      fontSize,
    },
  },
};
