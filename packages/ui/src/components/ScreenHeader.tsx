import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useUiTranslation } from '../i18n/hooks';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface ScreenHeaderProps {
  title: string;
  /** The small uppercase line above the title (the template shows the date there). */
  subtitle?: string;
  /** Before the title, usually the person's avatar. */
  leading?: ReactNode;
  /** The round buttons on the right: `ThemeToggleButton`, `NotificationBell`, or your own `IconButton`s. */
  actions?: ReactNode;
}

/** The template's screen header: avatar, eyebrow, big title on the left; round buttons on the right. */
export function ScreenHeader({ title, subtitle, leading, actions }: ScreenHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-5 pb-4 pt-5">
      <View className="flex-1 flex-row items-center gap-3">
        {leading}
        <View className="flex-1">
          {subtitle ? (
            <Text className="mb-0.5 text-xs font-manrope-semibold uppercase tracking-[0.15em] text-slate-400">
              {subtitle}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            className="text-screen-title font-manrope-extrabold tracking-tight text-slate-950 dark:text-white"
          >
            {title}
          </Text>
        </View>
      </View>
      {actions ? <View className="flex-row gap-2">{actions}</View> : null}
    </View>
  );
}

/** The sun/moon button: flips light and dark, and the choice is remembered. */
export function ThemeToggleButton() {
  const { t } = useUiTranslation();
  const { scheme, toggleScheme } = useTheme();

  return (
    <IconButton
      icon={scheme === 'light' ? 'moon' : 'sun'}
      label={t(scheme === 'light' ? 'theme.toDark' : 'theme.toLight')}
      onPress={toggleScheme}
    />
  );
}

/** The bell with the lime dot while something is unread. */
export function NotificationBell({ unread = 0, onPress }: { unread?: number; onPress?: () => void }) {
  const { t } = useUiTranslation();

  return (
    <IconButton
      icon="bell"
      dot={unread > 0}
      label={unread > 0 ? t('notifications.unread', { count: unread }) : t('notifications.label')}
      onPress={onPress}
    />
  );
}
