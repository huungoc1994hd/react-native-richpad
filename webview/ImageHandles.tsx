import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { NodeSelection } from '@tiptap/pm/state';
import { getScrollContainer, toContentRect, type ContentRect } from './domUtils';
// Every control here taps through tapHandlers: a ghost click landing on the
// editor steals the NodeSelection of the just-resized image, and each toolbar
// button double-fires (align sets then reverts, caption toggles on then off).
import { swallowGhostMouseEvents, tapHandlers } from './tapGuard';
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  CaptionIcon,
  ImageTrashIcon,
  ReturnIcon,
} from './icons';
import {
  wrapImageWithCaption,
  unwrapFigurePreservingCaption,
  updateImageAttrs,
  deleteImageNode,
  insertParagraphAbove,
  insertParagraphBelow,
  selectImageNodeAt,
  type ImageWidth,
} from './extensions/figure';
import { isImageAlign, type ImageAlign } from './extensions/imageExtended';
import { getEditorMetrics } from './configStore';
// window.ReactNativeWebView is already typed by @10play/tentap-editor/web
import { BridgeMessageType } from '../src/protocol';

/**
 * Image manipulation overlay: tap an image → NodeSelection (accent outline) with
 * the keyboard closed, a floating toolbar (insert line above │ align │ caption │
 * delete) and 4 corner handles for aspect-preserving drag-resize.
 *
 * Resize preview mutates style on PM's rendered DOM, re-querying view.nodeDOM
 * EVERY FRAME — never cache the element: PM can replace the node and a detached
 * one gives a dead preview. Do NOT dispatch transactions while dragging; each
 * redraws the node and touches selection/focus, so the editor flickers and the
 * keyboard hides/shows nonstop. Commit ONE on release (one undo step). Every
 * action works BY NODE POSITION, which keeps the image selected across changes.
 */

type ActiveImage = {
  /** pos of the image node */
  imagePos: number;
  /** pos of the node that receives attrs (the figure when a caption exists, otherwise the image itself) */
  targetPos: number;
  isFigure: boolean;
  imgDom: HTMLElement;
  /** coordinates relative to the scroll container (scrollTop/Left already added) */
  rect: ContentRect;
  /** bottom edge of the WHOLE BLOCK (figure including caption, or bare img) — container-relative */
  blockBottom: number;
  align: ImageAlign | null;
  /** current width attr by context (% at top level / px inside a table cell) */
  width: ImageWidth | null;
  /** image sits inside a table cell → resize in absolute px */
  inCell: boolean;
  /** no empty line directly ABOVE the image yet (same container) → show the insert-above badge */
  showInsertAbove: boolean;
  /** no empty line directly BELOW the image yet (same container) → show the insert-below badge */
  showInsertBelow: boolean;
};

/** Column context while dragging an image inside a table cell — used to stretch the column as it is dragged. */
type CellDragContext = {
  colEl: HTMLElement;
  tableEl: HTMLElement;
  /** column width when the drag started (px) — never shrink below this */
  originalColWidth: number;
  originalTableWidth: number;
  /** gap between the column width and the image content (the cell's padding + border) */
  padH: number;
};

type DragState = {
  active: boolean;
  moved: boolean;
  startX: number;
  startWidthPx: number;
  /** width of the image's real CONTAINING BLOCK (the table cell when inside a table) */
  basisWidth: number;
  /** drag ceiling: top-level = basis; in-cell = allowed to overshoot to stretch the column (capped at screen width) */
  maxPx: number;
  mirror: boolean;
  targetPos: number;
  imagePos: number;
  /** commit unit: % (top level) / px (inside a table cell) */
  unit: ImageWidth['unit'];
  lastValue: number;
  cellCtx: CellDragContext | null;
  pointer: 'touch' | 'mouse';
};

/** 40px: a touch area wide enough that an off-center tap still hits the handle, not the image. */
const HANDLE_TOUCH_SIZE = 40;
const TOOLBAR_OFFSET = 48;

