import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { NodeSelection } from '@tiptap/pm/state';
import { getCaptionOwner, setCaptionFocusListener } from '../extensions/captionSession';
// window.ReactNativeWebView is already typed by @10play/tentap-editor/web
import { BridgeMessageType } from '../../src/protocol';
import type { ImageSession } from './session';

/**
 * Reports the toolkit's state to RN. Selecting an image does NOT move the keyboard;
 * only a caption taking focus changes who owns it.
 */
export const useToolkitRelay = (editor: Editor, session: ImageSession): void => {
  const { active, activeRef } = session;

  const isActive = !!active;
  const activeInCell = !!active?.inCell;
  const [captionFocused, setCaptionFocused] = useState<boolean>(() => !!getCaptionOwner());

  useEffect(() => {
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({
        type: BridgeMessageType.ImageToolkitActive,
        // Read LIVE, not from state: autofocus runs in the same commit, and the first
        // message of an activation must already carry captionFocused.
        payload: {
          active: isActive,
          inCell: activeInCell,
          captionFocused: !!getCaptionOwner(),
        },
      }),
    );
  }, [isActive, activeInCell, captionFocused]);

  // A caption focus change is relayed IMMEDIATELY, without waiting for a render: on
  // FOCUS it must reach RN before keyboardWillShow so ownership is settled.
  useEffect(() => {
    setCaptionFocusListener(focused => {
      setCaptionFocused(focused);
      // Read `active` from PM state, not the ref: a blur usually follows a dispatch
      // React has not rendered yet, and the ref would report a stale session.
      const selectedNode = (editor.state.selection as Partial<NodeSelection>).node;
      const activeNow = !!selectedNode && selectedNode.type.name === 'image';
      window.ReactNativeWebView?.postMessage(
        JSON.stringify({
          type: BridgeMessageType.ImageToolkitActive,
          payload: {
            active: activeNow,
            inCell: activeNow ? !!activeRef.current?.inCell : false,
            captionFocused: focused,
          },
        }),
      );
    });
    return () => setCaptionFocusListener(null);
  }, [editor, activeRef]);
};
