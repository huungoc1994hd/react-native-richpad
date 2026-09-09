import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeSelection } from '@tiptap/pm/state';
import { getScrollContainer, toContentRect } from '../domUtils';
import { isUserDragging } from '../scrollCoordinator';
import { getCaptionOwner } from '../extensions/captionSession';
import { LEAVE_IMAGE_META, type ImageWidth } from '../extensions/imageActions';
import { selectImageNodeAt } from '../extensions/pmSelection';
import { isImageAlign } from '../extensions/imageExtended';
import type { ImageSession } from './session';

export type ActiveImageTracking = {
  /** Scrolling → fade the overlay; setState fires once per scroll start/end. */
  isScrolling: boolean;
  updateHandles: (props?: { transaction?: { getMeta: (key: string) => unknown } }) => void;
};

/**
 * Keeps `session.active` in step with the selection and with the DOM: which image
 * is selected, where it sits, and which badges apply.
 */
export const useActiveImage = (editor: Editor, session: ImageSession): ActiveImageTracking => {
  const { setActive, activeRef, dragRef, reassertRef, lastEditorTouchRef } = session;
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollingRef = useRef(false);

  const updateHandles = useCallback(
    (props?: { transaction?: { getMeta: (key: string) => unknown } }) => {
      // Mid-drag: handleMove already keeps the position in sync with the DOM — skip
      if (dragRef.current?.active) return;
      // A read-only document shows no toolkit, whatever the selection holds
      if (!editor.isEditable) {
        setActive(null);
        return;
      }

      const { state, view } = editor;
      const selection = state.selection;
      // Duck-type via .node, not `instanceof NodeSelection`: class identity breaks the
      // moment a second ProseMirror copy enters the bundle.
      const selectedNode = (selection as Partial<NodeSelection>).node;
      if (!selectedNode || selectedNode.type.name !== 'image') {
        // INVARIANT: while a caption is focused the image stays active. EXCEPTION: a
        // transaction carrying LEAVE_IMAGE_META is a deliberate exit.
        const deliberateLeave = !!props?.transaction?.getMeta(LEAVE_IMAGE_META);
        const prevActive = activeRef.current;
        if (prevActive && getCaptionOwner() && !deliberateLeave) {
          const node = state.doc.nodeAt(prevActive.imagePos);
          if (node?.type.name === 'image') {
            selectImageNodeAt(editor, prevActive.imagePos);
            return;
          }
        }
        // Selection stolen after a resize: reclaim REPEATEDLY within the window.
        // A real touch inside 250ms is intent to leave — ghosts carry no touch.
        const reassert = reassertRef.current;
        const isUserIntent = Date.now() - lastEditorTouchRef.current < 250;
        if (reassert && Date.now() < reassert.until && !isUserIntent) {
          const node = state.doc.nodeAt(reassert.pos);
          if (node?.type.name === 'image') {
            selectImageNodeAt(editor, reassert.pos);
            return;
          }
        }
        reassertRef.current = null;
        setActive(null);
        return;
      }

      const imagePos = selection.from;
      const $pos = state.doc.resolve(imagePos);
      // The normalizer wraps every image in a figure; this fallback only covers
      // malformed content mid-normalization.
      const inFigure = $pos.parent.type.name === 'figure';
      const targetPos = inFigure ? $pos.before($pos.depth) : imagePos;
      const hasCaption = inFigure && $pos.parent.childCount > 1;

      const imgDom = view.nodeDOM(imagePos) as HTMLElement | null;
      if (!imgDom || imgDom.tagName !== 'IMG') {
        setActive(null);
        return;
      }
      // Never blur web-side: selecting an image must not end the input session, and
      // WKWebView would restore first responder in a loop.

      const container = getScrollContainer();
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const r = imgDom.getBoundingClientRect();
      const blockDom = imgDom.closest<HTMLElement>('figure') ?? imgDom;
      const blockRect = blockDom.getBoundingClientRect();
      const targetNode = state.doc.nodeAt(targetPos);
      const alignAttr: unknown = targetNode?.attrs?.align;

      // The insert-line badge only shows when there is no empty line adjacent on
      // that side within the SAME container (doc / table cell).
      const $target = state.doc.resolve(targetPos);
      const containerNode = $target.parent;
      const targetIndex = $target.index();
      const isEmptyParagraph = (n: ProseMirrorNode | null) =>
        !!n && n.type.name === 'paragraph' && n.content.size === 0;
      const prevSibling = targetIndex > 0 ? containerNode.child(targetIndex - 1) : null;
      const nextSibling =
        targetIndex < containerNode.childCount - 1 ? containerNode.child(targetIndex + 1) : null;

      setActive({
        imagePos,
        targetPos,
        hasCaption,
        imgDom,
        rect: toContentRect(r, container, cRect),
        blockBottom: blockRect.bottom - cRect.top + container.scrollTop,
        align: isImageAlign(alignAttr) ? alignAttr : null,
        // geometry lives on the figure: % in 'width', px in 'pxWidth'
        width: ((): ImageWidth | null => {
          const pct = targetNode?.attrs?.width ?? null;
          const px = targetNode?.attrs?.pxWidth ?? null;
          if (px) return { value: px, unit: 'px' };
          if (pct) return { value: pct, unit: '%' };
          return null;
        })(),
        inCell: !!imgDom.closest('td, th'),
        showInsertAbove: !isEmptyParagraph(prevSibling),
        showInsertBelow: !isEmptyParagraph(nextSibling),
      });
    },
    [editor, activeRef, dragRef, lastEditorTouchRef, reassertRef, setActive],
  );

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', updateHandles);
    editor.on('update', updateHandles);

    // Overlay positions are CONTENT coordinates, so only the viewport-dependent parts
    // are recomputed, once per session at scroll END. The fade is for USER scrolls.
    const supportsScrollEnd = 'onscrollend' in window;
    let scrollEndTimer: number | null = null;

    // One scroll SESSION = first scroll event → scrollend. The fade decision is
    // per-session; the closing recompute always runs.
    let inScrollSession = false;

    const handleScrollEnd = () => {
      if (scrollEndTimer !== null) {
        window.clearTimeout(scrollEndTimer);
        scrollEndTimer = null;
      }
      if (!inScrollSession) return;
      inScrollSession = false;
      if (scrollingRef.current) {
        scrollingRef.current = false;
        setIsScrolling(false);
      }
      updateHandles();
    };

    const handleScroll = () => {
      if (dragRef.current?.active) return;
      // Overlay is off → the scroll path costs one comparison: no rAF, no
      // layout, no React.
      if (!activeRef.current) return;
      inScrollSession = true;
      // Checked per event, not once per session, so a finger grabbing the
      // screen mid-momentum (or mid-reveal) still fades immediately.
      if (isUserDragging() && !scrollingRef.current) {
        scrollingRef.current = true;
        setIsScrolling(true);
      }
      if (!supportsScrollEnd) {
        if (scrollEndTimer !== null) window.clearTimeout(scrollEndTimer);
        scrollEndTimer = window.setTimeout(handleScrollEnd, 140);
      }
    };

    let resizeRafId: number | null = null;
    const handleResize = () => {
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(() => updateHandles());
    };

    // A finished image load changes layout, and 'update'/'selectionUpdate' do not
    // fire for it. Capture, since 'load' does not bubble.
    const handleAssetLoad = (event: Event) => {
      if (!(event.target instanceof HTMLImageElement)) return;
      if (!activeRef.current) return;
      if (dragRef.current?.active) return;
      updateHandles();
    };
    document.addEventListener('load', handleAssetLoad, true);

    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    if (supportsScrollEnd) {
      document.addEventListener('scrollend', handleScrollEnd, { capture: true, passive: true });
    }
    window.addEventListener('resize', handleResize);
    // The iOS keyboard fires no window resize, only a visual-viewport one, and the
    // toolbar's flip decision reads the visible bottom.
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      editor.off('selectionUpdate', updateHandles);
      editor.off('update', updateHandles);
      document.removeEventListener('load', handleAssetLoad, true);
      document.removeEventListener('scroll', handleScroll, { capture: true });
      if (supportsScrollEnd) {
        document.removeEventListener('scrollend', handleScrollEnd, { capture: true });
      }
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      if (scrollEndTimer !== null) window.clearTimeout(scrollEndTimer);
      if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
    };
  }, [editor, updateHandles, activeRef, dragRef]);

  return { isScrolling, updateHandles };
};