const getContentWidth = (): number => {
  const pm = document.querySelector('.ProseMirror') as HTMLElement | null;
  if (!pm) return window.innerWidth - 36;
  const cs = getComputedStyle(pm);
  return pm.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
};

/**
 * Width of the image's real CONTAINING BLOCK: the basis that keeps % rendering
 * and drag math in agreement in EVERY context (top level / table cell).
 */
const getBasisWidth = (targetDom: HTMLElement): number => {
  const parent = targetDom.parentElement;
  if (!parent) return getContentWidth();
  const cs = getComputedStyle(parent);
  const width =
    parent.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
  return width > 0 ? width : getContentWidth();
};

/**
 * Column context for an image inside a table cell. Returns null when no <col>
 * can be found (legacy tables without a colgroup) → no column stretching, the
 * width is simply capped at the cell edge.
 */
const captureCellContext = (targetDom: HTMLElement, basisWidth: number): CellDragContext | null => {
  const cellEl = targetDom.closest<HTMLElement>('td, th');
  const tableEl = cellEl?.closest<HTMLElement>('table') ?? null;
  const colgroup = tableEl?.querySelector('colgroup');
  if (!cellEl || !tableEl || !colgroup) return null;

  // Column index = sum of the colSpans of the preceding cells in the row
  let colIndex = 0;
  for (let el = cellEl.previousElementSibling; el; el = el.previousElementSibling) {
    colIndex += (el as HTMLTableCellElement).colSpan || 1;
  }
  // pm-tables rule: a colspan>1 cell puts its width on the LAST column of the span.
  colIndex += ((cellEl as HTMLTableCellElement).colSpan || 1) - 1;
  const colEl = colgroup.children[colIndex] as HTMLElement | undefined;
  if (!colEl) return null;

  const originalColWidth = colEl.getBoundingClientRect().width || cellEl.offsetWidth;
  return {
    colEl,
    tableEl,
    originalColWidth,
    originalTableWidth: tableEl.getBoundingClientRect().width,
    padH: Math.max(0, cellEl.offsetWidth - basisWidth),
  };
};

