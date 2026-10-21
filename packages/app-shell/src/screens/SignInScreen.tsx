import { Button, StatusScreen, useUiTranslation } from '@taxikosmos/ui';
import { useRouter } from 'expo-router';

/**
 * The first screen of the signed-out group. The phone-number form arrives with M2-T1 and replaces the body; the route, the redirect to the
 * link the person was heading to (`?next=`), and the group around it are what this task provides. `devLinks` adds the way to the design-system
 * preview that development and staging builds have.
 */
export function SignInScreen({ devLinks = false }: { devLinks?: boolean }) {
  const { t } = useUiTranslation();
  const router = useRouter();

  return (
    <StatusScreen icon="user" title={t('shell.signInTitle')} message={t('shell.signInMessage')}>
      {devLinks ? (
        <Button size="sm" variant="ghost" label={t('preview.title')} onPress={() => router.push('/design-preview')} />
      ) : null}
    </StatusScreen>
  );
}
