/** Pure TypeScript, so the Node preset is enough: no simulator, no React Native renderer. */
module.exports = {
  preset: 'jest-expo/node',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/index.ts',
    '!src/fixtures/**',
    '!src/api/types.ts',
    '!src/api/requests.ts',
  ],
  // Shared code both apps rely on: keep it fully exercised (M1-T2 raises the bar for api-client too).
  coverageThreshold: { global: { statements: 95, branches: 90, functions: 100, lines: 95 } },
};
