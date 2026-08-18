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
 * iOS's own keyboard spring, so the slide settles exactly when the keyboard does.
 * NOT withTiming(e.duration): iOS reports ~250ms for a spring that takes ~500ms.
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
 * Keyboard height/progress shared values that follow the keyboard, including when
 * the focused input lives inside a WebView. Convention matches keyboard-controller.
 */
export const useKeyboardSlide = (): KeyboardSlide => {
  const height = useSharedValue(0);
  const progress = useSharedValue(0);

  useKeyboardHandler(
    {
      onStart: e => {
        'worklet';
        // Destination only — a safety net that onMove/onInteractive override
        // frame-for-frame. Re-firing toward a target already reached is a no-op.
        if (IS_IOS) {
          height.value = withSpring(-e.height, IOS_KEYBOARD_SPRING);
          progress.value = withSpring(e.progress, IOS_KEYBOARD_SPRING);
          return;
        }
        // Android fallback for OEM/IME pairs that emit no per-frame stream; its
        // reported duration matches the real animation, so a timing is accurate.
        const config = { duration: e.duration };
        height.value = withTiming(-e.height, config);
        progress.value = withTiming(e.progress, config);
      },
      onMove: e => {
        'worklet';
        // Real per-frame position, and why the toolbar never leads the keyboard.
        // keyboard-controller drops this stream on iOS, so consume the raw event.
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
