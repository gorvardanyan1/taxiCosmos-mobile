import fs from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import tailwind from 'tailwindcss';
import resolveConfig from 'tailwindcss/resolveConfig';

import { brand, fontFamily, themes } from '../index';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('../../tailwind-preset.js') as Record<string, unknown>;

const SRC = path.resolve(__dirname, '..');

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

async function compile(): Promise<string> {
  const result = await postcss([
    tailwind({ presets: [preset], content: [{ raw: allClassNames(), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined });

  return result.css;
}

/** Every token that appears in a quoted string in the UI kit's sources: a superset of its class names. */
function allClassNames(): string {
  return sourceFiles(SRC)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

describe('design tokens (ported from RiderTaxiAppTemplate)', () => {
  it("are the template's colours: lime accent, slate-950 ink, #F5F6F2 paper", () => {
    expect(brand).toMatchObject({ accent: '#C8F135', ink: '#020617', paper: '#F5F6F2', shell: '#111511' });
    expect(themes.light.background).toBe('#F5F6F2');
    expect(themes.dark.background).toBe('#020617');
    expect(themes.light.accent).toBe('#C8F135');
    expect(themes.dark.accent).toBe('#C8F135');
  });

  it("use the template's roles in each theme: white text on slate-900 cards in dark, ink text on white in light", () => {
    expect(themes.dark).toMatchObject({
      text: '#FFFFFF',
      surface: '#0F172A',
      surfaceMuted: '#1E293B',
      border: '#1E293B',
      icon: '#FFFFFF',
      statusBar: 'light',
    });
    expect(themes.light).toMatchObject({
      text: '#020617',
      surface: '#FFFFFF',
      surfaceMuted: '#F1F5F9',
      border: '#E2E8F0',
      icon: '#1E293B',
      statusBar: 'dark',
    });
  });

  it('give light and dark the same set of colour roles, so a screen never meets a missing colour in one theme', () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });

  it('are exposed to Tailwind as classes: colours, the big card radius, the Manrope families, dark mode by class', () => {
    const theme = resolveConfig({ presets: [preset], content: [] });

    expect((theme as { darkMode?: string }).darkMode).toBe('class');
    expect(theme.theme.colors).toMatchObject({
      accent: { DEFAULT: '#C8F135' },
      paper: '#F5F6F2',
      ink: '#020617',
      shell: '#111511',
    });
    expect(theme.theme.borderRadius).toMatchObject({ card: '1.75rem', panel: '1.5rem' });
    expect(theme.theme.fontFamily).toMatchObject({
      manrope: [fontFamily.regular],
      'manrope-extrabold': [fontFamily.extrabold],
    });
  });

  it('generate the CSS rules for the classes the components use, including their dark variants', async () => {
    const css = await compile();

    for (const rule of [
      '.bg-accent',
      '.bg-paper',
      '.rounded-card',
      '.rounded-t-sheet',
      '.font-manrope-extrabold',
      '.font-manrope-semibold',
      '.text-screen-title',
      '.text-micro',
      '.text-caption',
      '.dark\\:bg-slate-900',
      '.dark\\:border-slate-700',
      '.border-slate-200\\/80',
    ]) {
      expect(css).toContain(rule);
    }

    // #C8F135 is rgb(200 241 53); Tailwind writes colours as channels so opacity modifiers (bg-accent/50) work.
    expect(css).toMatch(/\.bg-accent\s*{[^}]*rgb\(200 241 53/);
    expect(css).toMatch(/\.rounded-card\s*{[^}]*1\.75rem/);
    expect(css).toMatch(/\.font-manrope-extrabold\s*{[^}]*Manrope_800ExtraBold/);
  });

  it('map every Manrope weight class to its own font family', () => {
    const { theme } = resolveConfig({ presets: [preset], content: [] });
    const families = theme.fontFamily as Record<string, string[]>;

    expect(families['manrope']).toEqual([fontFamily.regular]);
    for (const weight of Object.keys(fontFamily) as (keyof typeof fontFamily)[]) {
      expect(families[`manrope-${weight}`]).toEqual([fontFamily[weight]]);
    }
    expect(new Set(Object.keys(fontFamily).map((weight) => fontFamily[weight as keyof typeof fontFamily])).size).toBe(
      5,
    );
  });

  it('leave no component using a font-weight class that has no matching Manrope family', () => {
    const used = new Set(allClassNames().match(/font-manrope(-[a-z]+)?/g));
    const known = new Set(['font-manrope', ...Object.keys(fontFamily).map((weight) => `font-manrope-${weight}`)]);

    expect([...used].filter((name) => !known.has(name))).toEqual([]);
  });
});
