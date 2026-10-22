import { formatPhoneInput, secondsUntil, type AppClient, type CountryCode } from '@taxikosmos/core';
import { Button, PhoneField, Text, useUiTranslation, type PhoneFieldChange } from '@taxikosmos/ui';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useNow } from '../useNow';
import { ConsentLinks } from './ConsentLinks';
import { useCodeRequest } from './useCodeRequest';

export interface PhoneEntry {
  text: string;
  country: CountryCode;
}

export interface PhoneStepProps {
  app: AppClient;
  entry: PhoneEntry;
  onEntryChange: (entry: PhoneEntry) => void;
  /** A number the server asked to wait for (and until when), so asking again at once is not offered. */
  cooldown: { phone: string; until: number } | null;
  onSent: (sent: { phone: string; expiresIn: number; resendInSeconds: number }) => void;
  onCooldown: (cooldown: { phone: string; until: number }) => void;
}

export function PhoneStep({ app, entry, onEntryChange, cooldown, onSent, onCooldown }: PhoneStepProps) {
  const { t } = useUiTranslation();
  const requestCode = useCodeRequest(app);
  const [problem, setProblem] = useState<{ message: string; field: boolean } | null>(null);
  const phone = formatPhoneInput(entry.text, entry.country).e164;
  const holdUntil = cooldown !== null && cooldown.phone === phone ? cooldown.until : null;
  const now = useNow(holdUntil);
  const waiting = holdUntil === null ? 0 : secondsUntil(holdUntil, now);

  const change = (next: PhoneFieldChange) => {
    setProblem(null);
    onEntryChange({ text: next.text, country: next.country });
  };

  // The keyboard's "done" key reaches `send` without the button's own lock; a ref (not state) also holds for two presses in the same instant.
  const sending = useRef(false);

  const send = async () => {
    if (phone === null || waiting > 0 || sending.current) {
      return;
    }

    sending.current = true;
    setProblem(null);
    const result = await requestCode(phone).finally(() => {
      sending.current = false;
    });

    if (result.ok) {
      onSent({ phone, expiresIn: result.expiresIn, resendInSeconds: result.resendInSeconds });
      return;
    }

    if (result.waitSeconds !== null) {
      onCooldown({ phone, until: Date.now() + result.waitSeconds * 1000 });
    }

    setProblem({ message: result.message, field: result.phoneError !== null });
  };

  return (
    <View className="gap-6">
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
        >
          {t('signIn.title')}
        </Text>
        <Text className="text-sm leading-5 text-slate-500 dark:text-slate-400">{t('signIn.subtitle')}</Text>
      </View>
      <PhoneField
        value={entry.text}
        country={entry.country}
        onChange={change}
        onSubmitEditing={() => void send()}
        {...(problem?.field ? { error: problem.message } : {})}
        autoFocus
      />
      {problem !== null && !problem.field ? (
        <Text accessibilityRole="alert" className="text-sm font-manrope-semibold text-red-600 dark:text-red-500">
          {problem.message}
        </Text>
      ) : null}
      <Button
        fullWidth
        variant="primary"
        label={waiting > 0 ? t('verify.resendIn', { seconds: waiting }) : t('signIn.send')}
        disabled={phone === null || waiting > 0}
        onPress={send}
      />
      <ConsentLinks />
    </View>
  );
}
