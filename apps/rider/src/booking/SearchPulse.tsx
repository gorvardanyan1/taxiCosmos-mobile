import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

const RINGS = 3;
const CYCLE_MS = 2400;

/**
 * The animated search radius over the map: rings that grow from the pickup and fade, one after another. It is decoration (hidden from screen
 * readers, which get the "Looking for a driver" title), and it stands still, as one faint ring, when the phone asks for reduced motion.
 */
export function SearchPulse() {
  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setReduceMotion(enabled);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      return undefined;
    }

    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();

    return () => loop.stop();
  }, [progress, reduceMotion]);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0 items-center justify-center"
    >
      {reduceMotion ? (
        <View className="h-40 w-40 rounded-full border-2 border-accent bg-accent/20" />
      ) : (
        Array.from({ length: RINGS }, (_, ring) => {
          const offset = ring / RINGS;
          // Each ring runs the same cycle a third of it later.
          const phase = Animated.modulo(Animated.add(progress, 1 - offset), 1);

          return (
            <Animated.View
              key={ring}
              className="absolute h-64 w-64 rounded-full border-2 border-accent bg-accent/20"
              style={{
                opacity: phase.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.7, 0.1, 0] }),
                transform: [{ scale: phase.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }) }],
              }}
            />
          );
        })
      )}
    </View>
  );
}
