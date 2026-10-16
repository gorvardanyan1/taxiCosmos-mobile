import type { PublicAppConfig } from './expo-config.ts';

/** The subset of Sentry's init options this policy decides; passed straight to `Sentry.init` in each app's root layout. */
export interface MonitoringOptions {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  sendDefaultPii: false;
  tracesSampleRate: number;
}

/**
 * One crash-reporting policy for both apps. Sentry is off when the build has no DSN (local development by default), and it
 * never attaches personal data on its own: riders' and drivers' phones, names and locations stay out of reports.
 */
export function monitoringOptions(config: PublicAppConfig): MonitoringOptions {
  return {
    dsn: config.sentryDsn ?? undefined,
    enabled: config.sentryDsn !== null,
    environment: config.environment,
    sendDefaultPii: false,
    tracesSampleRate: config.environment === 'production' ? 0.1 : 1,
  };
}
