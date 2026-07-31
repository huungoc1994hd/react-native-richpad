import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, StyleProp, StyleSheet, TextInput, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { RichText } from '@10play/tentap-editor';
import { useRichEditorContext } from './context/RichEditorContext';
import { useRichTheme } from './context/ThemeContext';
import { useKeyboardSlide } from './hooks/useKeyboardSlide';
import { setImeOpenerListener, clearImeOpenerListener } from './hooks/useEditorFocusManager';

const IS_ANDROID = Platform.OS === 'android';
// Read outside the worklet below: a worklet that names `Platform` captures the
// whole module into its closure, so Reanimated serializes seven native-backed
// accessors to the UI runtime instead of one boolean.
const IS_IOS = Platform.OS === 'ios';

/**
 * Ceiling for one getHTML() round-trip. The WebView transport resolves but never
 * rejects, so a reloaded, crashed or unmounted WebView needs a deadline here.
 */
const GET_HTML_TIMEOUT_MS = 5000;

/** Imperative handle exposed on the <RichEditor> ref. */
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
 * The editor WebView. Must be rendered inside <RichEditorProvider>. On iOS it
 * reserves bottom padding equal to the keyboard height plus the configured
 * offset, so content never hides behind the keyboard or the sticky bottom bar.
 */
export const RichEditor = forwardRef<RichEditorRef, RichEditorProps>(({ style }, ref) => {
  const { editor, focusManager, handleWebViewLoad, keyboardOffset } = useRichEditorContext();
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

  // Same keyboard source as the sticky bottom bar (useKeyboardSlide), so padding
  // and toolbar move in lockstep on open and close. height is NEGATIVE
  // (0 → -keyboardHeight). iOS only; Android resizes the window (adjustResize).
  const { height: keyboardHeight } = useKeyboardSlide();
  const animatedStyle = useAnimatedStyle(() => {
    const kb = -keyboardHeight.value;
    return {
      paddingBottom: IS_IOS && kb > 0 ? kb + keyboardOffset : 0,
    };
  });

  // Android IME opener — the only way to raise the soft keyboard from JS (see
  // setImeOpenerListener). It must stay MOUNTED for the editor's whole lifetime:
  // unmounting a focused TextInput makes RN issue an explicit hideSoftInput, which
  // Android honours over the WebView's implicit "new input attached" show — a
  // mount/unmount helper closes the keyboard it just opened. Losing focus to the
  // WebView is fine — only clearFocus/unmount hides the keyboard.
  const imeOpenerRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!IS_ANDROID) return undefined;
    const openIme = () => imeOpenerRef.current?.focus();
    setImeOpenerListener(openIme);
    return () => clearImeOpenerListener(openIme);
  }, []);

  const handleImeOpenerFocus = () => {
    // Keyboard is up and owned by this input. Re-assert the caret so the WebView
    // answers Android's input-connection query as editable, then hand focus over.
    editor.focus(null);
    editor.webviewRef?.current?.requestFocus?.();
  };

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: background }, animatedStyle, style]}
    >
      <RichText
        editor={editor}
        onLoad={handleWebViewLoad}
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
