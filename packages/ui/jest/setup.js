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

jest.mock('@maplibre/maplibre-react-native', () => require('./maplibre'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// The phone's location is the outside world too: not asked yet, no position, until a test says otherwise.
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
beforeEach(() => {
  const location = require('expo-location');
  location.getForegroundPermissionsAsync
    .mockReset()
    .mockResolvedValue({ status: 'undetermined', canAskAgain: true, granted: false });
  location.requestForegroundPermissionsAsync
    .mockReset()
    .mockResolvedValue({ status: 'denied', canAskAgain: true, granted: false });
  location.getCurrentPositionAsync.mockReset().mockRejectedValue(new Error('No position'));
});
