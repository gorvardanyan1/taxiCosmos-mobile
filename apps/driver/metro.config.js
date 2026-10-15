// Expo's Metro config (monorepo-aware since SDK 52), extended by Sentry with debug IDs for source maps.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
