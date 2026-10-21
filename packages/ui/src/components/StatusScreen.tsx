import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

export type ScreenTone = 'neutral' | 'warning' | 'danger';

export interface StatusAction {
  label: string;
  onPress: () => void | Promise<unknown>;
  icon?: IconName;
}

export interface StatusScreenProps {
  icon: IconName;
  tone?: ScreenTone;
  title: string;
  message?: string;
  /** Extra content between the message and the buttons (support contacts, for example). */
  children?: ReactNode;
  primaryAction?: StatusAction;
  secondaryAction?: StatusAction;
}

/**
 * A whole screen that says one thing and offers a way out: an update is required, the account is blocked, the app hit an error.
 * It takes the full screen with safe areas and scrolls when the text is large, so it never traps someone on a small phone.
 */
export function StatusScreen({
  icon,
  tone = 'neutral',
  title,
  message,
  children,
  primaryAction,
  secondaryAction,
}: StatusScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const color = tone === 'danger' ? colors.danger : tone === 'warning' ? colors.warning : colors.icon;

  return (
    <View className="flex-1 bg-paper dark:bg-slate-950">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
      >
        <View className="items-center">
          <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-accent-soft dark:bg-slate-800">
            <Icon name={icon} size={34} color={color} />
          </View>
          <Text
            accessibilityRole="header"
            className="text-center text-screen-title font-manrope-extrabold text-slate-950 dark:text-white"
          >
            {title}
          </Text>
          {message ? (
            <Text className="mt-2 text-center text-sm leading-5 text-slate-500 dark:text-slate-400">{message}</Text>
          ) : null}
        </View>
        {children ? <View className="mt-6 gap-3">{children}</View> : null}
        {primaryAction || secondaryAction ? (
          <View className="mt-8 gap-3">
            {primaryAction ? (
              <Button
                fullWidth
                variant="primary"
                label={primaryAction.label}
                onPress={primaryAction.onPress}
                {...(primaryAction.icon ? { icon: primaryAction.icon } : {})}
              />
            ) : null}
            {secondaryAction ? (
              <Button
                fullWidth
                variant="ghost"
                label={secondaryAction.label}
                onPress={secondaryAction.onPress}
                {...(secondaryAction.icon ? { icon: secondaryAction.icon } : {})}
              />
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
