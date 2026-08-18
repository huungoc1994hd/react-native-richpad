import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useRichTheme } from '../context/ThemeContext';

/** iOS standard picker row height. */
const DEFAULT_ITEM_HEIGHT = 44;
const DEFAULT_VISIBLE_COUNT = 5;

/**
 * Momentum projection at release, in seconds: landing = offset + velocity * k.
 * 0.1s matches UIScrollViewDecelerationRateFast, so a flick travels the iOS distance.
 */
const PROJECTION_S = 0.1;
/**
 * Slightly overdamped: one continuous curve from finger-up to detent. Why not a
 * ScrollView — Android's snapToInterval truncates the fling into a two-phase stop.
 */
const SNAP_SPRING = { mass: 1, stiffness: 220, damping: 34 } as const;
/** Drag resistance divisor past the first/last item (iOS rubber-band feel). */
const RUBBER_FACTOR = 3;

export interface WheelPickerProps {
  /** Ordered selectable values; rendered via String(value). */
  items: number[];
  /** Currently selected value (controlled). */
  value: number;
  /** Fired once per settle when the centered value changes. */
  onChange: (value: number) => void;
  itemHeight?: number;
  /** Odd number of visible rows; wheel height = itemHeight * visibleCount. */
  visibleCount?: number;
}

interface WheelItemProps {
  label: string;
  index: number;
  itemHeight: number;
  offset: SharedValue<number>;
  color: string;
}

/**
 * One wheel row. Separate component so useAnimatedStyle isn't called in a loop;
 * dimming/scaling read the shared offset on the UI thread, no JS per frame.
 */
const WheelItem = ({ label, index, itemHeight, offset, color }: WheelItemProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    // Item `index` is centered at offset = index * itemHeight.
    const inputRange = [
      (index - 2) * itemHeight,
      (index - 1) * itemHeight,
      index * itemHeight,
      (index + 1) * itemHeight,
      (index + 2) * itemHeight,
    ];
    return {
      opacity: interpolate(
        offset.value,
        inputRange,
        [0.25, 0.45, 1, 0.45, 0.25],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          scale: interpolate(
            offset.value,
            inputRange,
            [0.82, 0.9, 1, 0.9, 0.82],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <Animated.View style={[styles.item, { height: itemHeight }, animatedStyle]}>
      <Text style={[styles.itemText, { color }]}>{label}</Text>
    </Animated.View>
  );
};

/**
 * iOS-style wheel with self-owned physics, identical on both platforms: a Pan gesture
 * drives a shared value and release projects the momentum onto the nearest detent.
 */
export const WheelPicker = ({
  items,
  value,
  onChange,
  itemHeight = DEFAULT_ITEM_HEIGHT,
  visibleCount = DEFAULT_VISIBLE_COUNT,
}: WheelPickerProps) => {
  const theme = useRichTheme();
  const wheelHeight = itemHeight * visibleCount;
  // Symmetric: first/last can reach the band, and item i centers at i * itemHeight.
  const padding = (wheelHeight - itemHeight) / 2;
  const maxOffset = (items.length - 1) * itemHeight;

  const offset = useSharedValue(Math.max(0, items.indexOf(value)) * itemHeight);
  const dragStart = useSharedValue(0);
  /** True once the pan actually activated (moved) — distinguishes drags from taps. */
  const dragging = useSharedValue(false);
  /** Last value delivered to onChange — guards echo loops and duplicate settles. */
  const lastReported = useSharedValue(value);

  const clampIndex = (i: number): number => {
    'worklet';
    return Math.min(items.length - 1, Math.max(0, i));
  };

  const rubber = (x: number): number => {
    'worklet';
    if (x < 0) return x / RUBBER_FACTOR;
    if (x > maxOffset) return maxOffset + (x - maxOffset) / RUBBER_FACTOR;
    return x;
  };

  /** Spring to a detent; commit its value once the spring truly finishes. */
  const settleTo = (index: number, velocity: number): void => {
    'worklet';
    const target = index * itemHeight;
    offset.value = withSpring(target, { ...SNAP_SPRING, velocity }, finished => {
      // A spring interrupted by a new touch reports finished=false; the next
      // gesture's own settle commits instead.
      if (!finished) return;
      const next = items[index];
      if (next !== undefined && next !== lastReported.value) {
        lastReported.value = next;
        runOnJS(onChange)(next);
      }
    });
  };

  const pan = Gesture.Pan()
    .onBegin(() => {
      // Catch a moving wheel where it is, like grabbing a spinning UIPickerView.
      cancelAnimation(offset);
      dragStart.value = offset.value;
      dragging.value = false;
    })
    .onStart(() => {
      dragging.value = true;
    })
    .onUpdate(e => {
      offset.value = rubber(dragStart.value - e.translationY);
    })
    .onEnd(e => {
      const v = -e.velocityY;
      const projected = offset.value + v * PROJECTION_S;
      settleTo(clampIndex(Math.round(projected / itemHeight)), v);
    })
    .onFinalize(e => {
      // Pan never activated → tap-to-select; also stops the wheel resting between detents.
      if (dragging.value) return;
      const contentY = e.y - padding + offset.value;
      settleTo(clampIndex(Math.floor(contentY / itemHeight)), 0);
    });

  // External value change (not an echo of our own onChange) → animate to it.
  useEffect(() => {
    if (value === lastReported.value) return;
    lastReported.value = value;
    const idx = Math.max(0, items.indexOf(value));
    offset.value = withSpring(idx * itemHeight, SNAP_SPRING);
  }, [value, items, itemHeight, offset, lastReported]);

  /** Accessibility increment/decrement: move one detent and report immediately. */
  const stepBy = (delta: number) => {
    if (items.length === 0) return;
    const idx = Math.max(0, items.indexOf(lastReported.value));
    const next = Math.min(items.length - 1, Math.max(0, idx + delta));
    if (next === idx) return;
    const nextValue = items[next];
    if (nextValue === undefined) return;
    lastReported.value = nextValue;
    onChange(nextValue);
    offset.value = withSpring(next * itemHeight, SNAP_SPRING);
  };

  const columnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: padding - offset.value }],
  }));

  return (
    // Gestures inside a plain RN Modal need their own root on Android. The height
    // style is mandatory: the root defaults to flex:1 and would collapse the wheel.
    <GestureHandlerRootView style={{ height: wheelHeight }}>
      <GestureDetector gesture={pan}>
        <View
          style={[styles.wheel, { height: wheelHeight }]}
          accessible
          accessibilityRole="adjustable"
          accessibilityValue={{ text: String(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={e => stepBy(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        >
          {/* Selection band; rendered first so it sits under the transparent rows. */}
          <View
            pointerEvents="none"
            style={[
              styles.selectionBand,
              {
                top: padding,
                height: itemHeight,
                backgroundColor: theme.toolbar.itemActiveBackground,
              },
            ]}
          />
          <Animated.View style={columnStyle}>
            {items.map((n, i) => (
              <WheelItem
                key={n}
                label={String(n)}
                index={i}
                itemHeight={itemHeight}
                offset={offset}
                color={theme.toolbar.text}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  wheel: {
    overflow: 'hidden',
  },
  selectionBand: {
    position: 'absolute',
    left: 8,
    right: 8,
    borderRadius: 8,
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 22,
    fontWeight: '700',
    // Android's font ascender padding pushes digits off-center; match iOS.
    includeFontPadding: false,
  },
});
