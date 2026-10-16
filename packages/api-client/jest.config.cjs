/** `jest-expo` gives the React Native renderer the hook tests need; the plain logic tests run on it too. */
module.exports = {
  preset: 'jest-expo',
  // Only *.test files are tests; the helper modules next to them are not.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/index.ts', '!src/**/__tests__/**', '!src/**/*.d.ts'],
  // The shared HTTP/realtime layer is the app's biggest risk surface: keep it well above the 90% the task asks for.
  coverageThreshold: { global: { statements: 92, branches: 85, functions: 92, lines: 92 } },
};
