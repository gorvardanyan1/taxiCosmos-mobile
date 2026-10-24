import type { AppConfig, Trip } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';

import { appApi } from '../src/api';

/**
 * The backend as the app's tests see it: the recorded real answers of `@taxikosmos/core/fixtures`, scripted per test, behind a fake
 * `fetch`. Only the network is faked; the app's own client, session and screens run for real.
 */
export type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | 'network-error';
/** A reply, or a function that answers later (to keep a request in flight while the test looks at the screen). */
export type Script = Reply | (() => Promise<Reply>);
export type AccountStatus = 'active' | 'suspended' | 'deactivated' | 'pending_deletion';

export interface Backend {
  config: Script;
  me: Script;
  logout: Script;
  /** `POST /auth/otp/request` */
  otpRequest: Script;
  /** `POST /auth/otp/verify` */
  otpVerify: Script;
  /** `PATCH /me` */
  updateMe: Script;
  /** `GET /geo/autocomplete` */
  autocomplete: Script;
  /** `GET /geo/places/{id}` */
  place: Script;
  /** `GET /geo/reverse` */
  reverse: Script;
  /** `GET /geo/route` */
  route: Script;
  /** `POST /trips/fare-estimate` */
  fareEstimate: Script;
  /** `POST /trips` */
  requestTrip: Script;
  /** `GET /trips/current` (204 when the rider has no trip going) */
  currentTrip: Script;
  /** `GET /trips/{id}` */
  trip: Script;
  /** `POST /trips/{id}/cancel` */
  cancelTrip: Script;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  authorization: string | null;
  /** The JSON the app sent, if any. */
  body: Record<string, unknown> | null;
  idempotencyKey: string | null;
}

export const ok = (fixture: { status: number; body: unknown }): Reply => ({
  status: fixture.status,
  body: fixture.body,
});

export const errorReply = (fixture: { status: number; headers?: Record<string, string>; body: unknown }): Reply => ({
  status: fixture.status,
  body: fixture.body,
  ...(fixture.headers ? { headers: fixture.headers } : {}),
});

export const SUPPORT = { phone: '+37410123456', email: 'help@taxikosmos.test' };

export const configWith = (changes: {
  update?: Partial<AppConfig['update']>;
  support?: AppConfig['support'];
  legal?: AppConfig['legal'];
}): Reply => ({
  status: 200,
  body: {
    ...fixtures.appConfigOk.body,
    update: { ...fixtures.appConfigOk.body.update, ...changes.update },
    support: changes.support ?? fixtures.appConfigOk.body.support,
    legal: changes.legal ?? fixtures.appConfigOk.body.legal,
  },
});

export const forcedUpdate = (storeUrl: string | null): Reply =>
  configWith({ update: { force_update: true, update_available: true, store_url: storeUrl } });

/** A sign-in answer for a person with (or without) a name on the account. */
export const sessionFor = (name: string | null): Reply => ({
  status: 200,
  body: { ...fixtures.authSessionRider.body, user: { ...fixtures.authSessionRider.body.user, name } },
});

export const meWith = (status: AccountStatus): Reply => ({
  status: 200,
  body: { user: { ...fixtures.meRider.body.user, status } },
});

/** Replaces `fetch` for one test. Returns the script to change during the test and every request made so far. */
export function installBackend(): { backend: Backend; requests: RecordedRequest[] } {
  const backend: Backend = {
    config: ok(fixtures.appConfigOk),
    me: ok(fixtures.meRider),
    logout: { status: 204 },
    otpRequest: ok(fixtures.authOtpRequested),
    otpVerify: ok(fixtures.authSessionRider),
    updateMe: ok(fixtures.meRiderUpdated),
    autocomplete: ok(fixtures.geoAutocomplete),
    place: ok(fixtures.geoPlace),
    reverse: ok(fixtures.geoReverse),
    route: ok(fixtures.geoRoute),
    fareEstimate: ok(fixtures.fareEstimate),
    requestTrip: ok(fixtures.tripsRequested),
    currentTrip: { status: 204 },
    trip: ok(fixtures.tripsShow),
    cancelTrip: ok(fixtures.tripsCancelled),
  };
  const requests: RecordedRequest[] = [];

  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/api/v1', '');
    requests.push({
      method: init?.method ?? 'GET',
      path,
      query: Object.fromEntries(url.searchParams.entries()),
      authorization: new Headers(init?.headers).get('authorization'),
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
      idempotencyKey: new Headers(init?.headers).get('idempotency-key'),
    });
    const method = init?.method ?? 'GET';
    const script = scriptFor(backend, path, method);
    const reply = typeof script === 'function' ? await script() : script;

    if (reply === 'network-error') {
      throw new TypeError('Network request failed');
    }

    return new Response(reply.body === undefined || reply.status === 204 ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  });

  return { backend, requests };
}

function scriptFor(backend: Backend, path: string, method: string): Script {
  if (path === '/app-config') return backend.config;
  if (path === '/auth/otp/request') return backend.otpRequest;
  if (path === '/auth/otp/verify') return backend.otpVerify;
  if (path === '/geo/autocomplete') return backend.autocomplete;
  if (path.startsWith('/geo/places/')) return backend.place;
  if (path === '/geo/reverse') return backend.reverse;
  if (path === '/geo/route') return backend.route;
  if (path === '/trips/fare-estimate') return backend.fareEstimate;
  if (path === '/trips') return backend.requestTrip;
  if (path === '/trips/current') return backend.currentTrip;
  if (/^\/trips\/\d+\/cancel$/.test(path)) return backend.cancelTrip;
  if (/^\/trips\/\d+$/.test(path)) return backend.trip;
  if (path === '/me') return method === 'PATCH' ? backend.updateMe : backend.me;

  return backend.logout;
}

/** A recorded trip in another state or with other details (the fixtures are real answers; a test changes only what it is about). */
export function tripWith(changes: Partial<Trip>, base: Trip = fixtures.tripsRequested.body.data): Trip {
  return { ...base, ...changes };
}

/** Signs the person in as the recorded rider, the way the sign-in screen will (M2-T1): the tokens are saved, then the app sees itself signed in. */
export async function signIn(): Promise<void> {
  await appApi.client.session.start(fixtures.authSessionRider.body);
}

export async function signOut(): Promise<void> {
  await appApi.client.session.clear();
}
