import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { KeyboardController, KeyboardEvents } from 'react-native-keyboard-controller';
import { EditorBridge } from '@10play/tentap-editor';
import { setBlurAckListener, clearBlurAckListener } from '../bridges/customBridges';

const IS_ANDROID = Platform.OS === 'android';

/**
 * Internal. Focuses the hidden native input that raises the Android soft
 * keyboard, then hands the input connection to the WebView. Wired by RichEditor.
 *
 * Android calls `InputMethodManager.showSoftInput` only for a real user touch or
 * when a NATIVE input view takes focus; a programmatic focus (DOM, or even
 * `webView.requestFocus()`) moves the caret and nothing more, and
 * `keyboardDisplayRequiresUserAction` is iOS-only. An RN `TextInput` is the one
 * trigger reachable from JS — same workaround tentap uses for its autofocus.
 *
 * A LIFO registry, not one slot: the newest registration owns the IME and
 * clearing hands ownership back, so an editor outliving another keeps it.
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
 * Settle delay before refocusing; absorbs jitter between native events. Stays
 * short because chained overlays (popover → picker) are already prevented
 * structurally, by suspending the next reason at the moment of the tap.
 */
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
  /** An in-document image is selected (image toolkit open) — the keyboard must close. */
  ImageToolkit: 'image-toolkit',
} as const;

export type EditorFocusManager = {
  /**
   * Yield the keyboard to an interaction (sheet/popover/system picker); the
   * first suspend blurs the editor. Reasons are a SET, not a refcount, so
   * overlapping overlays never refocus early.
   */
  suspend: (reason: string) => void;
  /**
   * End an interaction. Refocuses the editor once NO reason is left active; pass
   * `{ refocus: false }` to keep the keyboard hidden. Idempotent, so an "early"
   * resume and a "final" one may coexist.
   */
  resume: (reason: string, options?: { refocus?: boolean }) => void;
  /** Actively request editor focus (debounced + cancelable by a new suspend). */
  requestFocus: () => void;
  /**
   * Dismiss the keyboard once, for good. Prefer suspend()/resume() when the
   * keyboard must stay LOCKED down while an overlay is open.
   */
  dismissKeyboard: () => void;
};

/**
 * The single coordinator for the editor's focus/keyboard state.
 *
 * - Plain toolbar actions (bold, undo, heading, …) do NOT go through it → no
 *   blur → the keyboard stays up.
 * - Overlay actions (table sheet, image menu, system picker, …) suspend(reason)
 *   on open and resume(reason) on finish; success and cancel both resume.
 * - Every refocus goes through ONE place (requestFocus), so back-to-back
 *   overlays cannot race.
 *
 * Uses KeyboardController.dismiss(), not Keyboard.dismiss(): the latter only
 * hides the keyboard of RN TextInputs, the former resigns the native responder
 * on whatever view actually holds it, WKWebView content included.
 */
export const useEditorFocusManager = (editor: EditorBridge | null): EditorFocusManager => {
  // Ref: the EditorBridge identity changes every render, which would otherwise
  // re-create every callback below.
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const activeReasonsRef = useRef<Set<string>>(new Set());
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** True between a keyboard will-event and its did-event (the IME is animating). */
  const keyboardAnimatingRef = useRef(false);
  /** An IME request that arrived mid-animation and must run once it settles. */
  const pendingImeActionRef = useRef<(() => void) | null>(null);

  /**
   * Single entry point for anything that shows or hides the keyboard. Changing
   * IME visibility WHILE Android's insets animation runs cancels that animation
   * and then still writes to it — `IllegalStateException: Can't change insets on
   * an animation that is cancelled`, a hard crash inside
   * android.view.InsetsController. Queue the request for the did-event instead.
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
   * Single-shot: one focus command after a short delay, no polling/retry.
   *
   * Accepted limitation: a system picker's dismiss callback can fire while the
   * modal is still closing, and a focus command sent during that UIKit
   * transition may be swallowed — the keyboard then reappears slightly late.
   */
  const focusEditorNow = useCallback(() => {
    editorRef.current?.focus(null);
    // Android does not raise the IME from a DOM focus (see setImeOpenerListener).
    if (IS_ANDROID) {
      const openIme: (() => void) | undefined = imeOpenerListeners[imeOpenerListeners.length - 1];
      openIme?.();
    }
  }, []);

  const requestFocus = useCallback(() => {
    cancelPendingFocus();
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = null;
      if (activeReasonsRef.current.size !== 0) {
        return;
      }
      runWhenKeyboardIdle(() => {
        // Re-check: a suspend may have landed while the keyboard was settling.
        if (activeReasonsRef.current.size === 0) {
          focusEditorNow();
        }
      });
    }, REFOCUS_DELAY_MS);
  }, [cancelPendingFocus, focusEditorNow, runWhenKeyboardIdle]);

  // See dismissKeyboardReliably.
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
    KeyboardController.dismiss();
  }, []);

  /**
   * Dismiss the keyboard for good, in EXACTLY ONE animation beat. Order matters:
   * blur the WebView (async postMessage), WAIT for its "DOM has lost focus" ack,
   * THEN resign native. A bare `editor.blur()`, or resigning while the DOM still
   * holds focus, lets WKWebView (keyboardDisplayRequiresUserAction=false
   * swizzled) reclaim the first responder mid-animation — the keyboard slides
   * down ~20%, pops back up, then closes: two visible steps instead of one.
   */
  const dismissKeyboardReliably = useCallback(() => {
    editorRef.current?.blur();
    editorRef.current?.forceBlurWebView?.();
    if (IS_ANDROID) {
      // No ack dance needed, but do NOT stop at the document blur: the keyboard
      // may belong to a host input (title field, search box), not the WebView.
      // Resign natively, through the idle gate (see runWhenKeyboardIdle).
      runWhenKeyboardIdle(() => KeyboardController.dismiss());
      return;
    }
    blurAckPendingRef.current = true;
    if (blurAckTimerRef.current) {
      clearTimeout(blurAckTimerRef.current);
    }
    blurAckTimerRef.current = setTimeout(finishNativeDismiss, BLUR_ACK_TIMEOUT_MS);
  }, [finishNativeDismiss, runWhenKeyboardIdle]);

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

  // Tracks the IME animation window (feeds runWhenKeyboardIdle) and, on iOS
  // only, locks the keyboard down while suspended: WKWebView can restore the
  // first responder by itself around presenting/dismissing a system modal, so
  // any keyboardWillShow while a reason is active is illegal → dismiss at once.
  // Android is deliberately NOT locked: no such swizzle, a DOM blur already
  // closes the IME, and dismissing from inside willShow is the InsetsController
  // crash (see runWhenKeyboardIdle).
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
    () => ({ suspend, resume, requestFocus, dismissKeyboard: dismissKeyboardReliably }),
    [suspend, resume, requestFocus, dismissKeyboardReliably],
  );
};
