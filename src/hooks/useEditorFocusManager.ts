import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { EditorBridge } from '@10play/tentap-editor';
import { setBlurAckListener, clearBlurAckListener } from '../bridges/customBridges';

const IS_ANDROID = Platform.OS === 'android';

/**
 * Internal. Focuses the hidden native input that raises the Android IME.
 * A LIFO registry: the newest registration owns it, clearing hands ownership back.
 */
const imeOpenerListeners: (() => void)[] = [];
export const setImeOpenerListener = (listener: () => void) => {
  imeOpenerListeners.push(listener);
};

/** Removes this exact listener; ownership falls back to the one registered before it. */
export const clearImeOpenerListener = (listener: () => void) => {
  const index = imeOpenerListeners.lastIndexOf(listener);
  if (index !== -1) {
    imeOpenerListeners.splice(index, 1);
  }
};

/**
 * Pending invitation for the opener's onFocus: Android's focus search can land on
 * that always-mounted TextInput uninvited, and such a focus must not run the dance.
 */
let imeOpenInvited = false;

/**
 * Raise the Android IME for input areas that are not the main contenteditable (an
 * image caption): a programmatic DOM focus does not open it there.
 */
export const openAndroidIme = () => {
  const listener = imeOpenerListeners[imeOpenerListeners.length - 1];
  if (!listener) return;
  imeOpenInvited = true;
  listener();
};

export const consumeImeOpenInvitation = (): boolean => {
  const invited = imeOpenInvited;
  imeOpenInvited = false;
  return invited;
};

/** Settle delay before refocusing; absorbs jitter between native events. */
const REFOCUS_DELAY_MS = 80;

/**
 * Fallback ceiling for the WebView blur ack, which normally returns within one
 * bridge tick. Only fires for a WebView that is not ready or drops the message.
 */
const BLUR_ACK_TIMEOUT_MS = 250;

/** Standard suspend reasons for the editor screen — add a new one per new action. */
export const FocusSuspendReason = {
  ImageMenu: 'image-menu',
  ImagePicking: 'image-picking',
  TableSheet: 'table-sheet',
  /**
   * Deprecated, exported for API compatibility. Selecting an image keeps the
   * editor's input session, so the library never passes this reason.
   */
  ImageToolkit: 'image-toolkit',
} as const;

/** Where a focus request lands; null keeps the caret where it already is. */
export type FocusPosition = 'start' | 'end' | number | null;

export type EditorFocusManager = {
  /**
   * Yield the keyboard to an interaction; the first suspend blurs the editor.
   * Reasons are a SET, so overlapping overlays never refocus early.
   */
  suspend: (reason: string) => void;
  /**
   * End an interaction. Refocuses once NO reason is left; `{ refocus: false }` keeps
   * the keyboard hidden. Idempotent.
   */
  resume: (reason: string, options?: { refocus?: boolean }) => void;
  /**
   * Actively request editor focus (debounced + cancelable by a new suspend). A null
   * position keeps the caret, but is a no-op when the DOM already holds focus.
   */
  requestFocus: (position?: FocusPosition) => void;
  /**
   * IMMEDIATE refocus, for closing an overlay whose own native input holds the
   * keyboard. Call it BEFORE that overlay unmounts, or RN issues a hideSoftInput.
   */
  refocusNow: () => void;
  /**
   * Dismiss the keyboard once, for good. Prefer suspend()/resume() when the
   * keyboard must stay LOCKED down while an overlay is open.
   */
  dismissKeyboard: () => void;
  /**
   * Cancel a PENDING refocus without touching the suspend state — needed when a
   * caption has just taken focus and the refocus would steal it back.
   */
  cancelPendingFocus: () => void;
};

/**
 * The single coordinator for focus and keyboard state: overlays suspend/resume,
 * every refocus goes through requestFocus, so back-to-back overlays cannot race.
 */
