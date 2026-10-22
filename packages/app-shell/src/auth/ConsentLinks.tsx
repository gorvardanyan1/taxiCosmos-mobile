import { Button, Text, useLocale, useUiTranslation } from '@taxikosmos/ui';
import { View } from 'react-native';

import { openLink, storeLink } from '../links';
import { useShellConfig } from '../shellConfig';

/** "By continuing you agree to our Terms and Privacy Policy", with each link opened from the app config in the person's language. A link the server did not give (or that is not https) is left out. */
export function ConsentLinks() {
  const { t } = useUiTranslation();
  const { locale } = useLocale();
  const legal = useShellConfig()?.legal;
  const terms = storeLink(legal?.terms[locale] ?? null);
  const privacy = storeLink(legal?.privacy[locale] ?? null);

  if (terms === null && privacy === null) {
    return null;
  }

  return (
    <View className="items-center gap-1">
      <Text className="text-center text-xs text-slate-500 dark:text-slate-400">{t('signIn.consentIntro')}</Text>
      <View className="flex-row flex-wrap justify-center gap-x-2">
        {terms !== null ? (
          <Button size="sm" variant="ghost" label={t('signIn.terms')} onPress={() => openLink(terms)} />
        ) : null}
        {privacy !== null ? (
          <Button size="sm" variant="ghost" label={t('signIn.privacy')} onPress={() => openLink(privacy)} />
        ) : null}
      </View>
    </View>
  );
}
