import type { PublicAppConfig } from './expo-config.ts';

/** The subset of Sentry's init options this policy decides; passed straight to `Sentry.init` in each app's root layout. */
export interface MonitoringOptions {
  dsn: string | undefined;
  enabled: boolean;
  environment: string;
  sendDefaultPii: false;
  tracesSampleRate: number;
  /** Removes personal data from every error event before it is sent (see `scrubEvent`). */
  beforeSend: typeof scrubEvent;
  /** The same for performance traces, which Sentry sends through a different hook and which carry the address of every request (see `scrubTransaction`). */
  beforeSendTransaction: typeof scrubTransaction;
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
    beforeSendTransaction: scrubTransaction,
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

/** Span data that is only the query string of a request, or a part of it. */
const QUERY_KEYS = new Set([
  'http.query',
  'http.fragment',
  'url.query',
  'url.fragment',
  'http.request.query',
  'query',
  'query_string',
]);

/** A span description or transaction name with every query string removed: `GET https://api/x?lat=1&lng=2` becomes `GET https://api/x`. */
function withoutQuery(text: string): string {
  return scrubText(text).replace(/\?[^\s#]*/g, '');
}

/** The data of a span: query strings dropped, addresses cut at the `?`, and phone numbers, tokens and coordinates blanked out of any text. */
function cleanSpanData(data: unknown): unknown {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return data;
  }

  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !QUERY_KEYS.has(key))
      .map(([key, value]) => {
        if (typeof value !== 'string') {
          return [key, value];
        }

        // An address (`https://…`, `/api/v1/…`) loses its query; any other text is only blanked out.
        return [key, /^(https?:\/\/|\/)/i.test(value) ? withoutQuery(value) : scrubText(value)];
      }),
  );
}

function cleanSpan(span: Record<string, unknown>): Record<string, unknown> {
  return {
    ...span,
    ...(typeof span.description === 'string' ? { description: withoutQuery(span.description) } : {}),
    ...(span.data === undefined ? {} : { data: cleanSpanData(span.data) }),
  };
}

/**
 * Applied to every performance trace before it leaves the phone (`beforeSendTransaction`). Sentry records every network request of a
 * sampled session as a span, with the whole query string (`/geo/reverse?lat=…&lng=…`, the address a rider typed), which `beforeSend` never
 * sees because it only handles errors. This removes what `scrubEvent` removes from an error, plus every query string, from the transaction
 * name, each span's description and data, and the root span's data.
 */
export function scrubTransaction<T extends object>(event: T): T {
  const scrubbed = scrubEvent(event) as Record<string, unknown>;

  if (typeof scrubbed.transaction === 'string') {
    scrubbed.transaction = withoutQuery(scrubbed.transaction);
  }

  const contexts = scrubbed.contexts as { trace?: Record<string, unknown> } | undefined;
  if (contexts?.trace !== undefined) {
    contexts.trace = cleanSpan(contexts.trace);
  }

  if (Array.isArray(scrubbed.spans)) {
    scrubbed.spans = scrubbed.spans.map((span: Record<string, unknown>) => cleanSpan(span));
  }

  return scrubbed as T;
}
