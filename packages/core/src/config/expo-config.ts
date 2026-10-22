import type { ExpoConfig } from '@expo/config-types';

import {
  APP_ENVIRONMENTS,
  ConfigError,
  resolveEnvironment,
  type AppEnvironment,
  type EnvironmentVariables,
} from './environment.ts';
import { appIdentity, type AppName } from './identity.ts';

/** What the running app reads back from `Constants.expoConfig.extra.app`. Public: it is inside the app bundle. */
export interface PublicAppConfig {
  app: AppName;
  environment: AppEnvironment;
  apiUrl: string;
  /** The realtime service address; `null` means the apps poll over REST. */
  realtimeUrl: string | null;
  sentryDsn: string | null;
  stripePublishableKey: string | null;
  /** Where the map tiles come from; `null` means OpenStreetMap's public server (development only). */
  mapTileUrl: string | null;
}

/** App version shown in the stores. Native build numbers are managed by EAS (`appVersionSource: remote`). */
export const APP_VERSION = '0.1.0';

/** The template's dark paper colour (`RiderTaxiAppTemplate/src/index.css`), used behind the splash icon. */
const SPLASH_BACKGROUND = '#111511';

/**
 * The full Expo config for one app in one environment. Each app's `app.config.ts` is a one-line call to this, so the
 * two apps cannot drift apart in anything but their identity.
 */
export function buildExpoConfig(app: AppName, env: EnvironmentVariables): ExpoConfig {
  const resolved = resolveEnvironment(env);
  const identity = appIdentity(app, resolved.environment);
  const easProjectId = env.EAS_PROJECT_ID?.trim();
  const sentryOrg = env.SENTRY_ORG?.trim();
  const sentryProject = env.SENTRY_PROJECT?.trim();

  // Optional values are left out rather than stored as null: the manifest serialiser does not keep nulls reliably.
  const publicConfig = {
    app,
    environment: resolved.environment,
    apiUrl: resolved.apiUrl,
    ...(resolved.realtimeUrl ? { realtimeUrl: resolved.realtimeUrl } : {}),
    ...(resolved.sentryDsn ? { sentryDsn: resolved.sentryDsn } : {}),
    ...(resolved.stripePublishableKey ? { stripePublishableKey: resolved.stripePublishableKey } : {}),
    ...(resolved.mapTileUrl ? { mapTileUrl: resolved.mapTileUrl } : {}),
  };

  const plugins: NonNullable<ExpoConfig['plugins']> = [
    'expo-router',
    // The session lives in the secure store; this plugin also keeps it out of Android's cloud backups (restored values cannot be decrypted).
    'expo-secure-store',
    [
      'expo-splash-screen',
      { backgroundColor: SPLASH_BACKGROUND, image: './assets/images/splash-icon.png', imageWidth: 96 },
    ],
  ];

  plugins.push(
    // The map (MapLibre, OpenStreetMap tiles) needs no key; the plugin sets the native build flags it needs.
    '@maplibre/maplibre-react-native',
    // Foreground location only: the rider's pickup point and the driver's position while the app is open (no background location in the MVP).
    [
      'expo-location',
      { locationWhenInUsePermission: `Allow ${identity.name} to use your location to find you on the map.` },
    ],
  );

  // Source maps are uploaded only when the build knows its Sentry project; the upload token is SENTRY_AUTH_TOKEN, read by the plugin.
  if (sentryOrg && sentryProject) {
    plugins.push([
      '@sentry/react-native/expo',
      { url: 'https://sentry.io/', organization: sentryOrg, project: sentryProject },
    ]);
  }

  return {
    name: identity.name,
    slug: identity.slug,
    scheme: identity.scheme,
    version: APP_VERSION,
    ...(env.EXPO_OWNER?.trim() ? { owner: env.EXPO_OWNER.trim() } : {}),
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: identity.bundleIdentifier,
      supportsTablet: false,
      config: { usesNonExemptEncryption: false },
    },
    android: {
      package: identity.androidPackage,
      adaptiveIcon: {
        backgroundColor: SPLASH_BACKGROUND,
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    plugins,
    experiments: { typedRoutes: true, reactCompiler: true },
    extra: {
      app: publicConfig,
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
  };
}

/** Reads the public config back at runtime and fails loudly if the build was made without it. */
export function readPublicConfig(extra: unknown): PublicAppConfig {
  const config = (extra as { app?: Partial<PublicAppConfig> } | null | undefined)?.app;

  if (
    !config ||
    (config.app !== 'rider' && config.app !== 'driver') ||
    !(APP_ENVIRONMENTS as readonly unknown[]).includes(config.environment) ||
    typeof config.apiUrl !== 'string' ||
    config.apiUrl === ''
  ) {
    throw new ConfigError('This build has no app configuration (expo.extra.app). Rebuild it with app.config.ts.');
  }

  return {
    app: config.app,
    environment: config.environment as AppEnvironment,
    apiUrl: config.apiUrl,
    realtimeUrl: nonEmptyString(config.realtimeUrl),
    sentryDsn: nonEmptyString(config.sentryDsn),
    stripePublishableKey: nonEmptyString(config.stripePublishableKey),
    mapTileUrl: nonEmptyString(config.mapTileUrl),
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
