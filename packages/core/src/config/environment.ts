/**
 * Which backend an app build talks to, and the keys it needs, resolved from the build environment.
 *
 * Values come from environment variables: EAS environment variables for cloud builds (selected per build profile in eas.json),
 * and a git-ignored `.env` file next to each app for local work. Nothing here is hardcoded per environment except the
 * local development API default, so the same code builds development, staging and production.
 *
 * Everything returned here ends up inside the app and is therefore public. Secrets that only the build needs (such as
 * SENTRY_AUTH_TOKEN for source-map upload) are read by their own tools and must never pass through this function.
 */

export const APP_ENVIRONMENTS = ['development', 'staging', 'production'] as const;

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

export interface ResolvedEnvironment {
  environment: AppEnvironment;
  /** Origin of the Laravel backend, without a trailing slash; the API client adds `/api/v1`. */
  apiUrl: string;
  /** Where the realtime (Socket.io) service listens, or `null` until it exists: the apps then poll over REST. */
  realtimeUrl: string | null;
  sentryDsn: string | null;
  stripePublishableKey: string | null;
  /** Android Google Maps key, written into the native manifest at build time (used from M3-T1). */
  googleMapsAndroidApiKey: string | null;
}

export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** The local Laravel server (`php artisan serve`). An Android emulator or a phone needs API_URL set; see docs/development.md. */
export const LOCAL_API_URL = 'http://localhost:8000';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function resolveEnvironment(env: EnvironmentVariables): ResolvedEnvironment {
  const environment = parseEnvironment(value(env, 'APP_ENV'));

  return {
    environment,
    apiUrl: parseApiUrl(value(env, 'API_URL'), environment),
    realtimeUrl: parseRealtimeUrl(value(env, 'REALTIME_URL'), environment),
    sentryDsn: parseSentryDsn(value(env, 'SENTRY_DSN'), environment),
    stripePublishableKey: parseStripeKey(value(env, 'STRIPE_PUBLISHABLE_KEY'), environment),
    googleMapsAndroidApiKey: value(env, 'GOOGLE_MAPS_ANDROID_API_KEY'),
  };
}

function value(env: EnvironmentVariables, name: string): string | null {
  const raw = env[name]?.trim();

  return raw ? raw : null;
}

function parseEnvironment(raw: string | null): AppEnvironment {
  if (raw === null) {
    return 'development';
  }

  if (!(APP_ENVIRONMENTS as readonly string[]).includes(raw)) {
    throw new ConfigError(`APP_ENV must be one of ${APP_ENVIRONMENTS.join(', ')}; got "${raw}".`);
  }

  return raw as AppEnvironment;
}

function parseApiUrl(raw: string | null, environment: AppEnvironment): string {
  if (raw === null) {
    if (environment !== 'development') {
      throw new ConfigError(`API_URL is required for a ${environment} build.`);
    }

    return LOCAL_API_URL;
  }

  const url = parseUrl(raw, 'API_URL');

  if (url.protocol !== 'https:' && environment !== 'development') {
    throw new ConfigError(`API_URL must use https for a ${environment} build.`);
  }

  if (url.search || url.hash || url.username || url.password) {
    throw new ConfigError(
      'API_URL must be a plain origin such as https://api.example.com, without credentials, query or fragment.',
    );
  }

  return url.toString().replace(/\/+$/, '');
}

function parseRealtimeUrl(raw: string | null, environment: AppEnvironment): string | null {
  if (raw === null) {
    return null;
  }

  const url = parseUrl(raw, 'REALTIME_URL', ['http:', 'https:', 'ws:', 'wss:']);
  const secure = url.protocol === 'https:' || url.protocol === 'wss:';

  if (!secure && environment !== 'development') {
    throw new ConfigError(`REALTIME_URL must use https or wss for a ${environment} build.`);
  }

  if (url.search || url.hash || url.username || url.password) {
    throw new ConfigError(
      'REALTIME_URL must be a plain address such as wss://realtime.example.com, without credentials, query or fragment.',
    );
  }

  return url.toString().replace(/\/+$/, '');
}

function parseSentryDsn(raw: string | null, environment: AppEnvironment): string | null {
  if (raw === null) {
    // A production build must report crashes; development and staging may run without Sentry.
    if (environment === 'production') {
      throw new ConfigError('SENTRY_DSN is required for a production build.');
    }

    return null;
  }

  if (parseUrl(raw, 'SENTRY_DSN').protocol !== 'https:') {
    throw new ConfigError('SENTRY_DSN must be an https URL.');
  }

  return raw;
}

function parseStripeKey(raw: string | null, environment: AppEnvironment): string | null {
  if (raw === null) {
    return null;
  }

  // A secret or restricted key inside an app would be readable by anyone who downloads it.
  if (!raw.startsWith('pk_')) {
    throw new ConfigError(
      'STRIPE_PUBLISHABLE_KEY must be a publishable key (pk_...); never put a secret key in the app.',
    );
  }

  const live = raw.startsWith('pk_live_');

  if (environment === 'production' && !live) {
    throw new ConfigError('A production build needs a live Stripe publishable key (pk_live_...).');
  }

  if (environment !== 'production' && live) {
    throw new ConfigError(`A ${environment} build must not use a live Stripe key.`);
  }

  return raw;
}

function parseUrl(raw: string, name: string, protocols: readonly string[] = ['http:', 'https:']): URL {
  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${name} is not a valid URL.`);
  }

  if (!protocols.includes(url.protocol)) {
    throw new ConfigError(`${name} must be ${protocols.length > 2 ? 'an http(s) or ws(s)' : 'an http(s)'} URL.`);
  }

  return url;
}
