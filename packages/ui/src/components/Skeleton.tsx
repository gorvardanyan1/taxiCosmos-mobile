import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { cx } from './cx';

export interface SkeletonProps {
  /** Size and shape through classes (`h-4 w-32`, `h-24 rounded-card`). */
  className?: string;
  /** Read out by screen readers; leave it off when a parent already says the screen is loading. */
  label?: string;
}

/** A pulsing placeholder while content loads. Stands still for people who turned animations off. */
export function Skeleton({ className, label }: SkeletonProps) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!active || reduced) {
        return;
      }

      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.45,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });

    return () => {
      active = false;
      loop?.stop();
    };
  }, [opacity]);

  return (
    <View
      accessible={label !== undefined}
      accessibilityLabel={label}
      accessibilityState={label === undefined ? undefined : { busy: true }}
      importantForAccessibility={label === undefined ? 'no-hide-descendants' : 'yes'}
      className={cx('overflow-hidden rounded-xl', className)}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity, backgroundColor: colors.skeleton }]} />
    </View>
  );
}
