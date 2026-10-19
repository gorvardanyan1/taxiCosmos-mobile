import { View } from 'react-native';

import { cx } from './cx';
import { Text } from './Text';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const TONES: Record<StatusTone, { container: string; label: string; dot: string }> = {
  neutral: {
    container: 'bg-slate-100 dark:bg-slate-800',
    label: 'text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  // The template's "↗ 12.4%" pill: emerald-400/15 on the dark card.
  success: {
    container: 'bg-emerald-50 dark:bg-emerald-400/15',
    label: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  warning: {
    container: 'bg-amber-50 dark:bg-amber-400/15',
    label: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  danger: { container: 'bg-red-50 dark:bg-red-400/15', label: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  info: { container: 'bg-blue-50 dark:bg-blue-400/15', label: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  accent: { container: 'bg-accent', label: 'text-slate-950', dot: 'bg-slate-950' },
};

export interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

/** A small pill saying where something stands (verified, pending, rejected). The tone is never the only signal: the label says it too. */
export function StatusBadge({ label, tone = 'neutral', className }: StatusBadgeProps) {
  const styles = TONES[tone];

  return (
    <View
      accessible
      accessibilityLabel={label}
      className={cx('flex-row items-center gap-1.5 self-start rounded-full px-2.5 py-1', styles.container, className)}
    >
      <View className={cx('h-1.5 w-1.5 rounded-full', styles.dot)} />
      <Text className={cx('text-caption font-manrope-bold', styles.label)}>{label}</Text>
    </View>
  );
}
