import { useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import {
  announceCaptionFocus,
  focusCaptionField,
  getCaptionOwner,
  releaseDomFocus,
} from '../extensions/captionSession';
import { LEAVE_IMAGE_META } from '../extensions/imageActions';
import { createTextSelectionAt, selectImageNodeAt } from '../extensions/pmSelection';
import type { ImageSession } from './session';

/**
 * What a touch on the document MEANS while the image toolkit is open — tap, tap-back
 * or scroll. Intent is settled at touchend: at touchstart every scroll reads as a tap.
 */
export const useImageTapGestures = (editor: Editor, session: ImageSession): void => {
  const { activeRef, lastEditorTouchRef } = session;

  useEffect(() => {
    /** Movement below this reads as a TAP rather than a scroll gesture (px). */
    const TAP_SLOP = 10;
    /** Touch start on an <img>, so touchend can tell a TAP from a scroll/drag. */
    let imgTapStart: { x: number; y: number; img: HTMLElement } | null = null;
    /** Touch start on the EDITING area while a caption owns the input session. */
    let editorTapStart: { x: number; y: number } | null = null;

    /**
     * A real TAP while a caption owns the session: place the selection at the touch
     * point and focus the editor, since iOS cancels its own caret placement here.
     */
    const focusEditorAtPoint = (clientX: number, clientY: number) => {
      try {
        const posInfo = editor.view.posAtCoords({ left: clientX, top: clientY });
        if (posInfo) {
          const selection = createTextSelectionAt(editor.state, editor.state.doc, posInfo.pos);
          if (selection) {
            editor.view.dispatch(
              editor.state.tr.setSelection(selection).setMeta(LEAVE_IMAGE_META, true),
            );
          }
        }
        editor.view.focus();
      } catch {
        // posAtCoords throws for coordinates outside the document — ignore.
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('.ProseMirror')) return;
      // Read-only document: a tap on an image is just a tap
      if (!editor.isEditable) return;

      // A tap on the caption field is orchestrated by the figcaption NodeView —
      // leave editable and the handoff alone here.
      if (target.closest('figcaption')) return;

      // Touch on an IMAGE: tap or scroll is still unknown, so only record the
      // start point and decide at touchend.
      const touchedImg = target.closest?.('img');
      if (touchedImg) {
        const touch = e.touches[0];
        imgTapStart = touch
          ? { x: touch.clientX, y: touch.clientY, img: touchedImg as HTMLElement }
          : null;
        return;
      }
      imgTapStart = null;

      lastEditorTouchRef.current = Date.now();

      // Only while a caption owns the session: the native tap path would blur the
      // field without the LEAVE meta. Intent is decided at touchend, as for image taps.
      const owned = !!getCaptionOwner();
      const touch = e.touches[0];
      editorTapStart = owned && touch ? { x: touch.clientX, y: touch.clientY } : null;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = imgTapStart;
      const editorStart = editorTapStart;
      imgTapStart = null;
      editorTapStart = null;
      const touch = e.changedTouches[0];
      if (!touch) return;

      // Only a real TAP hands control back to the editor; a scroll leaves the caption
      // session and the image selection alone.
      if (editorStart) {
        if (Math.hypot(touch.clientX - editorStart.x, touch.clientY - editorStart.y) <= TAP_SLOP) {
          focusEditorAtPoint(touch.clientX, touch.clientY);
        }
        return;
      }

      if (!start) return;
      // Significant movement means scroll/drag, not a tap.
      if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP) return;

      // TAP on an image: own the transition INSIDE the gesture. The synthesized click
      // would refocus the editing host and steal the focus just placed.
      e.preventDefault();
      try {
        const pos = editor.view.posAtDOM(start.img, 0);
        const node = editor.state.doc.nodeAt(pos);
        if (!node || node.type.name !== 'image') return;
        const current = activeRef.current;
        const figureDom = start.img.closest('figure');
        const field = figureDom?.querySelector<HTMLElement>('figcaption[contenteditable="true"]');
        if (figureDom && field) {
          // Activating a captioned image means entering caption input. ANNOUNCE before
          // blurring the source, or RN sees a half state and force-blurs the new focus.
          announceCaptionFocus(field);
          // Blur the source BEFORE the dispatch: while PM owns focus it writes the
          // NodeSelection over the DOM selection, leaving no caret.
          releaseDomFocus(field);
          if (!current || current.imagePos !== pos) {
            selectImageNodeAt(editor, pos);
          }
          focusCaptionField(figureDom);
        } else {
          // Coming from another image's caption: release its ownership BEFORE the
          // dispatch, or RN runs the IME dance for a caption already on its way out.
          const caption = getCaptionOwner();
          if (caption) {
            announceCaptionFocus(null);
          }
          if (!current || current.imagePos !== pos) {
            selectImageNodeAt(editor, pos);
          }
          // Hand the keyboard over in the SAME tick. With no caption in play
          // leave focus alone: a tap meant for resize must not summon the keyboard.
          if (caption) {
            caption.blur();
            editor.view.focus();
          }
        }
      } catch {
        // posAtDOM throws for DOM outside the document — ignore.
      }
    };

    // touchstart stays passive so scrolling is never blocked; touchend needs
    // passive:false to preventDefault the synthesized click once it is a tap.
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: false });
    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
    };
  }, [editor, activeRef, lastEditorTouchRef]);
};
