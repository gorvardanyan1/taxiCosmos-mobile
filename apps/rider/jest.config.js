module.exports = {
  preset: 'jest-expo',
  // The first test of a file compiles the whole app (router, UI kit, NativeWind); with every workspace testing at once that outlasts Jest's 5 s.
  testTimeout: 30000,
  setupFilesAfterEnv: ['@taxikosmos/ui/jest/setup'],
  // `import '../../global.css'` is compiled by Metro in the app; in Jest it is an empty module.
  moduleNameMapper: { '\\.css$': '@taxikosmos/ui/jest/css-stub' },
};
