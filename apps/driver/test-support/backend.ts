import type { AppConfig } from '@taxikosmos/core';
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
  body: { ...fixtures.authSessionDriver.body, user: { ...fixtures.authSessionDriver.body.user, name } },
});

export const meWith = (status: AccountStatus): Reply => ({
  status: 200,
  body: { user: { ...fixtures.meDriver.body.user, status } },
});

/** Replaces `fetch` for one test. Returns the script to change during the test and every request made so far. */
export function installBackend(): { backend: Backend; requests: RecordedRequest[] } {
  const backend: Backend = {
    config: ok(fixtures.appConfigOk),
    me: ok(fixtures.meDriver),
    logout: { status: 204 },
    otpRequest: ok(fixtures.authOtpRequested),
    otpVerify: ok(fixtures.authSessionDriver),
    updateMe: ok(fixtures.meRiderUpdated),
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
    const script =
      path === '/app-config'
        ? backend.config
        : path === '/auth/otp/request'
          ? backend.otpRequest
          : path === '/auth/otp/verify'
            ? backend.otpVerify
            : path === '/me'
              ? method === 'PATCH'
                ? backend.updateMe
                : backend.me
              : backend.logout;
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

/** Signs the person in as the recorded driver, the way the sign-in screen will (M2-T1): the tokens are saved, then the app sees itself signed in. */
export async function signIn(): Promise<void> {
  await appApi.client.session.start(fixtures.authSessionDriver.body);
}

export async function signOut(): Promise<void> {
  await appApi.client.session.clear();
}
