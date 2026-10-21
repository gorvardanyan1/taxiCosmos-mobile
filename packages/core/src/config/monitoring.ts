import type { PublicAppConfig } from './expo-config.ts';

/** The subset of Sentry's init options this policy decides; passed straight to `Sentry.init` in each app's root layout. */
export interface MonitoringOptions {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  sendDefaultPii: false;
  tracesSampleRate: number;
  /** Removes personal data from every event before it is sent (see `scrubEvent`). */
  beforeSend: typeof scrubEvent;
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
    beforeSend: scrubEvent,
  };
}

const REDACTED = '[redacted]';
/** A phone number (E.164, with or without separators), a bearer token, and a latitude/longitude pair written as text. */
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=|-]+/gi;
const COORDINATES = /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g;

/** Text for a report with anything that identifies a person removed. */
export function scrubText(text: string): string {
  return text.replace(BEARER, REDACTED).replace(COORDINATES, REDACTED).replace(PHONE, REDACTED);
}

/**
 * Applied to every Sentry event before it leaves the phone (`beforeSend`). The apps handle phone numbers, names, tokens and
 * locations, so a report keeps what is needed to fix a crash (the error type, the stack, the release and device model) and nothing
 * about the person: no user, no request data or headers, no breadcrumb details, and every message with a phone number, token or
 * coordinates blanked out.
 */
export function scrubEvent<T extends object>(event: T): T {
  const scrubbed = structuredClone(event) as Record<string, unknown>;

  delete scrubbed.user;
  delete scrubbed.request;
  delete scrubbed.extra;
  delete scrubbed.server_name;

  if (typeof scrubbed.message === 'string') {
    scrubbed.message = scrubText(scrubbed.message);
  }

  const exception = scrubbed.exception as { values?: { value?: unknown }[] } | undefined;
  for (const entry of exception?.values ?? []) {
    if (typeof entry.value === 'string') {
      entry.value = scrubText(entry.value);
    }
  }

  if (Array.isArray(scrubbed.breadcrumbs)) {
    scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((crumb: Record<string, unknown>) => ({
      ...crumb,
      ...(typeof crumb.message === 'string' ? { message: scrubText(crumb.message) } : {}),
      data: undefined,
    }));
  }

  return scrubbed as T;
}
