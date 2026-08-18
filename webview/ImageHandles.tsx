import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { getScrollContainer } from './domUtils';
import { getVisibleBottom, getVisibleTop } from './scrollCoordinator';
import {
  DragSizeLabel,
  ImageToolbar,
  InsertLineBadge,
  ResizeCorner,
  TOOLBAR_HALF_WIDTH,
  TOOLBAR_HEIGHT,
  TOOLBAR_OFFSET,
} from './image/overlayParts';
import { useActiveImage } from './image/useActiveImage';
import { useImageResizeDrag } from './image/useImageResizeDrag';
import { useImageTapGestures } from './image/useImageTapGestures';
import { useImageToolbarActions } from './image/useImageToolbarActions';
import { useToolkitRelay } from './image/useToolkitRelay';
import { useImageSession } from './image/session';

/**
 * Image overlay sharing one ImageSession with ./image. HOOK ORDER IS PART OF THE
 * BEHAVIOUR, and no transaction may be dispatched mid-drag.
 */
export const ImageHandles = ({ editor }: { editor: Editor }) => {
  const session = useImageSession();
  useImageTapGestures(editor, session);
  useToolkitRelay(editor, session);
  const { isScrolling, updateHandles } = useActiveImage(editor, session);
  const { isDragging, dragLabel, startDrag, keepFocusOnTouch } = useImageResizeDrag(
    editor,
    session,
    updateHandles,
  );
  const actions = useImageToolbarActions(editor, session);

  const { active } = session;
  const container = getScrollContainer();
  if (!active || !container) return null;

  const { rect } = active;
  // Toolbar placement: above the image, else below the whole block, else pinned near
  // the visible top — the bar must stay reachable whatever the keyboard covers.
  const containerRect = container.getBoundingClientRect();
  const visibleTop = container.scrollTop + (getVisibleTop() - containerRect.top);
  const visibleBottom = container.scrollTop + (getVisibleBottom() - containerRect.top);
  const aboveTop = rect.top - TOOLBAR_OFFSET;
  const belowTop = active.blockBottom + 10;
  const fitsAbove = aboveTop >= visibleTop;
  const fitsBelow = belowTop + TOOLBAR_HEIGHT <= visibleBottom;
  const pinnedTop = Math.min(
    Math.max(visibleTop + 8, rect.top + 8),
    Math.max(rect.top + 8, active.blockBottom - TOOLBAR_HEIGHT - 8),
  );
  const toolbarTop = fitsAbove ? aboveTop : fitsBelow ? belowTop : pinnedTop;
  const centerX = rect.left + rect.width / 2;
  // Clamp so small / edge-hugging images do not clip the toolbar.
  const toolbarCenterX = Math.min(
    Math.max(centerX, TOOLBAR_HALF_WIDTH),
    Math.max(container.clientWidth - TOOLBAR_HALF_WIDTH, TOOLBAR_HALF_WIDTH),
  );

  const corners: { key: string; top: number; left: number; mirror: boolean; deg: number }[] = [
    { key: 'tl', top: rect.top, left: rect.left, mirror: true, deg: 0 },
    { key: 'tr', top: rect.top, left: rect.left + rect.width, mirror: false, deg: 90 },
    { key: 'bl', top: rect.top + rect.height, left: rect.left, mirror: true, deg: 270 },
    {
      key: 'br',
      top: rect.top + rect.height,
      left: rect.left + rect.width,
      mirror: false,
      deg: 180,
    },
  ];

  // Fade wrapper STATIC (no position), so it does not become the containing block for
  // its absolutely positioned children.
  return createPortal(
    <div
      style={{
        opacity: isScrolling ? 0 : 1,
        transition: 'opacity 120ms ease',
        pointerEvents: isScrolling ? 'none' : undefined,
      }}
    >
      {!isDragging && (
        <ImageToolbar
          top={toolbarTop}
          centerX={toolbarCenterX}
          align={active.align}
          hasCaption={active.hasCaption}
          actions={actions}
          keepFocusOnTouch={keepFocusOnTouch}
        />
      )}

      {!isDragging && active.showInsertAbove && (
        <InsertLineBadge
          // -14 centres the badge ON the top outline. Never above the visible strip: a
          // document starting with an image has barely any room there.
          top={Math.max(rect.top - 14, visibleTop + 2)}
          // +26 clears the top-left corner hook's touch area.
          left={rect.left + 26}
          onTap={actions.handleInsertAbove}
        />
      )}

      {!isDragging && active.showInsertBelow && (
        <InsertLineBadge
          // +height - 8 centers the badge ON the bottom selection outline,
          // drawn ~3px below the image edge.
          top={rect.top + rect.height - 8}
          // -48 mirrors the top badge, clearing the corner hook's touch area.
          left={rect.left + rect.width - 48}
          onTap={actions.handleInsertBelow}
        />
      )}

      {corners.map(corner => (
        <ResizeCorner
          key={corner.key}
          top={corner.top}
          left={corner.left}
          deg={corner.deg}
          onStart={e => startDrag(e, corner.mirror)}
          keepFocusOnTouch={keepFocusOnTouch}
        />
      ))}

      {isDragging && dragLabel !== null && (
        <DragSizeLabel top={rect.top + 8} centerX={centerX} text={dragLabel} />
      )}
    </div>,
    container,
  );
};
