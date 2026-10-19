import { Pressable, View } from 'react-native';

import { Icon, type IconName } from '../icons/Icon';
import { cx } from './cx';

export interface IconButtonProps {
  icon: IconName;
  /** What the button does, read by screen readers; an icon alone says nothing. */
  label: string;
  onPress?: () => void;
  /** The lime unread dot on the corner (the notifications bell). */
  dot?: boolean;
  accessibilityHint?: string;
  className?: string;
}

/** The template's round header button: 44×44, white with a hairline border, slate-800 in dark mode. */
export function IconButton({ icon, label, onPress, dot = false, accessibilityHint, className }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className={cx(
        'h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm active:opacity-70 dark:border-slate-700 dark:bg-slate-800',
        className,
      )}
    >
      <Icon name={icon} />
      {dot ? (
        <View className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full border-2 border-white bg-accent dark:border-slate-800" />
      ) : null}
    </Pressable>
  );
}
