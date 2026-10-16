import { getApiError, type AuthSession } from '@taxikosmos/core';

import { pairFromSession, type TokenPair, type TokenStore } from './storage';

export type SessionStatus = 'unknown' | 'signed_out' | 'signed_in';

/** Why a session ended without the person asking. */
export type SessionEndReason = 'refresh_rejected' | 'unauthorized' | 'signed_out';

export interface SessionSnapshot {
  status: SessionStatus;
}

export interface SessionManagerOptions {
  store: TokenStore;
  /** Exchanges a refresh token for a new session: `POST /auth/refresh`, sent without a bearer token. */
  refresh: (refreshToken: string) => Promise<AuthSession>;
  /** Called when the session ended by itself (the server refused the refresh token), after the tokens were cleared. */
  onEnded?: (reason: SessionEndReason) => void;
  now?: () => number;
  /** Renew the access token this long before it expires instead of waiting for a 401. */
  renewBeforeMs?: number;
}

/**
 * Owns the session: the tokens in memory and in the secure store, and the one renewal in flight.
 *
 * The server hands out a refresh token once. Sending an already used one is treated as theft and ends the whole session, so this class
 * never sends one twice: parallel callers share one request, the new pair is saved before anyone uses it, and a refresh whose outcome is
 * unknown (the connection dropped) keeps the session and surfaces the network error instead of guessing.
 */
export class SessionManager {
  private readonly store: TokenStore;
  private readonly doRefresh: (refreshToken: string) => Promise<AuthSession>;
  private readonly onEnded: (reason: SessionEndReason) => void;
  private readonly now: () => number;
  private readonly renewBeforeMs: number;
  private pair: TokenPair | null = null;
  private status: SessionStatus = 'unknown';
  private loading: Promise<void> | null = null;
  private renewal: Promise<void> | null = null;
  private snapshot: SessionSnapshot = { status: 'unknown' };
  private readonly listeners = new Set<() => void>();

  constructor(options: SessionManagerOptions) {
    this.store = options.store;
    this.doRefresh = options.refresh;
    this.onEnded = options.onEnded ?? (() => undefined);
    this.now = options.now ?? Date.now;
    this.renewBeforeMs = options.renewBeforeMs ?? 30_000;
  }

  /** Reads the saved session once. Safe to call from anywhere, any number of times. */
  load(): Promise<void> {
    this.loading ??= this.store.read().then(
      (pair) => {
        // A sign-in or sign-out that happened while reading wins over what was on disk.
        if (this.status === 'unknown') {
          this.pair = pair;
          this.setStatus(pair === null ? 'signed_out' : 'signed_in');
        }
      },
      () => {
        if (this.status === 'unknown') {
          this.setStatus('signed_out');
        }
      },
    );

    return this.loading;
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  get isSignedIn(): boolean {
    return this.status === 'signed_in';
  }

  /** The access token to send now, renewed first if it is about to expire; `null` when signed out. */
  async accessToken(): Promise<string | null> {
    await this.load();

    if (this.pair === null) {
      return null;
    }

    const expiresAt = this.pair.accessTokenExpiresAt === null ? null : Date.parse(this.pair.accessTokenExpiresAt);

    if (expiresAt !== null && !Number.isNaN(expiresAt) && expiresAt - this.now() <= this.renewBeforeMs) {
      try {
        await this.renew(this.pair.accessToken);
      } catch {
        // No answer to the renewal (offline, server down): the request goes out with the token we have. If it is refused, the 401 renews again.
      }
    }

    return this.pair?.accessToken ?? null;
  }

  /** Starts a session from a sign-in answer. The tokens are saved before the app sees itself as signed in. */
  async start(session: AuthSession): Promise<void> {
    const pair = pairFromSession(session);
    await this.store.write(pair);
    this.pair = pair;
    this.loading = Promise.resolve();
    this.setStatus('signed_in');
  }

  /** Signs out on this device: forgets the tokens. (The caller tells the server first when it can.) */
  async clear(): Promise<void> {
    this.pair = null;
    this.loading = Promise.resolve();
    await this.store.clear();
    this.setStatus('signed_out');
  }

  /**
   * Renews the session after `rejectedAccessToken` was refused. If another request already renewed it, nothing is sent. Resolves when a
   * usable token exists; throws the network/server error when the outcome is unknown (the session is kept); ends the session and returns
   * when the server refuses the refresh token.
   */
  async renew(rejectedAccessToken: string): Promise<void> {
    await this.load();

    if (this.pair === null) {
      return;
    }

    if (this.pair.accessToken !== rejectedAccessToken) {
      return;
    }

    this.renewal ??= this.runRenewal(this.pair.refreshToken).finally(() => {
      this.renewal = null;
    });

    return this.renewal;
  }

  private async runRenewal(refreshToken: string): Promise<void> {
    let session: AuthSession;

    try {
      session = await this.doRefresh(refreshToken);
    } catch (error) {
      const kind = getApiError(error)?.kind;

      if (kind === 'unauthenticated' || kind === 'forbidden' || kind === 'validation') {
        await this.end('refresh_rejected');

        return;
      }

      throw error;
    }

    const pair = pairFromSession(session);
    // The old refresh token is spent on the server: the new pair is saved before anything else can run into the old one.
    await this.store.write(pair);
    this.pair = pair;
    this.setStatus('signed_in');
  }

  /** The session is over without the person asking. */
  async end(reason: SessionEndReason): Promise<void> {
    await this.clear();
    this.onEnded(reason);
  }

  private setStatus(status: SessionStatus): void {
    this.status = status;

    // A renewal keeps the status as it was: subscribers hear about changes of status only.
    if (this.snapshot.status === status) {
      return;
    }

    this.snapshot = { status };
    this.listeners.forEach((listener) => listener());
  }
}
