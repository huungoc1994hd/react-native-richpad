import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  CodeBlockBridge,
  setImageToolkitActiveListener,
  clearImageToolkitActiveListener,
  setEditorMountedListener,
  clearEditorMountedListener,
} from '../bridges/customBridges';
import { EditorConfig, EditorLabels, EditorMetrics } from '../protocol';
import { useInputOwnership } from './useInputOwnership';
import { getHostChromeOverlap } from './hostChrome';
import { useEditorFocusManager, type EditorFocusManager } from './useEditorFocusManager';
import type { RichTheme, RichThemePartial, RichEditorLabels, HeadingOption } from '../theme/types';
import { resolveTheme } from '../theme/resolve';
import { resolveLocale, type LocaleOption } from '../locale';

const DEFAULT_DEBOUNCE_MS = 300;
const DEFAULT_KEYBOARD_OFFSET = 0;

export interface UseRichEditorOptions {
  /**
   * Initial HTML content — read ONCE when the WebView loads. Pass a stable
   * value; binding it to a form value re-renders the component every keystroke.
   */
  initialContent?: string;
  /** Whether the document is editable. Default true; set false for read-only views. */
  editable?: boolean;
  /**
   * Focus the editor on load, caret at the START of the document. Default false.
   * The keyboard opens with it; the view does not scroll anywhere.
   */
  autofocus?: boolean;
  /**
   * EXTRA height reserved above the keyboard (px), on top of the bottom toolbar,
   * whose measured height is already reserved. Default 0.
   */
  keyboardOffset?: number;
  /**
   * Host chrome below the editor while the keyboard is CLOSED (px) — the safe-area
   * bottom inset on an edge-to-edge app. Default 0.
   */
  bottomInset?: number;
  /** Debounce for onChange (ms). Default 300. */
  debounceMs?: number;
  /** Theme (light/dark + toolbar/editor colors + palettes). Merged over the defaults. */
  theme?: RichThemePartial;
  /** Language: 'en' | 'vi' or a full RichEditorLocale. Default 'en'. */
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
  onStateChange?: (state: BridgeState) => void;
  /** The user selected/deselected an image in the document (image toolkit on/off). */
  onImageInteractionChange?: (active: boolean, inCell: boolean) => void;
}

export interface RichEditorInstance {
  editor: EditorBridge;
  focusManager: EditorFocusManager;
  /**
   * An image caption holds the keyboard; the toolbars disable formatting while it
   * does, since every tiptap command runs chain().focus() and would steal it.
   */
  captionFocused: boolean;
  /** An image session is open (image selected, or its caption being typed). */
  imageSessionActive: boolean;
  /**
   * End the image session WITHOUT refocusing the editor, before a host control takes
   * the keyboard. Wait for imageSessionActive to turn false before mounting it.
   */
  leaveImageSession: () => void;
  /**
   * The host control released the keyboard — ownership returns to the editor. Call it
   * explicitly: a path that never reaches the editor would strand ownership there.
   */
  releaseHostInput: () => void;
  /** Passed to <RichText onLoad>; restores the document after a renderer crash. */
  handleWebViewLoad: () => void;
  /** The WebView renderer died — remounts it and restores content. For <RichEditor>. */
  handleWebViewTerminated: () => void;
  /** Remount key for the WebView, bumped by handleWebViewTerminated. For <RichEditor>. */
  webviewGeneration: number;
  keyboardOffset: number;
  bottomInset: number;
  resolvedTheme: RichTheme;
  resolvedLabels: RichEditorLabels;
  resolvedHeadingOptions: HeadingOption[];
}

/**
 * Builds the editor bridge and wires the focus manager, subscriptions and keyboard
 * reporting into one instance for the provider and toolbars.
 */
