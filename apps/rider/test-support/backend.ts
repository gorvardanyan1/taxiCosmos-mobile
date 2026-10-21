import type { AppConfig } from '@taxikosmos/core';
import * as fixtures from '@taxikosmos/core/fixtures';

import { appApi } from '../src/api';

/**
 * The backend as the app's tests see it: the recorded real answers of `@taxikosmos/core/fixtures`, scripted per test, behind a fake
 * `fetch`. Only the network is faked; the app's own client, session and screens run for real.
 */
export type Reply = { status: number; body?: unknown } | 'network-error';
/** A reply, or a function that answers later (to keep a request in flight while the test looks at the screen). */
export type Script = Reply | (() => Promise<Reply>);
export type AccountStatus = 'active' | 'suspended' | 'deactivated' | 'pending_deletion';

export interface Backend {
  config: Script;
  me: Script;
  logout: Script;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  authorization: string | null;
}

export const ok = (fixture: { status: number; body: unknown }): Reply => ({
  status: fixture.status,
  body: fixture.body,
});

export const SUPPORT = { phone: '+37410123456', email: 'help@taxikosmos.test' };

export const configWith = (changes: {
  update?: Partial<AppConfig['update']>;
  support?: AppConfig['support'];
}): Reply => ({
  status: 200,
  body: {
    ...fixtures.appConfigOk.body,
    update: { ...fixtures.appConfigOk.body.update, ...changes.update },
    support: changes.support ?? fixtures.appConfigOk.body.support,
  },
});

export const forcedUpdate = (storeUrl: string | null): Reply =>
  configWith({ update: { force_update: true, update_available: true, store_url: storeUrl } });

export const meWith = (status: AccountStatus): Reply => ({
  status: 200,
  body: { user: { ...fixtures.meRider.body.user, status } },
});

/** Replaces `fetch` for one test. Returns the script to change during the test and every request made so far. */
export function installBackend(): { backend: Backend; requests: RecordedRequest[] } {
  const backend: Backend = { config: ok(fixtures.appConfigOk), me: ok(fixtures.meRider), logout: { status: 204 } };
  const requests: RecordedRequest[] = [];

  jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/api/v1', '');
    requests.push({
      method: init?.method ?? 'GET',
      path,
      query: Object.fromEntries(url.searchParams.entries()),
      authorization: new Headers(init?.headers).get('authorization'),
    });
    const script = path === '/app-config' ? backend.config : path === '/me' ? backend.me : backend.logout;
    const reply = typeof script === 'function' ? await script() : script;

    if (reply === 'network-error') {
      throw new TypeError('Network request failed');
    }

    return new Response(reply.body === undefined || reply.status === 204 ? null : JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json' },
    });
  });

  return { backend, requests };
}

/** Signs the person in as the recorded rider, the way the sign-in screen will (M2-T1): the tokens are saved, then the app sees itself signed in. */
export async function signIn(): Promise<void> {
  await appApi.client.session.start(fixtures.authSessionRider.body);
}

export async function signOut(): Promise<void> {
  await appApi.client.session.clear();
}
