import { Text as NativeText, type TextProps } from 'react-native';

import { cx } from './cx';

/** Text in Manrope. Pass a `font-manrope-*` class (regular, medium, semibold, bold, extrabold) for another weight. */
export function Text({ className, ...props }: TextProps) {
  return <NativeText {...props} className={cx(!className?.includes('font-manrope') && 'font-manrope', className)} />;
}
