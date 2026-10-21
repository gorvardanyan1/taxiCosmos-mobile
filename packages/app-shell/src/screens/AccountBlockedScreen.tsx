import { useLogout } from '@taxikosmos/api-client';
import type { AppConfig, UserStatus } from '@taxikosmos/core';
import { Button, StatusScreen, useUiTranslation } from '@taxikosmos/ui';

import { mailLink, openLink, telLink } from '../links';

export type BlockedReason = Exclude<UserStatus, 'active'>;

const COPY: Record<BlockedReason, { title: string; message: string }> = {
  suspended: { title: 'shell.suspendedTitle', message: 'shell.suspendedMessage' },
  deactivated: { title: 'shell.deactivatedTitle', message: 'shell.deactivatedMessage' },
  pending_deletion: { title: 'shell.pendingDeletionTitle', message: 'shell.pendingDeletionMessage' },
};

/**
 * Shown instead of the app for an account that may not use it (suspended, turned off, being deleted): why, how to reach support, and a way
 * to sign out and use another account. The person never sees a half-working home screen.
 */
export function AccountBlockedScreen({
  reason,
  support,
}: {
  reason: BlockedReason;
  support: AppConfig['support'] | undefined;
}) {
  const { t } = useUiTranslation();
  const logout = useLogout();
  const email = mailLink(support?.email ?? null);
  const phone = telLink(support?.phone ?? null);
  const copy = COPY[reason];

  return (
    <StatusScreen
      icon="shield"
      tone="danger"
      title={t(copy.title)}
      message={
        email === null && phone === null ? `${t(copy.message)} ${t('shell.noSupportContacts')}` : t(copy.message)
      }
      secondaryAction={{ label: t('shell.signOut'), onPress: () => logout.mutateAsync() }}
    >
      {email !== null && support?.email ? (
        <Button
          fullWidth
          variant="accent"
          icon="help"
          label={t('shell.supportEmail', { email: support.email })}
          accessibilityHint={t('shell.contactSupport')}
          onPress={() => openLink(email)}
        />
      ) : null}
      {phone !== null && support?.phone ? (
        <Button
          fullWidth
          variant="accent"
          icon="help"
          label={t('shell.supportPhone', { phone: support.phone })}
          accessibilityHint={t('shell.contactSupport')}
          onPress={() => openLink(phone)}
        />
      ) : null}
    </StatusScreen>
  );
}
