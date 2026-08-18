import { Platform } from 'react-native';

/**
 * The one piece of geometry the page cannot see: a native host view covering the
 * WebView. Module scope, like the IME opener — one editor at a time.
 */
let bottomChromeHeight = 0;
const listeners = new Set<(height: number) => void>();

const IS_IOS = Platform.OS === 'ios';

/** Reported by RichEditorBottomBar from its own onLayout (bar + bottomOffset). */
export const setBottomChromeHeight = (height: number): void => {
  const next = Math.max(0, Math.round(height));
  if (next === bottomChromeHeight) return;
  bottomChromeHeight = next;
  listeners.forEach(listener => listener(next));
};

/**
 * MEASURED height of the host's bottom toolbar. RichEditor reserves exactly this above
 * the keyboard on iOS; a constant instead leaves a band of host background showing.
 */
export const getBottomChromeHeight = (): number => bottomChromeHeight;

export const subscribeBottomChromeHeight = (listener: (height: number) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * How much of the WebView's bottom the host's chrome covers: 0 with the keyboard down,
 * and 0 on iOS, where the reserve already accounts for it.
 */
export const getHostChromeOverlap = (keyboardOpen: boolean): number =>
  !keyboardOpen || IS_IOS ? 0 : bottomChromeHeight;
