import React, { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { getScrollContainer, toContentRect } from '../domUtils';
import { swallowGhostMouseEvents } from '../tapGuard';
import { updateImageAttrs, type ImageWidth } from '../extensions/imageActions';
import { getEditorMetrics } from '../configStore';
import { captureCellContext, getBasisWidth, getContentWidth } from './geometry';
import type { ActiveImageTracking } from './useActiveImage';
import type { ImageSession } from './session';

/** Stable reference for keepFocusOnTouch, so listeners are never duplicated. */
const preventTouchDefault = (event: TouchEvent) => event.preventDefault();

export type ImageResizeDrag = {
  isDragging: boolean;
  /** Live size readout shown while dragging (e.g. "62%"). */
  dragLabel: string | null;
  startDrag: (e: React.TouchEvent | React.MouseEvent, mirror: boolean) => void;
  /** Ref callback for overlay controls that must not blur the focused caption. */
  keepFocusOnTouch: (node: HTMLElement | null) => void;
};

/**
 * Aspect-preserving drag-resize from the corner handles. The preview is DOM-only and
 * exactly one transaction is committed on release, so it is a single undo step.
 */
export const useImageResizeDrag = (
  editor: Editor,
  session: ImageSession,
  updateHandles: ActiveImageTracking['updateHandles'],
): ImageResizeDrag => {
  const { setActive, activeRef, dragRef, reassertRef } = session;
  const [isDragging, setIsDragging] = useState(false);
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  useEffect(() => {
    let endRafId: number | null = null;

    const handleMove = (e: TouchEvent | MouseEvent) => {
      const d = dragRef.current;
      if (!d?.active) return;
      e.preventDefault();
      e.stopPropagation();
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      if (clientX === undefined) return;

      const rawDelta = clientX - d.startX;
      const delta = d.mirror ? -rawDelta : rawDelta;
      if (!d.moved) {
        if (Math.abs(delta) < 5) return;
        d.moved = true;
        setIsDragging(true);
      }

      // Contextual min: % of basis (top-level) / an absolute px floor (in-cell).
      const metrics = getEditorMetrics();
      const minPx =
        d.unit === 'px' ? metrics.imageMinWidthPx : (d.basisWidth * metrics.imageMinWidthPct) / 100;
      const px = Math.min(Math.max(d.startWidthPx + delta, minPx), d.maxPx);
      d.lastValue = d.unit === 'px' ? Math.round(px) : Math.round((px / d.basisWidth) * 100);
      setDragLabel(`${d.lastValue}${d.unit}`);

      // Past the cell edge the COLUMN stretches with the finger (Docs style).
      // DOM-only preview; dragging back never shrinks below the original width.
      if (d.cellCtx) {
        const { colEl, tableEl, originalColWidth, originalTableWidth, padH } = d.cellCtx;
        const desiredCol = Math.max(originalColWidth, px + padH);
        colEl.style.width = `${desiredCol}px`;
        tableEl.style.width = `${originalTableWidth + (desiredCol - originalColWidth)}px`;
      }

      // Preview on PM's current DOM, re-queried every frame (see file header).
      const { view } = editor;
      const targetDom = view.nodeDOM(d.targetPos) as HTMLElement | null;
      if (targetDom?.style) targetDom.style.width = `${px}px`;

      // Handles + the % label track the image corners in realtime.
      const imgDom = view.nodeDOM(d.imagePos) as HTMLElement | null;
      const container = getScrollContainer();
      const a = activeRef.current;
      if (imgDom && container && a) {
        const cRect = container.getBoundingClientRect();
        const r = imgDom.getBoundingClientRect();
        const blockDom = imgDom.closest<HTMLElement>('figure') ?? imgDom;
        setActive({
          ...a,
          imgDom,
          rect: toContentRect(r, container, cRect),
          blockBottom: blockDom.getBoundingClientRect().bottom - cRect.top + container.scrollTop,
        });
      }
    };

    const handleEnd = () => {
      const d = dragRef.current;
      if (!d?.active) return;
      dragRef.current = null;
      setIsDragging(false);
      setDragLabel(null);
      if (d.moved) {
        if (d.pointer === 'touch') swallowGhostMouseEvents();
        reassertRef.current = { pos: d.imagePos, until: Date.now() + 600 };
        // Set the preview to the exact value being committed. Do NOT blank it: PM
        // reuses the element when the attr is unchanged.
        const targetDom = editor.view.nodeDOM(d.targetPos) as HTMLElement | null;
        if (targetDom?.style) targetDom.style.width = `${d.lastValue}${d.unit}`;
        // Past the cell edge → the column's new colwidth rides the same transaction.
        let columnWidthPx: number | undefined;
        if (d.cellCtx) {
          const needed = d.lastValue + d.cellCtx.padH;
          if (needed > d.cellCtx.originalColWidth) columnWidthPx = Math.round(needed);
        }
        updateImageAttrs(
          editor,
          d.targetPos,
          { width: { value: d.lastValue, unit: d.unit } },
          { columnWidthPx },
        );
      }
      if (endRafId !== null) cancelAnimationFrame(endRafId);
      endRafId = requestAnimationFrame(() => updateHandles());
    };

    window.addEventListener('touchmove', handleMove, { capture: true, passive: false });
    window.addEventListener('touchend', handleEnd, { capture: true });
    window.addEventListener('touchcancel', handleEnd, { capture: true });
    // Support the in-browser dev harness (mouse instead of touch)
    window.addEventListener('mousemove', handleMove, { capture: true });
    window.addEventListener('mouseup', handleEnd, { capture: true });

    return () => {
      window.removeEventListener('touchmove', handleMove, { capture: true });
      window.removeEventListener('touchend', handleEnd, { capture: true });
      window.removeEventListener('touchcancel', handleEnd, { capture: true });
      window.removeEventListener('mousemove', handleMove, { capture: true });
      window.removeEventListener('mouseup', handleEnd, { capture: true });
      if (endRafId !== null) cancelAnimationFrame(endRafId);
    };
  }, [editor, updateHandles, activeRef, dragRef, reassertRef, setActive]);

  /**
   * KEEP FOCUS when a touch lands on an overlay control: React's root touchstart is
   * PASSIVE, so only a native non-passive listener can cancel the blur (see tapGuard).
   */
  const keepFocusOnTouch = useCallback((node: HTMLElement | null) => {
    node?.addEventListener('touchstart', preventTouchDefault, { passive: false });
  }, []);

  const startDrag = (e: React.TouchEvent | React.MouseEvent, mirror: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const a = activeRef.current;
    if (!a) return;
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined) return;

    // Basis = the real containing block of the width-receiving element
    // (figure/img); see getBasisWidth.
    const targetDom = (editor.view.nodeDOM(a.targetPos) as HTMLElement | null) ?? a.imgDom;
    const basisWidth = getBasisWidth(targetDom);
    const unit: ImageWidth['unit'] = a.inCell ? 'px' : '%';
    const cellCtx = a.inCell ? captureCellContext(targetDom, basisWidth) : null;
    const currentPx = a.imgDom.getBoundingClientRect().width;
    dragRef.current = {
      active: true,
      moved: false,
      startX: clientX,
      startWidthPx: currentPx,
      basisWidth,
      // Column can stretch → ceiling is the editing screen width; if it cannot
      // (legacy table with no colgroup) → cap at the cell edge.
      maxPx: a.inCell
        ? cellCtx
          ? Math.max(basisWidth, getContentWidth())
          : basisWidth
        : basisWidth,
      cellCtx,
      mirror,
      targetPos: a.targetPos,
      imagePos: a.imagePos,
      unit,
      lastValue:
        a.width && a.width.unit === unit
          ? a.width.value
          : unit === 'px'
            ? Math.round(currentPx)
            : Math.round((currentPx / basisWidth) * 100),
      pointer: 'touches' in e ? 'touch' : 'mouse',
    };
  };

  return { isDragging, dragLabel, startDrag, keepFocusOnTouch };
};
