import { Pressable, View } from 'react-native';

import { cx } from './cx';
import { Text } from './Text';

export interface SegmentedControlProps<T extends string> {
  /** Names the group for screen readers ("Appearance"). */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Pick one of a few options side by side (theme: system / light / dark; language). */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className={cx('flex-row rounded-2xl bg-slate-100 p-1 dark:bg-slate-800', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            className={cx(
              'min-h-[44px] flex-1 items-center justify-center rounded-xl px-2',
              selected && 'bg-slate-950 dark:bg-white',
            )}
          >
            <Text
              className={cx(
                'text-xs',
                selected
                  ? 'font-manrope-extrabold text-white dark:text-slate-950'
                  : 'font-manrope-bold text-slate-500 dark:text-slate-400',
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
