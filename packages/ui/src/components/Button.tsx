import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';

import { Icon, type IconName } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { raw } from '../theme/tokens.js';
import { cx } from './cx';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'accent' | 'ghost' | 'destructive';
export type ButtonSize = 'md' | 'sm';

const VARIANT: Record<ButtonVariant, { container: string; label: string }> = {
  // The template's ink button; in dark mode it flips to white so it does not vanish into the slate-950 page.
  primary: { container: 'bg-slate-950 dark:bg-white', label: 'text-white dark:text-slate-950' },
  accent: { container: 'bg-accent', label: 'text-slate-950' },
  ghost: {
    container: 'border border-slate-200 bg-transparent dark:border-slate-700',
    label: 'text-slate-800 dark:text-white',
  },
  destructive: { container: 'bg-red-600', label: 'text-white' },
};

const SIZE: Record<ButtonSize, { container: string; label: string }> = {
  md: { container: 'min-h-[52px] rounded-2xl px-5 py-3.5', label: 'text-sm' },
  // The template's "Go offline" button.
  sm: { container: 'min-h-[44px] rounded-xl px-4 py-3', label: 'text-xs' },
};

export interface ButtonProps {
  label: string;
  /** May return a promise: the button then stays busy until it settles, so a second tap cannot send the request twice. */
  onPress?: () => void | Promise<unknown>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A request is in flight: shows a spinner and ignores taps. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: IconName;
  accessibilityHint?: string;
  className?: string;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  accessibilityHint,
  className,
}: ButtonProps) {
  const { colors, scheme } = useTheme();
  const [pending, setPending] = useState(false);
  // A ref, not state: two taps in the same frame must both see the lock.
  const locked = useRef(false);
  const busy = loading || pending;
  const inactive = disabled || busy;
  const styles = VARIANT[variant];
  // The colour of the label, mirrored for the spinner and the icon, which are drawn in JS.
  const contentColor =
    variant === 'ghost'
      ? colors.icon
      : variant === 'accent' || (variant === 'primary' && scheme === 'dark')
        ? colors.onAccent
        : raw.white;

  const handlePress = () => {
    if (locked.current || !onPress) {
      return;
    }

    const result = onPress();

    if (result instanceof Promise) {
      locked.current = true;
      setPending(true);
      const release = () => {
        locked.current = false;
        setPending(false);
      };
      result.then(release, release);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={handlePress}
      className={cx(
        'flex-row items-center justify-center gap-2 active:opacity-80',
        SIZE[size].container,
        styles.container,
        fullWidth && 'w-full',
        inactive && 'opacity-50',
        className,
      )}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={contentColor}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : icon ? (
        <Icon name={icon} size={18} color={contentColor} />
      ) : null}
      <Text className={cx('font-manrope-extrabold', SIZE[size].label, styles.label)}>{label}</Text>
    </Pressable>
  );
}
