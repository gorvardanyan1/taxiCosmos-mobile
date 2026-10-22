import { useVerifyOtp } from '@taxikosmos/api-client';
import {
  codeState,
  getApiError,
  formatPhoneForDisplay,
  OTP_LENGTH,
  OTP_MAX_WRONG_GUESSES,
  recordWrongGuess,
  secondsUntil,
  startChallenge,
  type AppClient,
  type OtpChallenge,
} from '@taxikosmos/core';
import { Button, OtpInput, Text, useLocale, useUiTranslation } from '@taxikosmos/ui';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useNow } from '../useNow';
import { useCodeRequest } from './useCodeRequest';

export interface CodeStepProps {
  app: AppClient;
  /** This install's id, sent with the code (the server ties the session to it). */
  getDeviceId: () => Promise<string>;
  initial: OtpChallenge & { resendAt: number };
  onChangeNumber: () => void;
  /** The server told this number to wait. */
  onCooldown: (cooldown: { phone: string; until: number }) => void;
}

export function CodeStep({ app, getDeviceId, initial, onChangeNumber, onCooldown }: CodeStepProps) {
  const { t } = useUiTranslation();
  const { locale } = useLocale();
  const verify = useVerifyOtp();
  const requestCode = useCodeRequest(app);
  const [challenge, setChallenge] = useState<OtpChallenge>({
    phone: initial.phone,
    expiresAt: initial.expiresAt,
    wrongGuesses: initial.wrongGuesses,
  });
  const [resendAt, setResendAt] = useState(initial.resendAt);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // One clock for both: the resend countdown and the code's life re-render this screen every second until the later of them is over.
  const now = useNow(Math.max(resendAt, challenge.expiresAt));
  const resendIn = secondsUntil(resendAt, now);
  const state = codeState(challenge, now);
  const stateProblem = state === 'expired' ? t('verify.expired') : state === 'locked' ? t('verify.locked') : null;
  const shownProblem = stateProblem ?? problem;

  // A ref, not the `checking` state: two completions in the same instant (a paste and an auto-fill) both see the state as it was rendered.
  const submitting = useRef(false);

  const submit = async (value: string) => {
    if (submitting.current) {
      return;
    }

    submitting.current = true;
    setChecking(true);
    setProblem(null);
    setNotice(null);

    try {
      await verify.mutateAsync({
        phone: challenge.phone,
        code: value,
        app,
        device_id: await getDeviceId(),
        locale,
      });
      // Signed in: the gate takes over from here (the screen is left for the one the person was heading to).
    } catch (error) {
      setCode('');
      submitting.current = false;
      setChecking(false);
      setProblem(describeFailure(error));
    }
  };

  const describeFailure = (error: unknown): string => {
    const api = getApiError(error);

    if (api?.kind === 'validation' && api.fieldErrors.code !== undefined) {
      const next = recordWrongGuess(challenge);
      setChallenge(next);

      return next.wrongGuesses >= OTP_MAX_WRONG_GUESSES
        ? t('verify.locked')
        : next.wrongGuesses === OTP_MAX_WRONG_GUESSES - 1
          ? t('verify.lastTry')
          : t('verify.wrong');
    }

    if (api?.kind === 'rate_limited') {
      return api.retryAfterSeconds === null
        ? t('verify.rateLimitedLater')
        : t('verify.rateLimited', { seconds: api.retryAfterSeconds });
    }

    if (api?.kind === 'forbidden') {
      return t('verify.notAllowed');
    }

    return api?.kind === 'network' || api?.kind === 'timeout' ? t('verify.offline') : t('verify.failed');
  };

  const resend = async () => {
    if (resendIn > 0) {
      return;
    }

    setProblem(null);
    const result = await requestCode(challenge.phone);

    if (result.ok) {
      setChallenge(startChallenge(challenge.phone, result.expiresIn, Date.now()));
      setResendAt(Date.now() + result.resendInSeconds * 1000);
      setCode('');
      setNotice(t('verify.resent'));
      return;
    }

    if (result.waitSeconds !== null) {
      const until = Date.now() + result.waitSeconds * 1000;
      setResendAt(until);
      onCooldown({ phone: challenge.phone, until });
    }

    setProblem(result.message);
  };

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
        >
          {t('verify.title')}
        </Text>
        <Text className="text-sm leading-5 text-slate-500 dark:text-slate-400">
          {t('verify.sent', { phone: formatPhoneForDisplay(challenge.phone) })}
        </Text>
      </View>
      <OtpInput
        value={code}
        onChange={setCode}
        onComplete={(value) => void submit(value)}
        length={OTP_LENGTH}
        editable={!checking && state === 'open'}
        autoFocus
        {...(shownProblem !== null ? { error: shownProblem } : {})}
      />
      {checking ? (
        <Text accessibilityLiveRegion="polite" className="text-center text-sm text-slate-500 dark:text-slate-400">
          {t('verify.checking')}
        </Text>
      ) : notice !== null && shownProblem === null ? (
        <Text accessibilityLiveRegion="polite" className="text-center text-sm text-slate-500 dark:text-slate-400">
          {notice}
        </Text>
      ) : null}
      <View className="gap-2">
        <Button
          fullWidth
          variant={state === 'open' ? 'ghost' : 'primary'}
          label={resendIn > 0 ? t('verify.resendIn', { seconds: resendIn }) : t('verify.resend')}
          disabled={resendIn > 0 || checking}
          onPress={resend}
        />
        <Button
          fullWidth
          variant="ghost"
          label={t('verify.changeNumber')}
          disabled={checking}
          onPress={onChangeNumber}
        />
      </View>
    </View>
  );
}
