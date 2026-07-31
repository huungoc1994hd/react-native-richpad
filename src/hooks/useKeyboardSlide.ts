import { Platform } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import {
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
  type WithSpringConfig,
} from 'react-native-reanimated';

const IS_IOS = Platform.OS === 'ios';

/**
 * iOS's own keyboard spring (CASpringAnimation, unchanged since iOS 8). Driving
 * the slide with these constants makes it settle exactly when the keyboard
 * settles, with no duration to guess.
 *
 * Do NOT switch to withTiming(e.duration): iOS reports a nominal ~250ms
 * (UIKeyboardAnimationDurationUserInfoKey) while the real overdamped spring
 * takes ~500ms, so a linear ramp outruns the keyboard and opens a gap under the
 * toolbar.
 *
 * Do NOT add `duration` or `dampingRatio` — either puts withSpring into
 * duration-mode, which ignores stiffness/damping/mass. Leave rest detection at
 * the default: on Reanimated 4 it is a relative `energyThreshold`, so the height
 * and progress springs settle in lockstep, and the config stays valid on
 * Reanimated 3 (peer minimum), whose `SpringConfig` has no `energyThreshold`.
 */
const IOS_KEYBOARD_SPRING: WithSpringConfig = {
  stiffness: 1000,
  damping: 500,
  mass: 3,
  velocity: 0, // the keyboard starts from rest
  overshootClamping: false, // overdamped — it cannot overshoot anyway
};

export interface KeyboardSlide {
  /** 0 (closed) → -keyboardHeight (open). Matches keyboard-controller's convention. */
  height: SharedValue<number>;
  /** 0 (closed) → 1 (open). */
  progress: SharedValue<number>;
}

/**
 * Keyboard `height`/`progress` shared values that slide in lockstep with the
 * keyboard, including when the focused input lives inside a WebView (iOS).
 *
 * Convention matches keyboard-controller's `useReanimatedKeyboardAnimation`, so
 * `translateY = height + interpolate(progress, [0, 1], [closed, opened])`
 * reproduces `KeyboardStickyView` and `paddingBottom = -height` reproduces the
 * editor's keyboard-avoiding padding. `useKeyboardHandler` sets Android resize
 * mode on mount, same as `useReanimatedKeyboardAnimation`.
 */
export const useKeyboardSlide = (): KeyboardSlide => {
  const height = useSharedValue(0);
  const progress = useSharedValue(0);

  useKeyboardHandler(
    {
      onStart: e => {
        'worklet';
        // Destination values: initial push plus safety net, overridden
        // frame-for-frame by onMove/onInteractive as soon as they fire.
        // e.duration is intentionally ignored on iOS (see IOS_KEYBOARD_SPRING).
        // Re-firing toward an already-reached target (the iOS 16+ simulator's
        // spurious per-keystroke willShow, duration 0) is a harmless no-op.
        if (IS_IOS) {
          height.value = withSpring(-e.height, IOS_KEYBOARD_SPRING);
          progress.value = withSpring(e.progress, IOS_KEYBOARD_SPRING);
          return;
        }
        // Android fallback for OEM/IME combinations that emit no per-frame
        // stream. Unlike iOS, Android's reported duration matches the real
        // animation, so a plain timing is accurate.
        const config = { duration: e.duration };
        height.value = withTiming(-e.height, config);
        progress.value = withTiming(e.progress, config);
      },
      onMove: e => {
        'worklet';
        // Real per-frame keyboard position, and the reason the toolbar never
        // leads the keyboard (gap opening under the bar). Fires on Android and —
        // measured — on iOS during a WebView open (~50fps over the real ~600ms);
        // keyboard-controller drops that iOS stream from its own shared values,
        // but the raw event still fires, so consume it directly. Overrides the
        // onStart animation on both platforms, simulator included.
        height.value = -e.height;
        progress.value = e.progress;
      },
      onInteractive: e => {
        'worklet';
        // Real per-frame position: iOS close + drag-to-dismiss (and Android
        // interactive). Cancels any in-flight onStart animation.
        height.value = -e.height;
        progress.value = e.progress;
      },
    },
    [],
  );

  return { height, progress };
};
