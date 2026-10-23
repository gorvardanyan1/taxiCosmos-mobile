import { Button, Text, useUiTranslation } from '@taxikosmos/ui';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { appConfig } from '../../config';

/** Placeholder home of the signed-in app until its real screens arrive; shows the build's identity and environment. */
export default function Home() {
  const router = useRouter();
  const { t } = useUiTranslation();

  return (
    <View className="flex-1 items-center justify-center gap-2 bg-paper p-6 dark:bg-slate-950">
      <Text accessibilityRole="header" className="text-2xl font-manrope-extrabold text-slate-950 dark:text-white">
        {Constants.expoConfig?.name}
      </Text>
      <Text className="text-sm text-slate-500 dark:text-slate-400">
        {t('shell.homeEnvironment', { value: appConfig.environment })}
      </Text>
      <Text className="text-sm text-slate-500 dark:text-slate-400">
        {t('shell.homeApi', { value: appConfig.apiUrl })}
      </Text>
      {appConfig.environment !== 'production' ? (
        <>
          <Button
            className="mt-4"
            size="sm"
            label={t('preview.title')}
            onPress={() => router.push('/design-preview')}
          />
          <Button size="sm" label={t('location.previewTitle')} onPress={() => router.push('/map-preview')} />
        </>
      ) : null}
    </View>
  );
}
