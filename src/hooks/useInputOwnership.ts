import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { openAndroidIme, type EditorFocusManager } from './useEditorFocusManager';

/**
 * WHO OWNS THE INPUT SESSION. Every transition goes through one function, so the
 * consequences live in one place instead of as reflexes on individual messages.
 */
export const InputOwner = {
  /** The editor holds (or is about to hold) the keyboard — the resting state. */
  Editor: 'editor',
  /**
   * An image is selected. The KEYBOARD DOES NOT MOVE: the editor keeps its session,
   * open or closed — selecting an image is not an intent to stop writing.
   */
  Image: 'image',
  /** An image caption holds the keyboard (its own editing host, outside PM). */
  Caption: 'caption',
  /** A HOST control (search field, modal) holds the keyboard. */
  Host: 'host',
} as const;

export type InputOwnerValue = (typeof InputOwner)[keyof typeof InputOwner];

type ToolkitReport = { active: boolean; inCell: boolean; captionFocused: boolean };

export interface InputOwnership {
  owner: InputOwnerValue;
  /** A caption holds the keyboard; the toolbars disable their formatting group. */
  captionFocused: boolean;
  /** An image session is open (image selected, or its caption being typed). */
  imageSessionActive: boolean;
  reportToolkit: (report: ToolkitReport) => void;
  /**
   * The editor's own focus state. Only a GAIN is acted on, as a safety net; a blur
   * says the editor lost the keyboard, never who took it.
   */
  reportEditorFocus: (focused: boolean) => void;
  /** A host control is about to take the keyboard (the search field). */
  claimHostInput: () => void;
  releaseHostInput: () => void;
}

/**
 * Coordinator for input-session ownership: a caption raises the IME, an image records
 * ownership without moving the keyboard, and host reports outrank stale image beats.
 */
export const useInputOwnership = (focusManager: EditorFocusManager): InputOwnership => {
  const [owner, setOwnerState] = useState<InputOwnerValue>(InputOwner.Editor);
  const ownerRef = useRef<InputOwnerValue>(InputOwner.Editor);

  const setOwner = useCallback((next: InputOwnerValue) => {
    if (ownerRef.current === next) return;
    ownerRef.current = next;
    setOwnerState(next);
  }, []);

  const reportToolkit = useCallback(
    ({ active, captionFocused }: ToolkitReport) => {
      // Caption FIRST and independently of `active`: a first report can carry
      // active=false, and the deselect branch would hand ownership back mid-focus.
      if (captionFocused) {
        setOwner(InputOwner.Caption);
        focusManager.cancelPendingFocus();
        if (Platform.OS === 'android') {
          // A DOM focus does not raise the IME on Android — borrow the hidden
          // TextInput.
          openAndroidIme();
        }
        return;
      }

      if (active) {
        // The host holds the keyboard: this report is a stale beat, and taking
        // ownership now would misattribute it.
        if (ownerRef.current === InputOwner.Host) return;
        setOwner(InputOwner.Image);
        return;
      }

      // Image deselected: back to the editor, unless the host holds the keyboard.
      if (ownerRef.current === InputOwner.Host) return;
      setOwner(InputOwner.Editor);
    },
    [focusManager, setOwner],
  );

  const reportEditorFocus = useCallback(
    (focused: boolean) => {
      // The editor really has the keyboard again, so host ownership lapses — a
      // safety net for a host control unmounted before it could release.
      if (focused && ownerRef.current === InputOwner.Host) {
        setOwner(InputOwner.Editor);
      }
    },
    [setOwner],
  );

  const claimHostInput = useCallback(() => {
    setOwner(InputOwner.Host);
  }, [setOwner]);

  const releaseHostInput = useCallback(() => {
    if (ownerRef.current === InputOwner.Host) {
      setOwner(InputOwner.Editor);
    }
  }, [setOwner]);

  return useMemo(
    () => ({
      owner,
      captionFocused: owner === InputOwner.Caption,
      imageSessionActive: owner === InputOwner.Image || owner === InputOwner.Caption,
      reportToolkit,
      reportEditorFocus,
      claimHostInput,
      releaseHostInput,
    }),
    [owner, reportToolkit, reportEditorFocus, claimHostInput, releaseHostInput],
  );
};