export const useEditorFocusManager = (editor: EditorBridge | null): EditorFocusManager => {
  // Ref: the EditorBridge identity changes every render, which would otherwise
  // re-create every callback below.
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const activeReasonsRef = useRef<Set<string>>(new Set());
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keyboardAnimatingRef = useRef(false);
  const pendingImeActionRef = useRef<(() => void) | null>(null);

  /**
   * Single entry point for showing or hiding the keyboard: changing IME visibility
   * mid insets-animation crashes InsetsController.
   */
  const runWhenKeyboardIdle = useCallback((action: () => void) => {
    if (keyboardAnimatingRef.current) {
      pendingImeActionRef.current = action;
      return;
    }
    action();
  }, []);

  const cancelPendingFocus = useCallback(() => {
    pendingImeActionRef.current = null;
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
  }, []);

  /**
   * Single-shot: one focus command after a short delay, no retry. A command sent
   * during a system modal's closing transition can be swallowed.
   */
  const focusEditorNow = useCallback((position: FocusPosition = null) => {
    editorRef.current?.focus(position);
    // Android does not raise the IME from a DOM focus (see setImeOpenerListener).
    if (IS_ANDROID) {
      openAndroidIme();
    }
  }, []);

  const refocusNow = useCallback(() => {
    cancelPendingFocus();
    if (activeReasonsRef.current.size !== 0) return;
    focusEditorNow();
  }, [cancelPendingFocus, focusEditorNow]);

  const requestFocus = useCallback(
    (position: FocusPosition = null) => {
      cancelPendingFocus();
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        if (activeReasonsRef.current.size !== 0) {
          return;
        }
        runWhenKeyboardIdle(() => {
          // Re-check: a suspend may have landed while the keyboard was settling.
          if (activeReasonsRef.current.size === 0) {
            focusEditorNow(position);
          }
        });
      }, REFOCUS_DELAY_MS);
    },
    [cancelPendingFocus, focusEditorNow, runWhenKeyboardIdle],
  );

  const blurAckPendingRef = useRef(false);
  const blurAckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Resign native — runs only ONCE per pending dismiss. */
  const finishNativeDismiss = useCallback(() => {
    if (!blurAckPendingRef.current) {
      return;
    }
    blurAckPendingRef.current = false;
    if (blurAckTimerRef.current) {
      clearTimeout(blurAckTimerRef.current);
      blurAckTimerRef.current = null;
    }
    if (IS_ANDROID) {
      // Only for a keyboard held by a HOST input; the document blur covers the rest.
      // keepFocus, because a cleared focus makes Android search for a new one.
      runWhenKeyboardIdle(() => KeyboardController.dismiss({ keepFocus: true }));
      return;
    }
    KeyboardController.dismiss();
  }, [runWhenKeyboardIdle]);

  /**
   * Dismiss in EXACTLY ONE animation beat: blur the WebView, WAIT for its ack, THEN
   * resign native. Two hide paths in flight make the keyboard bounce.
   */
  const dismissKeyboardReliably = useCallback(() => {
    editorRef.current?.blur();
    editorRef.current?.forceBlurWebView?.();
    blurAckPendingRef.current = true;
    if (blurAckTimerRef.current) {
      clearTimeout(blurAckTimerRef.current);
    }
    blurAckTimerRef.current = setTimeout(finishNativeDismiss, BLUR_ACK_TIMEOUT_MS);
  }, [finishNativeDismiss]);

  // Receive the ack from the WebView (routed via TableBridge.onEditorMessage).
  useEffect(() => {
    setBlurAckListener(finishNativeDismiss);
    return () => clearBlurAckListener(finishNativeDismiss);
  }, [finishNativeDismiss]);

  const suspend = useCallback(
    (reason: string) => {
      cancelPendingFocus();
      const wasIdle = activeReasonsRef.current.size === 0;
      activeReasonsRef.current.add(reason);
      if (wasIdle) {
        dismissKeyboardReliably();
      }
    },
    [cancelPendingFocus, dismissKeyboardReliably],
  );

  const resume = useCallback(
    (reason: string, options?: { refocus?: boolean }) => {
      if (!activeReasonsRef.current.has(reason)) {
        return;
      }
      activeReasonsRef.current.delete(reason);
      if (activeReasonsRef.current.size === 0 && (options?.refocus ?? true)) {
        requestFocus();
      }
    },
    [requestFocus],
  );

  // Tracks the IME animation window, and on iOS locks the keyboard down while
  // suspended: WKWebView can restore the first responder around a system modal.
  useEffect(() => {
    const settle = () => {
      keyboardAnimatingRef.current = false;
      const pending = pendingImeActionRef.current;
      pendingImeActionRef.current = null;
      pending?.();
    };
    const subscriptions = [
      KeyboardEvents.addListener('keyboardWillShow', () => {
        keyboardAnimatingRef.current = true;
        if (!IS_ANDROID && activeReasonsRef.current.size > 0) {
          KeyboardController.dismiss();
        }
      }),
      KeyboardEvents.addListener('keyboardWillHide', () => {
        keyboardAnimatingRef.current = true;
      }),
      KeyboardEvents.addListener('keyboardDidShow', settle),
      KeyboardEvents.addListener('keyboardDidHide', settle),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, []);

  useEffect(() => cancelPendingFocus, [cancelPendingFocus]);
  useEffect(
    () => () => {
      if (blurAckTimerRef.current) {
        clearTimeout(blurAckTimerRef.current);
      }
    },
    [],
  );

  return useMemo(
    () => ({
      suspend,
      resume,
      requestFocus,
      refocusNow,
      dismissKeyboard: dismissKeyboardReliably,
      cancelPendingFocus,
    }),
    [suspend, resume, requestFocus, refocusNow, dismissKeyboardReliably, cancelPendingFocus],
  );
};
