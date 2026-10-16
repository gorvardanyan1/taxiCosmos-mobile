import type {
  AuthSession,
  OtpRequestBody,
  OtpRequested,
  OtpVerifyBody,
  PhoneVerifyBody,
  SocialLoginBody,
  SocialProvider,
} from '@taxikosmos/core';

import type { ApiClient } from '../client';

export function authApi(client: ApiClient) {
  return {
    /** Sends a sign-in code by SMS. The answer is the same whether or not the number has an account. */
    async requestOtp(body: OtpRequestBody, signal?: AbortSignal): Promise<OtpRequested> {
      return (await client.post<OtpRequested>('/auth/otp/request', { body, auth: false, signal })).data;
    },

    /** Checks the code and starts the session: the tokens are saved before this resolves. */
    async verifyOtp(body: OtpVerifyBody, signal?: AbortSignal): Promise<AuthSession> {
      const session = (await client.post<AuthSession>('/auth/otp/verify', { body, auth: false, signal })).data;
      await client.session.start(session);

      return session;
    },

    /** Signs in with a token from Google, Apple or Facebook. `needs_phone` says the phone still has to be added. */
    async loginWithSocial(provider: SocialProvider, body: SocialLoginBody, signal?: AbortSignal): Promise<AuthSession> {
      const session = (await client.post<AuthSession>(`/auth/social/${provider}`, { body, auth: false, signal })).data;
      await client.session.start(session);

      return session;
    },

    /** Adds the phone to a social session that has none (after `requestOtp`). Replaces the session with the full one. */
    async verifyPhone(body: PhoneVerifyBody, signal?: AbortSignal): Promise<AuthSession> {
      const session = (await client.post<AuthSession>('/auth/phone/verify', { body, signal })).data;
      await client.session.start(session);

      return session;
    },

    /**
     * Signs out this device. The server is told on a best-effort basis (it may be unreachable); the tokens are always forgotten here,
     * because a person who asked to sign out must be signed out.
     */
    async logout(): Promise<void> {
      try {
        await client.post<null>('/auth/logout', { timeoutMs: 5_000 });
      } catch {
        // Offline or the token is already dead: either way this device is signed out.
      } finally {
        await client.session.clear();
      }
    },

    /** Signs out every device. Unlike `logout`, it only clears this device once the server confirmed. */
    async logoutAll(): Promise<void> {
      await client.post<null>('/auth/logout-all');
      await client.session.clear();
    },
  };
}
