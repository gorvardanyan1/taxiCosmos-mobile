/* global jest, beforeEach */
// Shared Jest setup for every workspace that renders the UI kit: the native storage and the safe-area insets are the outside world
// (no device here); everything else runs for real.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// What one test saves (theme, language) must not reach the next: start every test on a fresh install.
beforeEach(async () => {
  await require('@react-native-async-storage/async-storage').clear();
  require('nativewind').colorScheme.set('system');
});

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
