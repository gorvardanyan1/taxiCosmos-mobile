import { View } from 'react-native';

import { Icon, type IconName } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { cx } from './cx';
import { Text } from './Text';

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  /** A button that fixes the emptiness ("Book a ride"). */
  action?: { label: string; onPress: () => void };
  className?: string;
}

/** Nothing here yet: says so and, when it can, offers the next step. */
export function EmptyState({ title, message, icon = 'route', action, className }: EmptyStateProps) {
  const { colors } = useTheme();

  return (
    <View className={cx('items-center px-8 py-10', className)}>
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-accent-soft dark:bg-slate-800">
        <Icon name={icon} size={28} color={colors.icon} />
      </View>
      <Text
        accessibilityRole="header"
        className="text-center text-lg font-manrope-extrabold text-slate-950 dark:text-white"
      >
        {title}
      </Text>
      {message ? (
        <Text className="mt-1.5 text-center text-sm leading-5 text-slate-500 dark:text-slate-400">{message}</Text>
      ) : null}
      {action ? <Button className="mt-5" size="sm" label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}
