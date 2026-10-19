/** @type {import('tailwindcss').Config} */
module.exports = {
  // The tokens (colours, radii, fonts) live once, in packages/ui; the app only says where its classes are used.
  presets: [require('@taxikosmos/ui/tailwind-preset')],
  content: ['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
};
