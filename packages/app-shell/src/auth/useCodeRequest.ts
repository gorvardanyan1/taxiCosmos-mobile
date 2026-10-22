import { useRequestOtp } from '@taxikosmos/api-client';
import { DEFAULT_RESEND_COOLDOWN_SECONDS, fieldError, getApiError, type AppClient } from '@taxikosmos/core';
import { useUiTranslation } from '@taxikosmos/ui';

export type CodeRequestResult =
  | { ok: true; expiresIn: number; resendInSeconds: number }
  | {
      ok: false;
      /** The server's complaint about the number itself, for the field. */
      phoneError: string | null;
      /** What to tell the person, in their language. */
      message: string;
      /** How long the server wants them to wait, when it said (a 429). */
      waitSeconds: number | null;
    };

/** Asks for a sign-in code and turns every outcome into text the screens can show, so the phone step and "send a new code" behave the same. */
export function useCodeRequest(app: AppClient) {
  const { t } = useUiTranslation();
  const request = useRequestOtp();

  return async (phone: string): Promise<CodeRequestResult> => {
    try {
      const sent = await request.mutateAsync({ phone, app });

      return { ok: true, expiresIn: sent.expires_in, resendInSeconds: DEFAULT_RESEND_COOLDOWN_SECONDS };
    } catch (error) {
      const api = getApiError(error);
      const phoneError = fieldError(error, 'phone');

      if (api?.kind === 'rate_limited') {
        const wait = api.retryAfterSeconds;

        return {
          ok: false,
          phoneError: null,
          waitSeconds: wait,
          message: wait === null ? t('signIn.rateLimitedLater') : t('signIn.rateLimited', { seconds: wait }),
        };
      }

      const offline = api?.kind === 'network' || api?.kind === 'timeout';

      return {
        ok: false,
        phoneError,
        waitSeconds: null,
        message: phoneError ?? (offline ? t('signIn.offline') : t('signIn.failed')),
      };
    }
  };
}
