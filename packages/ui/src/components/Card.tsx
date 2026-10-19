import { View, type ViewProps } from 'react-native';

import { cx } from './cx';

export interface CardProps extends ViewProps {
  /** `raised` is the template's big card (`rounded-[1.75rem]`); `outlined` is the hairline-bordered box that wraps lists. */
  variant?: 'raised' | 'outlined';
  className?: string;
}

export function Card({ variant = 'raised', className, ...props }: CardProps) {
  return (
    <View
      {...props}
      className={cx(
        variant === 'raised'
          ? 'rounded-card bg-white p-5 dark:bg-slate-900'
          : 'overflow-hidden rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
    />
  );
}
