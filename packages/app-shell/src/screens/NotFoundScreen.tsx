import { StatusScreen, useUiTranslation } from '@taxikosmos/ui';
import { useRouter } from 'expo-router';

/** A link that leads nowhere in this app (an old or mistyped deep link): a plain way back instead of the router's technical page. */
export function NotFoundScreen() {
  const { t } = useUiTranslation();
  const router = useRouter();

  return (
    <StatusScreen
      icon="route"
      title={t('shell.notFoundTitle')}
      message={t('shell.notFoundMessage')}
      primaryAction={{ label: t('shell.notFoundAction'), onPress: () => router.replace('/') }}
    />
  );
}
