import { View } from 'react-native';

import { Icon, type IconName } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { cx } from './cx';
import { Text } from './Text';

export interface DarkStatCardProps {
  label: string;
  /** The big figure, already formatted (`$148.50`): money is formatted where it is drawn, not here. */
  value: string;
  /** The small box on the right (the template's "Goal 74%"). */
  aside?: { label: string; value: string };
  /** 0–100: the lime progress bar under the figure. */
  progress?: number;
  /** Up to three figures with an icon each, separated by hairlines. */
  stats?: { icon: IconName; value: string; label: string }[];
  className?: string;
}

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/** The template's ink card (`rounded-[1.75rem] bg-slate-950 text-white`): it is dark in both themes. */
export function DarkStatCard({ label, value, aside, progress, stats, className }: DarkStatCardProps) {
  const { colors } = useTheme();
  const percent = progress === undefined ? undefined : clamp(progress);

  return (
    <View className={cx('rounded-card bg-slate-950 p-5 shadow-2xl', className)}>
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-manrope-semibold text-slate-400">{label}</Text>
          <Text className="mt-1 text-3xl font-manrope-extrabold tracking-tight text-white">{value}</Text>
        </View>
        {aside ? (
          <View className="rounded-xl bg-white/10 px-3 py-2">
            <Text className="text-right text-micro font-manrope-bold uppercase tracking-wider text-slate-400">
              {aside.label}
            </Text>
            <Text className="text-right text-sm font-manrope-extrabold text-accent">{aside.value}</Text>
          </View>
        ) : null}
      </View>
      {percent !== undefined ? (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={aside?.label ?? label}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
        >
          <View className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </View>
      ) : null}
      {stats && stats.length > 0 ? (
        <View className="mt-4 flex-row">
          {stats.map((stat, index) => (
            <View
              key={stat.label}
              accessible
              accessibilityLabel={`${stat.label}: ${stat.value}`}
              className={cx('flex-1', index > 0 && 'border-l border-white/10 pl-4')}
            >
              <View className="mb-1">
                <Icon name={stat.icon} size={16} color={colors.accent} />
              </View>
              <Text className="text-sm font-manrope-extrabold text-white">{stat.value}</Text>
              <Text className="text-micro text-slate-400">{stat.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
