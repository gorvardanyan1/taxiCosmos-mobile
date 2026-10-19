import { View } from 'react-native';

import { Icon, type IconName } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { cx } from './cx';

/** The rounded square holding a row's icon (`bg-slate-100`, slate-800 in dark mode). */
export function RowIcon({ name, size = 'md', color }: { name: IconName; size?: 'md' | 'lg'; color?: string }) {
  const { colors } = useTheme();

  return (
    <View
      className={cx(
        'items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800',
        size === 'lg' ? 'h-10 w-10' : 'h-9 w-9',
      )}
    >
      <Icon name={name} size={size === 'lg' ? 20 : 18} color={color ?? colors.rowIcon} />
    </View>
  );
}
