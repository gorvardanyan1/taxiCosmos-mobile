/** `jest-expo` gives the React Native renderer; the components are exercised the way a person uses them. */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest/setup.js'],
  // The first test of a file compiles the kit (NativeWind, router); with every workspace testing at once that outlasts Jest's 5 s.
  testTimeout: 30000,
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
};
