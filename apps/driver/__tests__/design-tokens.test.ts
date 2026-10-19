import fs from 'node:fs';
import path from 'node:path';

import { brand } from '@taxikosmos/ui';
import type { Config } from 'tailwindcss';
import resolveConfig from 'tailwindcss/resolveConfig';

const ROOT = path.resolve(__dirname, '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('@taxikosmos/ui/tailwind-preset') as object;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../tailwind.config.js') as Config & { presets: object[] };

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);

    return entry.isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('driver design tokens', () => {
  it('builds on the shared preset and defines no tokens of its own, so both apps look the same', () => {
    expect(appConfig.presets).toEqual([preset]);
    expect(appConfig.theme).toBeUndefined();

    const resolved = resolveConfig({ ...appConfig, content: [] } as Config);
    expect(resolved.theme.colors).toMatchObject({
      accent: { DEFAULT: brand.accent },
      paper: brand.paper,
      ink: brand.ink,
    });
  });

  it('looks for classes in its own screens and in the shared UI kit', () => {
    expect(appConfig.content).toEqual(['./src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}']);
  });

  it('has no colour literals in its screens: every colour comes from the shared tokens', () => {
    const offenders = sourceFiles(path.join(ROOT, 'src')).filter((file) =>
      /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(fs.readFileSync(file, 'utf8')),
    );

    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });
});
