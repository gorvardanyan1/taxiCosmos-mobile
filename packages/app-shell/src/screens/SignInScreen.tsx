import { DEFAULT_PHONE_COUNTRY, startChallenge, type AppClient, type OtpChallenge } from '@taxikosmos/core';
import { Button, useUiTranslation } from '@taxikosmos/ui';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CodeStep } from '../auth/CodeStep';
import { PhoneStep, type PhoneEntry } from '../auth/PhoneStep';

export interface SignInScreenProps {
  app: AppClient;
  /** This install's id, sent with the code. */
  getDeviceId: () => Promise<string>;
  /** Adds the way to the design-system preview that development and staging builds have. */
  devLinks?: boolean;
}

type Sent = OtpChallenge & { resendAt: number };

/**
 * Phone number, then the code we texted. Signing in saves the session; the signed-out group then moves the person on to the screen they were
 * heading to (`?next=`), so nothing here navigates.
 */
export function SignInScreen({ app, getDeviceId, devLinks = false }: SignInScreenProps) {
  const { t } = useUiTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [entry, setEntry] = useState<PhoneEntry>({ text: '', country: DEFAULT_PHONE_COUNTRY });
  const [sent, setSent] = useState<Sent | null>(null);
  const [cooldown, setCooldown] = useState<{ phone: string; until: number } | null>(null);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-paper dark:bg-slate-950"
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        {sent === null ? (
          <PhoneStep
            app={app}
            entry={entry}
            onEntryChange={setEntry}
            cooldown={cooldown}
            onCooldown={setCooldown}
            onSent={({ phone, expiresIn, resendInSeconds }) => {
              const now = Date.now();
              setCooldown({ phone, until: now + resendInSeconds * 1000 });
              setSent({ ...startChallenge(phone, expiresIn, now), resendAt: now + resendInSeconds * 1000 });
            }}
          />
        ) : (
          <CodeStep
            app={app}
            getDeviceId={getDeviceId}
            initial={sent}
            onCooldown={setCooldown}
            onChangeNumber={() => setSent(null)}
          />
        )}
        {devLinks ? (
          <View className="mt-8 items-center">
            <Button
              size="sm"
              variant="ghost"
              label={t('preview.title')}
              onPress={() => router.push('/design-preview')}
            />
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
