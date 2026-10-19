// Expo's Metro config (monorepo-aware since SDK 52), extended by Sentry with debug IDs for source maps and by NativeWind for `className`.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(getSentryExpoConfig(__dirname), { input: './global.css' });
