import { StatusScreen, useUiTranslation } from '@taxikosmos/ui';

import { openLink, storeLink } from '../links';

/** This build is too old to run. The only way on is the store. */
export function UpdateRequiredScreen({ storeUrl }: { storeUrl: string | null }) {
  const { t } = useUiTranslation();
  const link = storeLink(storeUrl);

  return (
    <StatusScreen
      icon="alert"
      tone="warning"
      title={t('shell.updateTitle')}
      message={t(link === null ? 'shell.updateNoLink' : 'shell.updateMessage')}
      {...(link === null ? {} : { primaryAction: { label: t('shell.updateAction'), onPress: () => openLink(link) } })}
    />
  );
}
