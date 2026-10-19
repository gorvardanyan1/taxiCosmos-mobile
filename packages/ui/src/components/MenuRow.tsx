import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { cx } from './cx';
import { RowIcon } from './RowIcon';
import { Text } from './Text';

export interface MenuRowProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** What is chosen now, shown before the chevron (`English`). */
  value?: string;
  /** A row that does something irreversible (sign out, delete account) is drawn in red. */
  destructive?: boolean;
  className?: string;
}

/** The profile menu row of the template: icon tile, bold label, chevron. Put rows inside a `ListGroup`. */
export function MenuRow({ label, icon, onPress, value, destructive = false, className }: MenuRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={onPress}
      className={cx(
        'min-h-[56px] flex-row items-center gap-3 p-4 active:bg-slate-50 dark:active:bg-slate-800',
        className,
      )}
    >
      <RowIcon name={icon} color={destructive ? colors.danger : undefined} />
      <Text
        className={cx(
          'flex-1 text-sm font-manrope-bold',
          destructive ? 'text-red-600 dark:text-red-500' : 'text-slate-800 dark:text-slate-100',
        )}
      >
        {label}
      </Text>
      {value ? <Text className="text-xs font-manrope-semibold text-slate-400">{value}</Text> : null}
      <View>
        <Icon name="arrow" size={16} color={colors.chevron} />
      </View>
    </Pressable>
  );
}