export const ImageHandles = ({ editor }: { editor: Editor }) => {
  const [active, setActive] = useState<ActiveImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragLabel, setDragLabel] = useState<string | null>(null);

  const activeRef = useRef(active);
  activeRef.current = active;
  const dragRef = useRef<DragState | null>(null);
  /** Short window after a resize: if a stray event steals the image selection → reclaim it. */
  const reassertRef = useRef<{ pos: number; until: number } | null>(null);
  /** Timestamp of the last INTENTIONAL touch on the editing area — tells it apart from "ghost" events. */
  const lastEditorTouchRef = useRef(0);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.('.ProseMirror')) return;

      // Touching an IMAGE ≠ intent to type: re-enabling editable lets WebKit
      // focus, paint blue selection over the image and raise the keyboard.
      const touchedImg = target.closest?.('img');
      if (touchedImg) {
        // A DIFFERENT image → move the toolkit straight to it (editable is
        // locked, so PM cannot change the selection on its own).
        if (editor && !editor.isEditable) {
          try {
            const pos = editor.view.posAtDOM(touchedImg, 0);
            const a = activeRef.current;
            if (a && pos !== a.imagePos) {
              selectImageNodeAt(editor, pos);
            }
          } catch {
            // posAtDOM can throw for DOM outside the document — ignore
          }
        }
        return;
      }

      lastEditorTouchRef.current = Date.now();
      // Deliberate touch on the text/caption area while editable is locked →
      // restore it INSIDE touchstart, before WebKit processes the tap, so this
      // very tap places the caret and opens the keyboard as usual.
      if (!editor.isEditable) {
        editor.setEditable(true, false);
      }
    };
    document.addEventListener('touchstart', onTouchStart, true);
    return () => document.removeEventListener('touchstart', onTouchStart, true);
  }, [editor]);

  // Selection/deselection tells RN to suspend/resume EditorFocusManager, which
  // dismisses the keyboard natively and blocks unauthorized keyboardWillShow.
  // Top-level images ONLY; in-cell images keep the keyboard (user is typing).
  const isActive = !!active;
  const activeInCell = !!active?.inCell;
  useEffect(() => {
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({
        type: BridgeMessageType.ImageToolkitActive,
        payload: { active: isActive, inCell: activeInCell },
      }),
    );
  }, [isActive, activeInCell]);

  // LOCK EDITABLE while the toolkit is open: blocking focus events one by one
  // is an endless tug-of-war (we resign ↔ the WKWebView swizzle restores first
  // responder, keyboard hides/shows forever). Remove the REASON instead — with
  // contenteditable=false WebKit cannot focus, cannot draw the blue selection
  // (iOS ignores ::selection) and does not request the keyboard. Restored on a
  // deliberate touch (listener above), on ensureEditable, or on cleanup.
  useEffect(() => {
    // Image in a table cell: do NOT lock — the keyboard stays up there.
    if (!isActive || activeInCell) return;

    if (editor.isEditable) {
      editor.setEditable(false, false);
      // Clear focus/selection state left over from before the lock
      (document.activeElement as HTMLElement | null)?.blur?.();
      window.getSelection()?.removeAllRanges();
    }

    return () => {
      if (!editor.isDestroyed && !editor.isEditable) {
        editor.setEditable(true, false);
      }
    };
  }, [isActive, activeInCell, editor]);

  const updateHandles = useCallback(() => {
    // Mid-drag: handleMove already keeps the position in sync with the DOM — skip
    if (dragRef.current?.active) return;

    const { state, view } = editor;
    const selection = state.selection;
    // Do NOT use `instanceof NodeSelection`: tentap's prebuilt web bundle
    // (lib-web) inlines its own copy of prosemirror-state, so the editor's
    // selection class differs from the one imported from @tiptap/pm and
    // instanceof is always false. Duck-type via .node, invariant across copies.
    const selectedNode = (selection as Partial<NodeSelection>).node;
    if (!selectedNode || selectedNode.type.name !== 'image') {
      // Selection stolen right after a resize → reclaim REPEATEDLY within the
      // window (WebKit can steal twice: ghost click + focus restore). Exception:
      // a real touch inside 250ms is intent to leave — ghosts carry no touch.
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
    const isFigure = $pos.parent.type.name === 'figure';
    const targetPos = isFigure ? $pos.before($pos.depth) : imagePos;

    const imgDom = view.nodeDOM(imagePos) as HTMLElement | null;
    if (!imgDom || imgDom.tagName !== 'IMG') {
      setActive(null);
      return;
    }
    // Dismissing the keyboard is RN's job (via ImageToolkitActive) — do NOT blur
    // web-side: after a plain blur WKWebView restores first responder, giving a
    // focus/blur loop that makes the keyboard flicker nonstop.

    const container = getScrollContainer();
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const r = imgDom.getBoundingClientRect();
    const blockDom = isFigure ? (imgDom.closest<HTMLElement>('figure') ?? imgDom) : imgDom;
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
      isFigure,
      imgDom,
      rect: toContentRect(r, container, cRect),
      blockBottom: blockRect.bottom - cRect.top + container.scrollTop,
      align: isImageAlign(alignAttr) ? alignAttr : null,
      // a figure keeps % in the 'width' attr; a bare image in 'pctWidth'; px is shared in 'pxWidth'
      width: ((): ImageWidth | null => {
        const pct = (isFigure ? targetNode?.attrs?.width : targetNode?.attrs?.pctWidth) ?? null;
        const px = targetNode?.attrs?.pxWidth ?? null;
        if (px) return { value: px, unit: 'px' };
        if (pct) return { value: pct, unit: '%' };
        return null;
      })(),
      inCell: !!imgDom.closest('td, th'),
      showInsertAbove: !isEmptyParagraph(prevSibling),
      showInsertBelow: !isEmptyParagraph(nextSibling),
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.on('selectionUpdate', updateHandles);
    editor.on('update', updateHandles);

    let rafId: number | null = null;
    const reposition = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateHandles);
    };
    document.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    return () => {
      editor.off('selectionUpdate', updateHandles);
      editor.off('update', updateHandles);
      document.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [editor, updateHandles]);

  // ===== Drag resize =====
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
        const blockDom = a.isFigure ? (imgDom.closest<HTMLElement>('figure') ?? imgDom) : imgDom;
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
        // Set the preview to the exact value being committed. Do NOT blank it:
        // when the attr is unchanged PM reuses the element, so clearing the
        // style would collapse the image to its fallback size.
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
      endRafId = requestAnimationFrame(updateHandles);
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
  }, [editor, updateHandles]);

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

  // ===== Toolbar actions (by node position) =====
  const withActive = (fn: (a: ActiveImage) => void) => (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const a = activeRef.current;
    if (a) fn(a);
  };

  /** Restore editable before actions that end in typing (view.focus()). */
  const ensureEditable = () => {
    if (!editor.isEditable) editor.setEditable(true, false);
  };

  const handleAlign = (align: ImageAlign) =>
    withActive(a => {
      updateImageAttrs(editor, a.targetPos, { align: a.align === align ? null : align });
    });

  /**
   * TOGGLE caption: hidden → show it (restores the saved text, focuses it for
   * typing); shown → hide it (text kept in alt, the image stays active).
   */
  const handleCaption = withActive(a => {
    if (a.isFigure) {
      unwrapFigurePreservingCaption(editor, a.targetPos);
    } else {
      ensureEditable();
      wrapImageWithCaption(editor, a.imagePos);
    }
  });

  const handleDelete = withActive(a => {
    ensureEditable();
    deleteImageNode(editor, a.targetPos);
  });

  const handleInsertAbove = withActive(a => {
    ensureEditable();
    insertParagraphAbove(editor, a.targetPos);
  });

  const handleInsertBelow = withActive(a => {
    ensureEditable();
    insertParagraphBelow(editor, a.targetPos);
  });

  const container = getScrollContainer();
  if (!active || !container) return null;

  const { rect } = active;
  // Toolbar sits above the image, or flips below the WHOLE BLOCK (past the
  // caption) when out of room — never covering the caption input or the image.
  const hasRoomAbove = rect.top - TOOLBAR_OFFSET >= container.scrollTop;
  const toolbarTop = hasRoomAbove ? rect.top - TOOLBAR_OFFSET : active.blockBottom + 10;
  const centerX = rect.left + rect.width / 2;
  // Toolbar is ~260px wide; clamp so small / edge-hugging images do not clip it.
  const toolbarHalf = 130;
  const toolbarCenterX = Math.min(
    Math.max(centerX, toolbarHalf),
    Math.max(container.clientWidth - toolbarHalf, toolbarHalf),
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

  return createPortal(
    <>
      {!isDragging && (
        <div
          contentEditable={false}
          style={{
            position: 'absolute',
            top: toolbarTop,
            left: toolbarCenterX,
            transform: 'translateX(-50%)',
            zIndex: 70,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            backgroundColor: 'var(--editor-surface)',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            whiteSpace: 'nowrap',
          }}
        >
          {/* By default (align=null) the image sits left → the left icon shows as active */}
          <ToolbarIconButton
            active={active.align === 'left' || active.align === null}
            onTap={handleAlign('left')}
          >
            <AlignLeftIcon />
          </ToolbarIconButton>
          <ToolbarIconButton active={active.align === 'center'} onTap={handleAlign('center')}>
            <AlignCenterIcon />
          </ToolbarIconButton>
          <ToolbarIconButton active={active.align === 'right'} onTap={handleAlign('right')}>
            <AlignRightIcon />
          </ToolbarIconButton>
          <ToolbarDivider />
          <ToolbarIconButton active={active.isFigure} onTap={handleCaption}>
            <CaptionIcon />
          </ToolbarIconButton>
          <ToolbarDivider />
          <ToolbarIconButton danger onTap={handleDelete}>
            <ImageTrashIcon />
          </ToolbarIconButton>
        </div>
      )}

      {/* ⏎ badge — insert a line above the image. */}
      {!isDragging && active.showInsertAbove && (
        <div
          contentEditable={false}
          {...tapHandlers(handleInsertAbove)}
          style={{
            position: 'absolute',
            // -14 centers the 22px badge ON the top selection outline, which is
            // drawn ~3px above the image edge (outline-offset 2px + half stroke).
            top: rect.top - 14,
            // +26 clears the top-left corner hook's touch area.
            left: rect.left + 26,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: 'var(--editor-accent)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 73,
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            cursor: 'pointer',
          }}
        >
          <ReturnIcon />
        </div>
      )}

      {/* ⏎ badge — insert a line below the image. */}
      {!isDragging && active.showInsertBelow && (
        <div
          contentEditable={false}
          {...tapHandlers(handleInsertBelow)}
          style={{
            position: 'absolute',
            // +height - 8 centers the badge ON the bottom selection outline,
            // drawn ~3px below the image edge.
            top: rect.top + rect.height - 8,
            // -48 mirrors the top badge, clearing the corner hook's touch area.
            left: rect.left + rect.width - 48,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: 'var(--editor-accent)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 73,
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            cursor: 'pointer',
          }}
        >
          <ReturnIcon />
        </div>
      )}

      {corners.map(corner => (
        <div
          key={corner.key}
          contentEditable={false}
          {...tapHandlers(e => startDrag(e, corner.mirror))}
          style={{
            position: 'absolute',
            top: corner.top - HANDLE_TOUCH_SIZE / 2,
            left: corner.left - HANDLE_TOUCH_SIZE / 2,
            width: HANDLE_TOUCH_SIZE,
            height: HANDLE_TOUCH_SIZE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 72,
            cursor: 'nwse-resize',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {/* Crop-style corner hook (iOS Photos/Canva); the white stroke
              underneath boosts contrast on dark image backgrounds. */}
          <svg
            width={18}
            height={18}
            viewBox="0 0 18 18"
            style={{ transform: `rotate(${corner.deg}deg)`, display: 'block' }}
          >
            <path
              d="M 3 15 L 3 8 Q 3 3 8 3 L 15 3"
              fill="none"
              stroke="#ffffff"
              strokeWidth={5.5}
              strokeLinecap="round"
            />
            <path
              d="M 3 15 L 3 8 Q 3 3 8 3 L 15 3"
              fill="none"
              stroke="var(--editor-accent)"
              strokeWidth={3.5}
              strokeLinecap="round"
            />
          </svg>
        </div>
      ))}

      {isDragging && dragLabel !== null && (
        <div
          style={{
            position: 'absolute',
            top: rect.top + 8,
            left: centerX,
            transform: 'translateX(-50%)',
            zIndex: 73,
            padding: '3px 10px',
            borderRadius: 12,
            backgroundColor: 'rgba(0,0,0,0.65)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          {dragLabel}
        </div>
      )}
    </>,
    container,
  );
};

// ===== UI helpers =====

const ToolbarIconButton = ({
  children,
  onTap,
  active = false,
  danger = false,
}: {
  children: React.ReactNode;
  onTap: (e: React.SyntheticEvent) => void;
  active?: boolean;
  danger?: boolean;
}) => (
  <button
    {...tapHandlers(onTap)}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 36,
      height: 32,
      border: 'none',
      borderRadius: 7,
      backgroundColor: active ? 'var(--editor-accent-soft)' : 'transparent',
      color: danger
        ? 'var(--editor-danger)'
        : active
          ? 'var(--editor-accent)'
          : 'var(--editor-icon)',
      padding: 0,
      WebkitTapHighlightColor: 'transparent',
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
);

const ToolbarDivider = () => (
  <div
    style={{
      width: 1,
      height: 20,
      backgroundColor: 'var(--editor-divider)',
      margin: '0 3px',
    }}
  />
);
