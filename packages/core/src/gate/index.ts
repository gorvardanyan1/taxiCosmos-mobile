import type { UserStatus } from '../api/index.ts';

/**
 * What the app shows before (or instead of) its normal screens, decided from three facts: how far the start-up got, whether this
 * build may still run, and who is signed in. Pure, so every combination can be tested; the screens only draw the answer.
 */
export type SessionState = 'unknown' | 'signed_out' | 'signed_in';

/** `loading` is the first answer still on its way; `failed` means it could not be fetched: the app carries on (a server outage must not lock people out). */
export type AsyncState = 'idle' | 'loading' | 'ready' | 'failed';

export interface GateInput {
  session: SessionState;
  /** The public app-config call: asked first, before anyone signs in. */
  config: { state: AsyncState; forceUpdate?: boolean | undefined };
  /** `GET /me` of the signed-in person; `idle` while nobody is signed in. */
  me: { state: AsyncState; status?: UserStatus | undefined };
}

export type Gate =
  /** Something the screens wait for: the saved session, the app config, or the account. */
  | { kind: 'loading' }
  /** This build is too old. Nothing else may be reachable. */
  | { kind: 'update_required' }
  /** Nobody is signed in: the sign-in screens, and the app's own screens send people there. */
  | { kind: 'signed_out' }
  /** The account may not use the app (suspended, deactivated or pending deletion): a status screen with a way to reach support. */
  | { kind: 'blocked'; reason: Exclude<UserStatus, 'active'> }
  /** The account could not be loaded (no connection, server down): say so and let the person retry, never show a half-known app. */
  | { kind: 'account_unavailable' }
  /** Everything is in order. */
  | { kind: 'ready' };

export function resolveGate({ session, config, me }: GateInput): Gate {
  // An outdated build is stopped before anything else, even before the saved session is known.
  if (config.state === 'ready' && config.forceUpdate === true) {
    return { kind: 'update_required' };
  }

  if (session === 'unknown' || config.state === 'idle' || config.state === 'loading') {
    return { kind: 'loading' };
  }

  if (session === 'signed_out') {
    return { kind: 'signed_out' };
  }

  if (me.state === 'idle' || me.state === 'loading') {
    return { kind: 'loading' };
  }

  if (me.state === 'failed' || me.status === undefined) {
    return { kind: 'account_unavailable' };
  }

  return me.status === 'active' ? { kind: 'ready' } : { kind: 'blocked', reason: me.status };
}

const MAX_NEXT_LENGTH = 300;

/**
 * Where to go after signing in: the screen the person was heading to (`?next=/trips/42`), if it is a path inside this app. A link from
 * outside can carry any `next`, so anything that could leave the app or loop through the sign-in screens is refused:
 * other schemes (`https://…`, `javascript:`), protocol-relative `//host`, backslashes, control characters, and the auth screens themselves.
 */
export function safeNextPath(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_NEXT_LENGTH) {
    return null;
  }

  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || hasControlCharacter(value)) {
    return null;
  }

  const path = value.split(/[?#]/, 1)[0] ?? '';

  // `/sign-in` and everything in the `(auth)` group lead nowhere once signed in.
  if (path === '/sign-in' || path.startsWith('/sign-in/') || path.includes('(auth)')) {
    return null;
  }

  return value;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}