export const useRichEditor = (options: UseRichEditorOptions = {}): RichEditorInstance => {
  const {
    initialContent = '',
    editable = true,
    autofocus = false,
    keyboardOffset = DEFAULT_KEYBOARD_OFFSET,
    bottomInset = 0,
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

  const localeBundle = useMemo(() => resolveLocale(locale), [locale]);
  const resolvedPlaceholder = placeholder ?? localeBundle.placeholder;
  const resolvedHeadingOptions = headingOptions ?? localeBundle.headingOptions;
  const resolvedLabels = useMemo(
    () => ({ ...localeBundle.labels, ...labels }),
    [localeBundle, labels],
  );

  const resolvedTheme = useMemo(() => resolveTheme(theme), [theme]);

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
      CodeBlockBridge,
    ].map(ext => {
      if (ext.name === 'placeholder') {
        // showOnlyCurrent:false marks EVERY empty textblock, so CSS can tell an
        // effectively empty doc from an empty line above real content.
        return ext.configureExtension({
          placeholder: resolvedPlaceholder,
          showOnlyCurrent: false,
        });
      }
      if (ext.name === 'link') {
        // inclusive stays true so typing at a link's edge extends it (linkEdgeRules
        // restores what the DOM reads away). keepOnSplit:false stops Enter carrying it.
        return ext.extendExtension({ keepOnSplit: false });
      }
      return ext;
    });
  }, [resolvedPlaceholder]);

  const editor = useEditorBridge({
    // NOT tentap's autofocus: it focuses at 'end'. Ours is issued below, once the
    // editor proves it is alive.
    autofocus: false,
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

  // Who owns the keyboard, as an explicit state machine (see useInputOwnership).
  const ownership = useInputOwnership(focusManager);
  const ownershipRef = useRef(ownership);
  ownershipRef.current = ownership;

  const callbacksRef = useRef({
    onChange,
    onFocusChanged,
    onStateChange,
    onImageInteractionChange,
  });
  callbacksRef.current = { onChange, onFocusChanged, onStateChange, onImageInteractionChange };

  const configRef = useRef(webViewConfig);
  configRef.current = webViewConfig;

  const autofocusRef = useRef(autofocus);
  autofocusRef.current = autofocus;
  const focusManagerRef = useRef(focusManager);
  focusManagerRef.current = focusManager;
  const didAutofocusRef = useRef(false);

  const debounceMsRef = useRef(debounceMs);
  debounceMsRef.current = debounceMs;

  const isReadyCalledRef = useRef(false);
  const isConfigSentRef = useRef(false);
  // Serialised: identity is not a change signal, since an inline theme object
  // rebuilds webViewConfig on every render.
  const lastSentConfigRef = useRef<string | null>(null);
  const lastFocusStateRef = useRef(false);
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPendingTrailingSyncRef = useRef(false);
  const isMountedRef = useRef(true);

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

  // Only after the first push, which the mount message owns.
  useEffect(() => {
    if (!isConfigSentRef.current) return;
    const serialized = JSON.stringify(webViewConfig);
    if (serialized === lastSentConfigRef.current) return;
    lastSentConfigRef.current = serialized;
    editorLatestRef.current?.setEditorConfig(webViewConfig);
  }, [webViewConfig]);

  // Recovery for a killed WebView renderer: a dead one cannot reload in place, so it
  // REMOUNTS via this generation key and the latest document HTML is restored.
  const lastHtmlRef = useRef<string | null>(null);
  const pendingContentRestoreRef = useRef(false);
  const [webviewGeneration, setWebviewGeneration] = useState(0);
  const handleWebViewTerminated = useCallback(() => {
    pendingContentRestoreRef.current = true;
    setWebviewGeneration(generation => generation + 1);
  }, []);

  // Config is not reset here: every page announces itself and gets its own push,
  // and onLoad fires AFTER that announcement.
  const handleWebViewLoad = useCallback(() => {
    // Post-crash remount: the fresh page booted with initialContent — put the
    // user's latest document back.
    if (pendingContentRestoreRef.current) {
      pendingContentRestoreRef.current = false;
      const html = lastHtmlRef.current;
      if (html != null) {
        editorLatestRef.current?.setContent(html);
      }
    }
  }, []);

  const leaveImageSession = useCallback(() => {
    // Transfer ownership BEFORE the command: reports still in flight (a caption blur)
    // must be judged against the new state, or they lock the host's keyboard.
    ownership.claimHostInput();
    editorLatestRef.current?.leaveImageSession();
  }, [ownership]);

  useEffect(() => {
    const handleImageToolkitActive = (
      active: boolean,
      inCell: boolean,
      captionFocused: boolean,
    ) => {
      ownership.reportToolkit({ active, inCell, captionFocused });
      callbacksRef.current.onImageInteractionChange?.(active, inCell);
    };
    setImageToolkitActiveListener(handleImageToolkitActive);
    return () => clearImageToolkitActiveListener(handleImageToolkitActive);
  }, [ownership]);

  // Everything that needs a live WebView keys off the mount message: a state update
  // only arrives once something edits the document, which autofocus cannot wait for.
  useEffect(() => {
    const handleEditorMounted = () => {
      if (configRef.current) {
        isConfigSentRef.current = true;
        lastSentConfigRef.current = JSON.stringify(configRef.current);
        editorLatestRef.current?.setEditorConfig(configRef.current);
      }
      // One focus per editor lifetime. 'start' explicitly: focus(null) is a no-op
      // once the DOM holds focus, which is exactly the state at mount.
      if (autofocusRef.current && !didAutofocusRef.current) {
        didAutofocusRef.current = true;
        focusManagerRef.current?.requestFocus('start');
      }
    };
    setEditorMountedListener(handleEditorMounted);
    return () => clearEditorMountedListener(handleEditorMounted);
  }, []);

  useEffect(() => {
    if (!editor || !editor._subscribeToEditorStateUpdate) return;
    const unsubscribe = editor._subscribeToEditorStateUpdate((state: BridgeState) => {
      ownershipRef.current.reportEditorFocus(!!state.isFocused);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          lastHtmlRef.current = html;
          callbacksRef.current.onChange?.(html);
        }
      } catch {
        // tentap's async-message table has no reject path: this only catches a throw
        // from posting to a WebView that is already gone.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The keyboard moves the host's toolbar, so it changes how much of the WebView that
  // toolbar covers — the one geometry fact the page cannot measure.
  useEffect(() => {
    const showSub = KeyboardEvents.addListener('keyboardWillShow', () => {
      editorLatestRef.current?.notifyKeyboardWillShow({
        hostChromeOverlap: getHostChromeOverlap(true),
      });
    });
    const hideSub = KeyboardEvents.addListener('keyboardWillHide', () => {
      editorLatestRef.current?.notifyKeyboardWillShow({
        hostChromeOverlap: getHostChromeOverlap(false),
      });
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return useMemo<RichEditorInstance>(
    () => ({
      editor,
      focusManager,
      captionFocused: ownership.captionFocused,
      imageSessionActive: ownership.imageSessionActive,
      leaveImageSession,
      releaseHostInput: ownership.releaseHostInput,
      handleWebViewLoad,
      handleWebViewTerminated,
      webviewGeneration,
      keyboardOffset,
      bottomInset,
      resolvedTheme,
      resolvedLabels,
      resolvedHeadingOptions,
    }),
    [
      editor,
      focusManager,
      ownership,
      leaveImageSession,
      handleWebViewLoad,
      handleWebViewTerminated,
      webviewGeneration,
      keyboardOffset,
      bottomInset,
      resolvedTheme,
      resolvedLabels,
      resolvedHeadingOptions,
    ],
  );
};
