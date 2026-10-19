import { Pressable, View } from 'react-native';

import type { IconName } from '../icons/Icon';
import { cx } from './cx';
import { RowIcon } from './RowIcon';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Text on the right, already formatted (`+$24.80`). */
  trailing?: string;
  /** `positive` draws the trailing text in green, as the template does for income. */
  trailingTone?: 'default' | 'positive';
  onPress?: () => void;
  className?: string;
}

/** The activity row of the template: icon tile, title with a small subtitle, and an amount. Tappable only when `onPress` is given. */
export function ListRow({
  title,
  subtitle,
  icon,
  trailing,
  trailingTone = 'default',
  onPress,
  className,
}: ListRowProps) {
  const content = (
    <>
      {icon ? <RowIcon name={icon} size="lg" /> : null}
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-manrope-bold text-slate-900 dark:text-white">{title}</Text>
        {subtitle ? <Text className="text-caption text-slate-400">{subtitle}</Text> : null}
      </View>
      {trailing ? (
        <Text
          className={cx(
            'text-sm font-manrope-extrabold',
            trailingTone === 'positive' ? 'text-emerald-600' : 'text-slate-900 dark:text-white',
          )}
        >
          {trailing}
        </Text>
      ) : null}
    </>
  );
  const layout = cx('min-h-[64px] flex-row items-center gap-3 p-4', className);
  const summary = [title, subtitle, trailing].filter(Boolean).join(', ');

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary}
      onPress={onPress}
      className={cx(layout, 'active:bg-slate-50 dark:active:bg-slate-800')}
    >
      {content}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={summary} className={layout}>
      {content}
    </View>
  );
}
