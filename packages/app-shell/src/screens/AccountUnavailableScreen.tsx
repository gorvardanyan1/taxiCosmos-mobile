import { useLogout } from '@taxikosmos/api-client';
import { StatusScreen, useUiTranslation } from '@taxikosmos/ui';

/** The account could not be loaded (no connection, server down). Never guess: say so, let the person retry, or sign out. */
export function AccountUnavailableScreen({ onRetry }: { onRetry: () => void | Promise<unknown> }) {
  const { t } = useUiTranslation();
  const logout = useLogout();

  return (
    <StatusScreen
      icon="alert"
      tone="warning"
      title={t('states.errorTitle')}
      message={t('states.errorMessage')}
      primaryAction={{ label: t('common.retry'), onPress: onRetry }}
      secondaryAction={{ label: t('shell.signOut'), onPress: () => logout.mutateAsync() }}
    />
  );
}
