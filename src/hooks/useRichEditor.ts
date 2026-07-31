import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { KeyboardEvents } from 'react-native-keyboard-controller';
import { useEditorBridge, TenTapStartKit, EditorBridge, BridgeState } from '@10play/tentap-editor';
import { customEditorHtml } from '../webview/generated/editorHtml';
import {
  AlignBridge,
  FontSizeBridge,
  TableBridge,
  MediaBridge,
  ConfigBridge,
  SearchBridge,
  FormatBridge,
  setImageToolkitActiveListener,
  clearImageToolkitActiveListener,
} from '../bridges/customBridges';
import { EditorConfig, EditorLabels, EditorMetrics } from '../protocol';
import {
  useEditorFocusManager,
  EditorFocusManager,
  FocusSuspendReason,
} from './useEditorFocusManager';
import type { RichTheme, RichThemePartial, RichEditorLabels, HeadingOption } from '../theme/types';
import { resolveTheme } from '../theme/resolve';
import { resolveLocale, type LocaleOption } from '../locale';

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_KEYBOARD_OFFSET = 60;

export interface UseRichEditorOptions {
  /**
   * Initial HTML content — read ONCE when the WebView loads. Pass a stable
   * value; binding it to a form value re-renders the component every keystroke.
   */
  initialContent?: string;
  /** Whether the document is editable. Default true; set false for read-only views. */
  editable?: boolean;
  /** Focus the editor on load. Default false. */
  autofocus?: boolean;
  /** Extra height reserved above the keyboard (px). Default 60. */
  keyboardOffset?: number;
  /** Debounce for onChange (ms). Default 300. */
  debounceMs?: number;
  /** Theme (light/dark + toolbar/editor colors + palettes). Merged over the defaults. */
  theme?: RichThemePartial;
  /**
   * Language: a built-in code ('en' | 'vi') or a full custom RichEditorLocale.
   * Default 'en'. Drives placeholder, labels, editorLabels and headingOptions
   * unless individually overridden below.
   */
  locale?: LocaleOption;
  /** Placeholder override (falls back to the locale's placeholder). */
  placeholder?: string;
  /** React Native toolbar label overrides, merged over the locale's labels. */
  labels?: Partial<RichEditorLabels>;
  /** WebView label overrides (table actions + image caption), merged over the locale's. */
  editorLabels?: Partial<EditorLabels>;
  /** Heading menu options override (falls back to the locale's). */
  headingOptions?: HeadingOption[];
  /** Runtime size limits: image/table minimum widths. */
  metrics?: EditorMetrics;
  onReady?: (editor: EditorBridge) => void;
  /** Called (leading + trailing debounce) with the latest HTML whenever content changes. */
  onChange?: (html: string) => void;
  onFocusChanged?: (focused: boolean) => void;
  /** Raw bridge state updates (advanced). */
  onStateChange?: (state: BridgeState) => void;
  /** The user selected/deselected an image in the document (image toolkit on/off). */
  onImageInteractionChange?: (active: boolean, inCell: boolean) => void;
}

export interface RichEditorInstance {
  editor: EditorBridge;
  focusManager: EditorFocusManager;
  /** Reset the config-sent flag on WebView reload — passed to <RichText onLoad>. */
  handleWebViewLoad: () => void;
  keyboardOffset: number;
  /** Resolved theme, distributed to the toolbars by RichEditorProvider. */
  resolvedTheme: RichTheme;
  /** Resolved toolbar labels (locale + overrides), distributed by RichEditorProvider. */
  resolvedLabels: RichEditorLabels;
  /** Resolved heading menu options (locale + override), read by the top bar. */
  resolvedHeadingOptions: HeadingOption[];
}

/**
 * Builds the editor bridge (custom WebView source + custom bridges) and wires
 * the focus manager, content/state subscriptions and keyboard/image
 * notifications into one instance for the provider and toolbars.
 */
