import { Button, Card, Text, useUiTranslation } from '@taxikosmos/ui';
import { View } from 'react-native';

export interface LocationPromptProps {
  /** `undetermined`: explain first, then ask. `denied`: ask again. `blocked`: only Settings can change it. */
  kind: 'undetermined' | 'denied' | 'blocked';
  onAllow: () => void | Promise<unknown>;
  onOpenSettings: () => void | Promise<unknown>;
  /** "Enter an address instead": closes the card; the address search is on screen all the time. */
  onDismiss: () => void;
}

/**
 * Why we want the location, before the system asks (and what happens when it was refused). Always leaves a way forward that needs no location:
 * the address box on the screen works without it.
 */
export function LocationPrompt({ kind, onAllow, onOpenSettings, onDismiss }: LocationPromptProps) {
  const { t } = useUiTranslation();
  const refused = kind !== 'undetermined';

  return (
    <Card>
      <View className="gap-3">
        <Text accessibilityRole="header" className="text-base font-manrope-extrabold text-slate-950 dark:text-white">
          {refused ? t('location.deniedTitle') : t('location.rationaleTitle')}
        </Text>
        <Text className="text-sm leading-5 text-slate-500 dark:text-slate-400">
          {refused ? t('location.deniedMessage') : t('location.rationaleMessage')}
        </Text>
        {kind === 'blocked' ? (
          <Button fullWidth variant="primary" label={t('location.openSettings')} onPress={onOpenSettings} />
        ) : (
          <Button fullWidth variant="primary" label={t('location.allow')} onPress={onAllow} />
        )}
        <Button fullWidth variant="ghost" label={t('location.typeAddress')} onPress={onDismiss} />
      </View>
    </Card>
  );
}
