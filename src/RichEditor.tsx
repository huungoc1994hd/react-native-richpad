import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleProp, StyleSheet, TextInput, ViewStyle } from 'react-native';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import { RichText } from '@10play/tentap-editor';
import { useRichEditorContext } from './context/RichEditorContext';
import { useRichTheme } from './context/ThemeContext';
import { useKeyboardSlide } from './hooks/useKeyboardSlide';
import {
  setImeOpenerListener,
  clearImeOpenerListener,
  consumeImeOpenInvitation,
} from './hooks/useEditorFocusManager';
import { getBottomChromeHeight, subscribeBottomChromeHeight } from './hooks/hostChrome';

const IS_ANDROID = Platform.OS === 'android';
// Read outside the worklet: naming `Platform` inside one captures the whole module
// into its closure.
const IS_IOS = Platform.OS === 'ios';

/**
 * Ceiling for one getHTML() round-trip. The WebView transport resolves but never
 * rejects, so a reloaded, crashed or unmounted WebView needs a deadline here.
 */
const GET_HTML_TIMEOUT_MS = 5000;

export interface RichEditorRef {
  /**
   * Current document HTML. Rejects with `Error('richpad: getHTML timed out')`
   * when the WebView does not answer within 5s.
   */
  getHTML(): Promise<string>;
  setContent(html: string): void;
  /**
   * Focus the editor and raise the keyboard, via the focus manager: delayed by
   * REFOCUS_DELAY_MS and skipped while focus is suspended.
   */
  focus(): void;
  /** Blur and dismiss the keyboard — resigns the native responder, not just DOM focus. */
  blur(): void;
  insertImage(src: string): void;
  clearContent(): void;
}

export interface RichEditorProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * The editor WebView. Must be rendered inside <RichEditorProvider>. On iOS it reserves
 * the keyboard height plus the measured bottom toolbar as padding.
 */
export const RichEditor = forwardRef<RichEditorRef, RichEditorProps>(({ style }, ref) => {
  const {
    editor,
    focusManager,
    handleWebViewLoad,
    handleWebViewTerminated,
    webviewGeneration,
    keyboardOffset,
    bottomInset,
  } = useRichEditorContext();
  const theme = useRichTheme();
  const background = theme.editor.backgroundColor;

  useImperativeHandle(
    ref,
    () => ({
      getHTML: () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        return Promise.race([
          editor.getHTML(),
          new Promise<string>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('richpad: getHTML timed out')),
              GET_HTML_TIMEOUT_MS,
            );
          }),
        ]).finally(() => clearTimeout(timer));
      },
      setContent: (html: string) => editor.setContent(html),
      // focus/blur route through the focus manager, not editor.focus()/blur() —
      // see the semantics documented on RichEditorRef.
      focus: () => focusManager.requestFocus(),
      blur: () => focusManager.dismissKeyboard(),
      insertImage: (src: string) => editor.insertImage(src),
      clearContent: () => editor.setContent(''),
    }),
    [editor, focusManager],
  );

  // The bar's MEASURED height: a constant here shows as a band of this view's
  // background between the WebView and the toolbar.
  const [chromeReserve, setChromeReserve] = useState(getBottomChromeHeight);
  useEffect(() => subscribeBottomChromeHeight(setChromeReserve), []);

  // Same keyboard source as the sticky bottom bar, so padding and toolbar move in
  // lockstep. Avoidance is iOS-only; the closed-keyboard floor is the host's inset.
  const { height: keyboardHeight, progress: keyboardProgress } = useKeyboardSlide();
  const animatedStyle = useAnimatedStyle(() => {
    const kb = -keyboardHeight.value;
    const insetFloor = interpolate(keyboardProgress.value, [0, 1], [bottomInset, 0]);
    return {
      paddingBottom: IS_IOS && kb > 0 ? kb + chromeReserve + keyboardOffset : insetFloor,
    };
  }, [chromeReserve, keyboardOffset, bottomInset]);

  // Android raises the IME only for a native input taking focus. The opener must stay
  // MOUNTED for the editor's lifetime: unmounting it focused makes RN hide the keyboard.
  const imeOpenerRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!IS_ANDROID) return undefined;
    const openIme = () => imeOpenerRef.current?.focus();
    setImeOpenerListener(openIme);
    return () => clearImeOpenerListener(openIme);
  }, []);

  const handleImeOpenerFocus = () => {
    // Only an INVITED focus runs the dance: Android's focus search can land here on
    // its own, and that must not touch the keyboard or DOM focus.
    if (!consumeImeOpenInvitation()) {
      imeOpenerRef.current?.blur();
      return;
    }
    // Keyboard is up and owned by this input: return DOM focus to whichever host owns
    // the session, then hand the input connection to the WebView.
    editor.restoreInputFocus();
    editor.webviewRef?.current?.requestFocus?.();
  };

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: background }, animatedStyle, style]}
    >
      <RichText
        // Remount on renderer death: a WebView whose process was killed is a dead
        // view, not a reloadable one.
        key={`richpad-webview-${webviewGeneration}`}
        editor={editor}
        onLoad={handleWebViewLoad}
        onRenderProcessGone={handleWebViewTerminated}
        onContentProcessDidTerminate={handleWebViewTerminated}
        style={{ backgroundColor: background }}
      />
      {IS_ANDROID && (
        <TextInput ref={imeOpenerRef} style={styles.imeOpener} onFocus={handleImeOpenerFocus} />
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 200,
  },
  imeOpener: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});

RichEditor.displayName = 'RichEditor';