export const useRichEditor = (options: UseRichEditorOptions = {}): RichEditorInstance => {
  const {
    initialContent = '',
    editable = true,
    autofocus = false,
    keyboardOffset = DEFAULT_KEYBOARD_OFFSET,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    theme,
    locale,
    placeholder,
    labels,
    editorLabels,
    headingOptions,
    metrics,
    onReady,
    onChange,
    onFocusChanged,
    onStateChange,
    onImageInteractionChange,
  } = options;

  // Resolve the language bundle, then apply any per-field overrides on top.
  const localeBundle = useMemo(() => resolveLocale(locale), [locale]);
  const resolvedPlaceholder = placeholder ?? localeBundle.placeholder;
  const resolvedHeadingOptions = headingOptions ?? localeBundle.headingOptions;
  const resolvedLabels = useMemo(
    () => ({ ...localeBundle.labels, ...labels }),
    [localeBundle, labels],
  );

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

  // Pushed to the WebView: editor CSS-variable theme + table/caption labels.
  const webViewConfig = useMemo<EditorConfig>(
    () => ({
      theme: resolvedTheme.editor,
      labels: { ...localeBundle.editorLabels, ...editorLabels },
      metrics,
    }),
    [resolvedTheme.editor, localeBundle, editorLabels, metrics],
  );

  const customExtensions = useMemo(() => {
    return [
      ...TenTapStartKit,
      AlignBridge,
      FontSizeBridge,
      TableBridge,
      MediaBridge,
      ConfigBridge,
      SearchBridge,
      FormatBridge,
    ].map(ext => {
      if (ext.name === 'placeholder') {
        return ext.configureExtension({ placeholder: resolvedPlaceholder });
      }
      if (ext.name === 'link') {
        // tiptap's Link inherits inclusive from autolink (true), so a caret at
        // the end of a link keeps typing INTO the link with no way out. A static
        // extend value serializes through the config map fine, and type-a-URL
        // autolink still works.
        return ext.extendExtension({ inclusive: false });
      }
      return ext;
    });
  }, [resolvedPlaceholder]);

  const editor = useEditorBridge({
    autofocus,
    avoidIosKeyboard: false,
    editable,
    initialContent,
    customSource: customEditorHtml,
    bridgeExtensions: customExtensions,
  });

  const focusManager = useEditorFocusManager(editor);

  // Ref so the []-dep subscriptions below always read the latest editor.
  const editorLatestRef = useRef(editor);
  editorLatestRef.current = editor;

  // Same for callbacks, so the []-dep subscriptions below always call the latest ones.
  const callbacksRef = useRef({
    onChange,
    onFocusChanged,
    onStateChange,
    onImageInteractionChange,
  });
  callbacksRef.current = { onChange, onFocusChanged, onStateChange, onImageInteractionChange };

  const configRef = useRef(webViewConfig);
  configRef.current = webViewConfig;

  // Mirrored so the []-dep subscription below sees a changed debounceMs.
  const debounceMsRef = useRef(debounceMs);
  debounceMsRef.current = debounceMs;

  const isReadyCalledRef = useRef(false);
  const isConfigSentRef = useRef(false);
  // Serialised copy of the config the WebView holds. Identity is not a usable
  // change signal: an inline theme/metrics/editorLabels object (the documented
  // usage) rebuilds webViewConfig every render, and each push rewrites CSS
  // variables inside the WebView.
  const lastSentConfigRef = useRef<string | null>(null);
  const lastFocusStateRef = useRef(false);
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingTrailingSyncRef = useRef(false);
  const isMountedRef = useRef(true);

  // Fire onReady once.
  useEffect(() => {
    if (onReady && !isReadyCalledRef.current && editor) {
      isReadyCalledRef.current = true;
      onReady(editor);
    }
  }, [editor, onReady]);

  // Runtime editable toggle (the initial value is already passed to useEditorBridge).
  useEffect(() => {
    editorLatestRef.current?.setEditable(editable);
  }, [editable]);

  // Re-push config on a runtime theme/label change (e.g. a dark-mode toggle).
  // The FIRST push happens in the state subscription below, hence the gate.
  useEffect(() => {
    if (!isConfigSentRef.current) return;
    const serialized = JSON.stringify(webViewConfig);
    if (serialized === lastSentConfigRef.current) return;
    lastSentConfigRef.current = serialized;
    editorLatestRef.current?.setEditorConfig(webViewConfig);
  }, [webViewConfig]);

  // The RichText WebView remounts once on iOS after the first load (a tentap
  // workaround); each load is a NEW page, so any config already sent is lost.
  const handleWebViewLoad = useCallback(() => {
    isConfigSentRef.current = false;
    lastSentConfigRef.current = null;
  }, []);

  // Receive the image-toolkit state from the WebView (MediaBridge.onEditorMessage).
  useEffect(() => {
    const handleImageToolkitActive = (active: boolean, inCell: boolean) => {
      // A top-level image selection dismisses the keyboard; an in-cell one keeps
      // it (small image, the user may keep typing) and only releases the suspension.
      if (active && !inCell) {
        focusManager.suspend(FocusSuspendReason.ImageToolkit);
      } else if (active && inCell) {
        focusManager.resume(FocusSuspendReason.ImageToolkit, { refocus: false });
      } else {
        focusManager.resume(FocusSuspendReason.ImageToolkit);
      }
      // Nav-gesture part (consumer): e.g. disable swipe-back while dragging an image.
      callbacksRef.current.onImageInteractionChange?.(active, inCell);
    };
    setImageToolkitActiveListener(handleImageToolkitActive);
    return () => clearImageToolkitActiveListener(handleImageToolkitActive);
  }, [focusManager]);

  // Focus/blur handling + config push, via the native bridge subscription (no polling).
  useEffect(() => {
    if (!editor || !editor._subscribeToEditorStateUpdate) return;
    const unsubscribe = editor._subscribeToEditorStateUpdate((state: BridgeState) => {
      // A state update proves the WebView is alive — safe to push config.
      if (!isConfigSentRef.current && configRef.current) {
        isConfigSentRef.current = true;
        lastSentConfigRef.current = JSON.stringify(configRef.current);
        editorLatestRef.current?.setEditorConfig(configRef.current);
      }
      const callbacks = callbacksRef.current;
      if (state.isFocused && !lastFocusStateRef.current) {
        callbacks.onFocusChanged?.(true);
      } else if (!state.isFocused && lastFocusStateRef.current) {
        callbacks.onFocusChanged?.(false);
      }
      lastFocusStateRef.current = !!state.isFocused;
      callbacks.onStateChange?.(state);
    });
    return unsubscribe;
    // Subscribe ONCE per component life: useEditorBridge's subscribers array is
    // a stable ref even though the editor object changes identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync content leading + trailing: the first keystroke syncs immediately (Save
  // lights up without waiting), the rest of the window collapses into one
  // trailing sync. content-update fires on document change only, not selection.
  useEffect(() => {
    if (!editor || !editor._subscribeToContentUpdate) return;
    // Re-armed here, not only at useRef(true): StrictMode mounts, runs the
    // cleanup below, then mounts again with the same refs.
    isMountedRef.current = true;

    const syncContent = async () => {
      try {
        const html = await editorLatestRef.current?.getHTML();
        // getHTML() is a round-trip; the screen may have popped while it was in
        // flight, and onChange must not outlive the editor.
        if (html !== undefined && isMountedRef.current) {
          callbacksRef.current.onChange?.(html);
        }
      } catch {
        // tentap's async-message table has no reject path, so this only catches
        // a synchronous throw from posting to a WebView that is already gone. A
        // lost round-trip simply never settles.
      }
    };

    const unsubscribe = editor._subscribeToContentUpdate(() => {
      if (!callbacksRef.current.onChange) return;

      if (contentTimerRef.current) {
        hasPendingTrailingSyncRef.current = true;
        return;
      }
      void syncContent();
      contentTimerRef.current = setTimeout(() => {
        contentTimerRef.current = null;
        if (hasPendingTrailingSyncRef.current) {
          hasPendingTrailingSyncRef.current = false;
          void syncContent();
        }
      }, debounceMsRef.current);
    });

    return () => {
      isMountedRef.current = false;
      if (contentTimerRef.current) {
        clearTimeout(contentTimerRef.current);
        contentTimerRef.current = null;
      }
      unsubscribe();
    };
    // Subscribe ONCE per component life, like the state subscription above;
    // everything inside reads editorLatestRef, so a new identity is picked up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tell the WebView the obscured height so it keeps the cursor above the
  // keyboard, only while the editor is focused (a host TextInput's keyboard must
  // not scroll the editor). Uses KeyboardEvents because RN's own Keyboard
  // will-events are iOS-only. Android consumers must set
  // android:windowSoftInputMode="adjustResize" and mount KeyboardProvider.
  useEffect(() => {
    const showSub = KeyboardEvents.addListener('keyboardWillShow', e => {
      if (!lastFocusStateRef.current) return;
      const duration = e.duration || 250;
      // How much of the WebView's own viewport is covered. Do NOT add e.height
      // on Android: adjustResize has already shrunk the window, so the WebView's
      // innerHeight excludes the keyboard and adding it double-counts — the
      // editor over-scrolls and popovers clamp far too high. Only the RN bottom
      // bar still covers content there.
      const obscuredHeight = Platform.OS === 'android' ? keyboardOffset : e.height + keyboardOffset;
      editorLatestRef.current?.notifyKeyboardWillShow({ height: obscuredHeight, duration });
    });
    // height 0 = keyboard closed — the WebView uses this to unpin popover positions.
    const hideSub = KeyboardEvents.addListener('keyboardWillHide', e => {
      editorLatestRef.current?.notifyKeyboardWillShow({ height: 0, duration: e.duration || 250 });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);

  return useMemo<RichEditorInstance>(
    () => ({
      editor,
      focusManager,
      handleWebViewLoad,
      keyboardOffset,
      resolvedTheme,
      resolvedLabels,
      resolvedHeadingOptions,
    }),
    [
      editor,
      focusManager,
      handleWebViewLoad,
      keyboardOffset,
      resolvedTheme,
      resolvedLabels,
      resolvedHeadingOptions,
    ],
  );
};
