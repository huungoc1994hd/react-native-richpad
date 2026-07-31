import React, { useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TableMap } from '@tiptap/pm/tables';
import type { Editor } from '@tiptap/core';
import {
  getEditorLabels,
  getEditorMetrics,
  subscribeEditorConfig,
  keyboardScrollState,
} from './configStore';
import { BridgeMessageType } from '../src/protocol';
import { assertUnhandled, getScrollContainer } from './domUtils';
import { tapHandlers } from './tapGuard';
import {
  InsertColLeftIcon,
  InsertColRightIcon,
  InsertRowAboveIcon,
  InsertRowBelowIcon,
  TableTrashIcon,
  TextCursorIcon,
  tablePopoverCss,
} from './icons';

/** Duration of the selection-highlight fade (ms). */
const SELECTION_FADE_MS = 160;

/** Actions the row/column/table popover can run. */
type TableAction =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'deleteTable'
  | typeof BridgeMessageType.InsertParagraphBeforeTable;

const HANDLE_DOT_STYLE: React.CSSProperties = {
  width: 2,
  height: 2,
  backgroundColor: 'white',
  borderRadius: 1,
};

/** The three-dot grip inside a row/column handle pill. */
const HandleDots = () => (
  <>
    {[0, 1, 2].map(i => (
      <div key={i} style={HANDLE_DOT_STYLE} />
    ))}
  </>
);

/**
 * Blue row/col/table highlight that fades in/out. Fade-OUT is the tricky part:
 * the parent drops the rect the instant the popover closes, so the last rect is
 * retained locally and the element unmounts only after the exit transition.
 */
const SelectionOverlay = ({ rect }: { rect: React.CSSProperties | null }) => {
  const [shown, setShown] = useState<React.CSSProperties | null>(rect);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (rect) {
      setShown(rect);
      // Double rAF: paint opacity 0 first, so the transition runs on mount.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setShown(null), SELECTION_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [rect]);

  if (!shown) return null;
  return (
    <div
      style={{
        ...shown,
        opacity: visible ? 1 : 0,
        transition: `opacity ${SELECTION_FADE_MS}ms ease`,
      }}
    />
  );
};

export const TableHandles = ({ editor }: { editor: Editor }) => {
  // Dynamic labels from InitConfig (English by default — the RN app passes translations).
  const [labels, setLabels] = useState(getEditorLabels());
  useEffect(() => subscribeEditorConfig(() => setLabels({ ...getEditorLabels() })), []);

  const [activeCell, setActiveCell] = useState<{
    table: HTMLTableElement;
    row: HTMLTableRowElement;
    cell: HTMLTableCellElement;
    rowIndex: number;
    colIndex: number;
  } | null>(null);
  const activeCellRef = useRef(activeCell);
  useEffect(() => {
    activeCellRef.current = activeCell;
  }, [activeCell]);

  const [popover, setPopover] = useState<{
    type: 'row' | 'col' | 'table';
    x: number;
    y: number;
    index: number;
  } | null>(null);
  const popoverRef = useRef(popover);
  const [popoverMounted, setPopoverMounted] = useState(false);

  useEffect(() => {
    popoverRef.current = popover;
    if (popover) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setPopoverMounted(true));
      });
    } else {
      setPopoverMounted(false);
    }
  }, [popover]);

  const [handlesData, setHandlesData] = useState<{
    tableRect: { top: number; left: number; width: number; height: number };
    tableRelTop: number;
    tableRelLeft: number;
    pinnedLeft: number;
    rowRelRects: { top: number; height: number }[];
    colRelRects: { left: number; right: number; width: number }[];
    wrapperElement: HTMLElement | null;
    firstRowCells: HTMLTableCellElement[];
    /**
     * CONTENT COORDS (relative to the scroll container) for the LEFT ICONS.
     * Portalled into the scroll container so vertical scrolling rides natively
     * with the content (zero lag); horizontal pinning is free because the
     * wrapper's left edge stays put while the table body scrolls inside it.
     */
    containerElement: HTMLElement | null;
    pinnedLeftContent: number;
    tableTopContent: number;
    rowTopsContent: { top: number; height: number }[];
  } | null>(null);

  const [isDragging, setIsDragging] = useState(false);

  const manualDragRef = useRef<{
    active: boolean;
    cellPos: number;
    startX: number;
    startWidth: number;
    colIndex: number;
    tableDOM: HTMLTableElement;
    startTableWidth: number;
    hasStartedMoving?: boolean;
    initialColWidths?: number[];
  } | null>(null);

  const isHandlingClickRef = useRef(false);

  const popoverOpenTimerRef = useRef<number | undefined>(undefined);
  const reselectTimerRef = useRef<number | undefined>(undefined);

  // Memoized on [editor] so it can sit in the dep array of the subscribing
  // effect below; a plain function would re-subscribe on every render.
  const updateHandles = useCallback(() => {
    const { selection } = editor.state;

    let isTableActive = false;
    let cellNode: HTMLTableCellElement | null = null;
    let rowIdx = -1;
    let colIdx = -1;

    let tableDOM: HTMLTableElement | null = null;
    let rowDOM: HTMLTableRowElement | null = null;

    try {
      if ((popoverRef.current || isHandlingClickRef.current) && activeCellRef.current) {
        isTableActive = true;
        tableDOM = activeCellRef.current.table;
        rowDOM = activeCellRef.current.row;
        cellNode = activeCellRef.current.cell;
        rowIdx = activeCellRef.current.rowIndex;
        colIdx = activeCellRef.current.colIndex;
      } else if (selection.empty) {
        const { $anchor } = selection;
        for (let depth = $anchor.depth; depth > 0; depth--) {
          const node = $anchor.node(depth);
          if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
            isTableActive = true;
            const { node: domNode } = editor.view.domAtPos($anchor.start(depth));
            // domAtPos may land on a text node, which has no closest().
            const anchorDOM = domNode instanceof Element ? domNode : domNode.parentElement;
            cellNode = anchorDOM?.closest<HTMLTableCellElement>('td, th') ?? null;

            rowDOM = cellNode?.closest<HTMLTableRowElement>('tr') ?? null;
            tableDOM = rowDOM?.closest<HTMLTableElement>('table') ?? null;

            if (tableDOM && rowDOM && cellNode) {
              rowIdx = Array.from(tableDOM.rows).indexOf(rowDOM);
              colIdx = Array.from(rowDOM.cells).indexOf(cellNode);
            }
            break;
          }
        }
      }
    } catch {
      // Selection→DOM lookups can throw mid-transaction — treat as no active table.
    }

    if (isTableActive && cellNode && tableDOM && rowDOM) {
      const row = rowDOM;
      const table = tableDOM;
      if (row && table) {
        const wrapper = table.closest<HTMLElement>('.tableWrapper');
        const tRect = table.getBoundingClientRect();
        const rRects = Array.from(table.rows).map(r => r.getBoundingClientRect());
        const cNodes = Array.from(table.rows[0].cells);
        const cRects = cNodes.map(c => c.getBoundingClientRect());

        let tableRelTop = 0;
        let colRelRects = cRects.map(c => ({
          left: c.left + window.scrollX,
          right: c.right + window.scrollX,
          width: c.width,
        }));

        let tableRelLeft = 0;
        let rowRelRects = rRects.map(r => ({ top: r.top, height: r.height }));
        let pinnedLeft = tRect.left + window.scrollX;
        if (wrapper) {
          const wRect = wrapper.getBoundingClientRect();
          const scrollLeft = wrapper.scrollLeft;
          const scrollTop = wrapper.scrollTop;
          tableRelTop = tRect.top - wRect.top + scrollTop;
          tableRelLeft = tRect.left - wRect.left + scrollLeft;
          rowRelRects = rRects.map(r => ({ top: r.top - wRect.top + scrollTop, height: r.height }));
          colRelRects = cRects.map(c => ({
            left: c.left - wRect.left + scrollLeft,
            right: c.right - wRect.left + scrollLeft,
            width: c.width,
          }));
          pinnedLeft = Math.max(tRect.left, wRect.left) + window.scrollX;
        }

        // Content coords for the left icons (see the comment on the handlesData type).
        const containerEl = getScrollContainer();
        const contRect = containerEl?.getBoundingClientRect();
        const contTop = (contRect?.top ?? 0) - (containerEl?.scrollTop ?? 0);
        const contLeft = contRect?.left ?? 0;

        setHandlesData({
          tableRect: {
            top: tRect.top + window.scrollY,
            left: tRect.left + window.scrollX,
            height: tRect.height,
            width: tRect.width,
          },
          pinnedLeft,
          tableRelTop,
          tableRelLeft,
          rowRelRects,
          colRelRects,
          wrapperElement: wrapper,
          firstRowCells: cNodes,
          containerElement: containerEl,
          pinnedLeftContent: pinnedLeft - window.scrollX - contLeft,
          tableTopContent: tRect.top - contTop,
          rowTopsContent: rRects.map(r => ({ top: r.top - contTop, height: r.height })),
        });
        setActiveCell({ table, row, cell: cellNode, rowIndex: rowIdx, colIndex: colIdx });
      } else {
        setActiveCell(null);
        setHandlesData(null);
        setPopover(null);
        popoverRef.current = null;
      }
    } else {
      setActiveCell(null);
      setHandlesData(null);
      setPopover(null);
      popoverRef.current = null;
    }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    editor.on('selectionUpdate', updateHandles);
    editor.on('update', updateHandles);

    const handleTouchMove = (e: TouchEvent) => {
      if (manualDragRef.current && manualDragRef.current.active) {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        if (touch) {
          const minCellWidth = getEditorMetrics().tableMinCellWidth;
          const deltaX = touch.clientX - manualDragRef.current.startX;

          if (!manualDragRef.current.hasStartedMoving) {
            if (Math.abs(deltaX) < 5) return;
            manualDragRef.current.hasStartedMoving = true;

            const colGroup = manualDragRef.current.tableDOM.querySelector('colgroup');
            if (colGroup) {
              Array.from(colGroup.children).forEach((c, idx) => {
                const w = manualDragRef.current?.initialColWidths?.[idx] || minCellWidth;
                (c as HTMLElement).style.width = `${w}px`;
                (c as HTMLElement).style.minWidth = `${w}px`;
              });
            }
            setIsDragging(true);
            setPopover(null);
            popoverRef.current = null;
          }

          const newWidth = Math.max(minCellWidth, manualDragRef.current.startWidth + deltaX);

          try {
            const tableDOM = manualDragRef.current.tableDOM;
            const colGroup = tableDOM.querySelector('colgroup');
            if (colGroup) {
              const col = colGroup.children[manualDragRef.current.colIndex] as HTMLElement;
              if (col) {
                col.style.width = `${newWidth}px`;
                col.style.minWidth = `${newWidth}px`;

                const widthDiff = newWidth - manualDragRef.current.startWidth;
                if (manualDragRef.current.startTableWidth) {
                  tableDOM.style.width = `${manualDragRef.current.startTableWidth + widthDiff}px`;
                  tableDOM.style.minWidth = `${manualDragRef.current.startTableWidth + widthDiff}px`;
                }
              }
            }
          } catch {
            // Table DOM may be mid-rerender during the drag — skip this move frame.
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (manualDragRef.current && manualDragRef.current.active) {
        const minCellWidth = getEditorMetrics().tableMinCellWidth;
        const touch = e.changedTouches ? e.changedTouches[0] : e.touches[0];
        let newWidth = manualDragRef.current.startWidth;
        let deltaX = 0;
        if (touch) {
          deltaX = touch.clientX - manualDragRef.current.startX;
          newWidth = Math.max(minCellWidth, manualDragRef.current.startWidth + deltaX);
        }

        if (!manualDragRef.current.hasStartedMoving) {
          manualDragRef.current.active = false;
          manualDragRef.current = null;
          setIsDragging(false);
          updateHandles();
          return;
        }

        try {
          const tableDOM = manualDragRef.current.tableDOM;
          const firstRowCells = Array.from(tableDOM.rows[0]?.cells || []);
          const actualWidths = firstRowCells.map(c => c.getBoundingClientRect().width);

          if (manualDragRef.current.tableDOM) {
            manualDragRef.current.tableDOM.style.width = '';
            manualDragRef.current.tableDOM.style.minWidth = '';
          }
          const { cellPos, colIndex } = manualDragRef.current;
          const $cell = editor.state.doc.resolve(cellPos);
          const tableNode = $cell.node(-1);
          const map = TableMap.get(tableNode);
          const start = $cell.start(-1);

          let tr = editor.state.tr;

          for (let row = 0; row < map.height; row++) {
            for (let c = 0; c < map.width; c++) {
              const mapIndex = row * map.width + c;
              if (row && map.map[mapIndex] == map.map[mapIndex - map.width]) continue;
              if (c && map.map[mapIndex] == map.map[mapIndex - 1]) continue;

              const pos = map.map[mapIndex];
              const node = tableNode.nodeAt(pos);
              if (!node) continue;

              const attrs = node.attrs;
              const newColWidth = attrs.colwidth
                ? attrs.colwidth.slice()
                : Array(attrs.colspan).fill(0);
              let changed = false;

              for (let j = 0; j < attrs.colspan; j++) {
                const targetColIdx = c + j;
                let w = actualWidths[targetColIdx] || minCellWidth;
                if (targetColIdx === colIndex) w = newWidth;
                w = Math.round(w);
                if (newColWidth[j] !== w) {
                  newColWidth[j] = w;
                  changed = true;
                }
              }

              if (changed) {
                tr = tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth: newColWidth });
              }
            }
          }

          editor.view.dispatch(tr);
        } catch {
          // cellPos can be stale after concurrent edits — abandon committing the resize.
        }

        manualDragRef.current.active = false;
        manualDragRef.current = null;
        setIsDragging(false);
        updateHandles();
      }
    };

    window.addEventListener('touchmove', handleTouchMove, { capture: true, passive: false });
    window.addEventListener('touchend', handleTouchEnd, { capture: true, passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { capture: true, passive: false });
    window.addEventListener('resize', updateHandles);

    // Every handle lives INSIDE the scroll flow (top icons in the wrapper, left
    // icons in the container with content coords) → they ride along natively, no
    // scroll chasing. Only job left: close the popover on horizontal scroll.
    let scrollRafId: number | null = null;
    const handleAnyScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target?.classList?.contains('tableWrapper')) {
        if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
        scrollRafId = requestAnimationFrame(() => {
          setPopover(null);
          popoverRef.current = null;
        });
      }
    };
    document.addEventListener('scroll', handleAnyScroll, true);

    return () => {
      editor.off('selectionUpdate', updateHandles);
      editor.off('update', updateHandles);
      window.removeEventListener('touchmove', handleTouchMove, { capture: true });
      window.removeEventListener('touchend', handleTouchEnd, { capture: true });
      window.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
      window.removeEventListener('resize', updateHandles);
      document.removeEventListener('scroll', handleAnyScroll, true);
      if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
      window.clearTimeout(popoverOpenTimerRef.current);
      window.clearTimeout(reselectTimerRef.current);
    };
  }, [editor, updateHandles]);

  const startDrag = (e: React.TouchEvent | React.MouseEvent, cell: HTMLElement) => {
    e.preventDefault();
    e.stopPropagation();
    const touch = 'touches' in e ? e.touches[0] : e;
    if (!touch) return;

    try {
      const posInside = editor.view.posAtDOM(cell, 0);
      const cellPos = posInside - 1;
      const node = editor.state.doc.nodeAt(cellPos);

      if (node && (node.type.name === 'tableCell' || node.type.name === 'tableHeader')) {
        const rect = cell.getBoundingClientRect();
        let startWidth = rect.width;
        let colwidth = node.attrs.colwidth;

        if (colwidth && colwidth.length > 0 && colwidth[colwidth.length - 1] > 0) {
          startWidth = colwidth[colwidth.length - 1];
        }

        const $cell = editor.state.doc.resolve(cellPos);
        const tableNode = $cell.node(-1);
        const map = TableMap.get(tableNode);
        const start = $cell.start(-1);
        const logicalColIndex = map.colCount($cell.pos - start) + node.attrs.colspan - 1;
        const tableDOM = cell.closest<HTMLTableElement>('table');
        if (!tableDOM) return;

        // Measure only: the colgroup is not written until the finger moves >= 5px.
        const minCellWidth = getEditorMetrics().tableMinCellWidth;
        const colGroup = tableDOM.querySelector('colgroup');
        let actualStartWidth = startWidth;
        const initialColWidths: number[] = [];
        if (colGroup) {
          const firstRowCells = Array.from(tableDOM.rows[0]?.cells || []);
          Array.from(colGroup.children).forEach((_c, idx) => {
            const w = firstRowCells[idx]
              ? firstRowCells[idx].getBoundingClientRect().width
              : minCellWidth;
            initialColWidths.push(w);
            if (idx === logicalColIndex) actualStartWidth = w;
          });
        }

        manualDragRef.current = {
          active: true,
          hasStartedMoving: false,
          cellPos,
          startX: touch.clientX,
          startWidth: actualStartWidth,
          colIndex: logicalColIndex,
          tableDOM,
          startTableWidth: tableDOM.getBoundingClientRect().width,
          initialColWidths,
        };
      }
    } catch {
      // posAtDOM can fail on a stale/detached cell — do not start the drag.
    }
  };

  /**
   * Must be bound through tapHandlers: a ghost mousedown re-runs it with
   * pageX/pageY (document coords, incl. scroll) while the popover is
   * position:fixed (viewport coords), which throws the menu off-screen.
   */
  const onHandleClick = (
    e: React.MouseEvent | React.TouchEvent,
    type: 'row' | 'col' | 'table',
    index: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    isHandlingClickRef.current = true;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.pageX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.pageY;

    // Delay setting popover to avoid immediate closure by layout-shift induced scroll events
    window.clearTimeout(popoverOpenTimerRef.current);
    popoverOpenTimerRef.current = window.setTimeout(() => {
      setPopover({ type, x: clientX, y: clientY + 10, index });
      isHandlingClickRef.current = false;
    }, 50);
  };

  const closePopover = () => {
    popoverRef.current = null;
    setPopover(null);
  };

  const executeTableAction = (action: TableAction) => {
    closePopover();

    if (!activeCell) return;
    const { rowIndex, colIndex } = activeCell;
    let targetRow = rowIndex;
    let targetCol = colIndex;

    if (action === 'addRowBefore') targetRow += 1;
    if (action === 'addColumnBefore') targetCol += 1;
    if (action === 'deleteRow') targetRow = Math.max(0, rowIndex - 1);
    if (action === 'deleteColumn') targetCol = Math.max(0, colIndex - 1);

    switch (action) {
      case 'addRowBefore':
        editor.chain().addRowBefore().run();
        break;
      case 'addRowAfter':
        editor.chain().addRowAfter().run();
        break;
      case 'deleteRow':
        editor.chain().deleteRow().run();
        break;
      case 'addColumnBefore':
        editor.chain().addColumnBefore().run();
        break;
      case 'addColumnAfter':
        editor.chain().addColumnAfter().run();
        break;
      case 'deleteColumn':
        editor.chain().deleteColumn().run();
        break;
      case 'deleteTable':
        editor.chain().deleteTable().run();
        return;
      case BridgeMessageType.InsertParagraphBeforeTable: {
        const { selection } = editor.state;
        const { $anchor } = selection;
        for (let d = $anchor.depth; d > 0; d--) {
          if ($anchor.node(d).type.name === 'table') {
            const tableStart = $anchor.before(d);
            editor
              .chain()
              .insertContentAt(tableStart, '<p></p>')
              .setTextSelection(tableStart + 1)
              .run();
            break;
          }
        }
        return;
      }
      default: {
        assertUnhandled(action);
        return;
      }
    }

    window.clearTimeout(reselectTimerRef.current);
    reselectTimerRef.current = window.setTimeout(() => {
      try {
        const { selection } = editor.state;
        const { $anchor } = selection;
        let tableNodePos = -1;
        for (let depth = $anchor.depth; depth > 0; depth--) {
          if ($anchor.node(depth).type.name === 'table') {
            tableNodePos = $anchor.start(depth) - 1;
            break;
          }
        }
        if (tableNodePos === -1) return;

        const tableNode = editor.state.doc.nodeAt(tableNodePos);
        if (!tableNode) return;

        const map = TableMap.get(tableNode);
        targetRow = Math.max(0, Math.min(targetRow, map.height - 1));
        targetCol = Math.max(0, Math.min(targetCol, map.width - 1));

        const cellOffset = map.map[targetRow * map.width + targetCol];
        const cellPos = tableNodePos + 1 + cellOffset;

        editor.commands.setTextSelection(cellPos + 1);
      } catch {
        // Table may be gone or reshaped after the action — leave the selection as-is.
      }
    }, 10);
  };

  const touchTargetStyle: React.CSSProperties = {
    position: 'absolute',
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  };

  // Geometry of the blue selection highlight while the menu is open (null =
  // hidden); rendered through SelectionOverlay so it fades in/out.
  let selectionRect: React.CSSProperties | null = null;
  if (popover && activeCell && handlesData) {
    const base: React.CSSProperties = {
      position: 'absolute',
      boxSizing: 'border-box',
      border: '2px solid var(--editor-accent)',
      backgroundColor: 'var(--editor-accent-soft)',
      pointerEvents: 'none',
      zIndex: 15,
    };
    if (popover.type === 'col' && handlesData.colRelRects[activeCell.colIndex]) {
      const col = handlesData.colRelRects[activeCell.colIndex];
      selectionRect = {
        ...base,
        top: handlesData.tableRelTop,
        left: col.left,
        width: col.width,
        height: handlesData.tableRect.height,
      };
    } else if (popover.type === 'row' && handlesData.rowRelRects[activeCell.rowIndex]) {
      const row = handlesData.rowRelRects[activeCell.rowIndex];
      selectionRect = {
        ...base,
        top: row.top,
        left: handlesData.tableRelLeft,
        width: handlesData.tableRect.width,
        height: row.height,
      };
    } else if (popover.type === 'table' && handlesData.tableRect) {
      selectionRect = {
        ...base,
        top: handlesData.tableRelTop,
        left: handlesData.tableRelLeft,
        width: handlesData.tableRect.width,
        height: handlesData.tableRect.height,
      };
    }
  }

  return (
    <>
      <style>{tablePopoverCss}</style>
      {handlesData && activeCell && (
        <>
          {/* Table + row handles, pinned to the visible left edge — portalled
              into the scroll container (see handlesData.containerElement). */}
          {handlesData.containerElement &&
            createPortal(
              <>
                {(!popover || popover.type === 'table') && (
                  <div
                    className="handle-wrapper"
                    contentEditable={false}
                    style={{
                      ...touchTargetStyle,
                      top: handlesData.tableTopContent - 25,
                      left: handlesData.pinnedLeftContent - 20,
                      opacity: isDragging ? 0 : 1,
                      pointerEvents: isDragging ? 'none' : 'auto',
                      transition: 'opacity 0.1s',
                    }}
                    {...tapHandlers(e => onHandleClick(e, 'table', 0), { stopPropagation: true })}
                  >
                    <div
                      className="handle-icon-box"
                      style={{
                        width: 14,
                        height: 14,
                        backgroundColor:
                          popover?.type === 'table'
                            ? 'var(--editor-accent)'
                            : 'var(--editor-surface)',
                        border:
                          popover?.type === 'table' ? 'none' : '1px solid var(--editor-border)',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={popover?.type === 'table' ? '#FFFFFF' : 'var(--editor-icon)'}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="12" y1="3" x2="12" y2="21"></line>
                      </svg>
                    </div>
                  </div>
                )}

                {(!popover || popover.type === 'row') &&
                  handlesData.rowTopsContent[activeCell.rowIndex] && (
                    <div
                      className="handle-wrapper"
                      contentEditable={false}
                      style={{
                        ...touchTargetStyle,
                        top:
                          handlesData.rowTopsContent[activeCell.rowIndex].top +
                          handlesData.rowTopsContent[activeCell.rowIndex].height / 2 -
                          15,
                        left: handlesData.pinnedLeftContent - 20,
                        opacity: isDragging ? 0 : 1,
                        pointerEvents: isDragging ? 'none' : 'auto',
                        transition: 'opacity 0.1s, top 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      }}
                      {...tapHandlers(e => onHandleClick(e, 'row', activeCell.rowIndex), {
                        stopPropagation: true,
                      })}
                    >
                      <div
                        className="handle-pill"
                        style={{
                          width: 8,
                          height: 18,
                          backgroundColor:
                            popover?.type === 'row'
                              ? 'var(--editor-accent)'
                              : 'var(--editor-border)',
                          borderRadius: 4,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                        }}
                      >
                        <HandleDots />
                      </div>
                    </div>
                  )}
              </>,
              handlesData.containerElement,
            )}

          {/* Column + resize handles (top edge) — inside the wrapper, so they
              follow the table's horizontal scroll. */}
          {handlesData.wrapperElement &&
            createPortal(
              <>
                {(!popover || popover.type === 'col') &&
                  handlesData.colRelRects[activeCell.colIndex] && (
                    <div
                      className="handle-wrapper"
                      contentEditable={false}
                      style={{
                        ...touchTargetStyle,
                        top: handlesData.tableRelTop - 20,
                        left:
                          handlesData.colRelRects[activeCell.colIndex].left +
                          handlesData.colRelRects[activeCell.colIndex].width / 2 -
                          15,
                        opacity: isDragging ? 0 : 1,
                        pointerEvents: isDragging ? 'none' : 'auto',
                        transition: 'opacity 0.1s, left 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
                      }}
                      {...tapHandlers(e => onHandleClick(e, 'col', activeCell.colIndex), {
                        stopPropagation: true,
                      })}
                    >
                      <div
                        className="handle-pill"
                        style={{
                          width: 18,
                          height: 8,
                          backgroundColor:
                            popover?.type === 'col'
                              ? 'var(--editor-accent)'
                              : 'var(--editor-border)',
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                        }}
                      >
                        <HandleDots />
                      </div>
                    </div>
                  )}

                {/* Blue row/col/table highlight — fades in/out with the menu. */}
                <SelectionOverlay rect={selectionRect} />

                {!popover &&
                  handlesData.colRelRects.map((c, i) => (
                    <div
                      key={`drag-${i}`}
                      className="handle-wrapper"
                      contentEditable={false}
                      style={{
                        ...touchTargetStyle,
                        top: handlesData.tableRelTop - 23,
                        left:
                          i === handlesData.colRelRects.length - 1 ? c.right - 24 : c.right - 15,
                        zIndex: 60,
                        cursor: 'ew-resize',
                        opacity: isDragging ? 0 : 1,
                        pointerEvents: isDragging ? 'none' : 'auto',
                        transition: 'opacity 0.1s',
                      }}
                      onTouchStart={e => startDrag(e, handlesData.firstRowCells[i])}
                      onTouchEnd={e => e.stopPropagation()}
                      onMouseDown={e => startDrag(e, handlesData.firstRowCells[i])}
                      onMouseUp={e => e.stopPropagation()}
                      onClick={e => e.stopPropagation()}
                    >
                      <div
                        className="handle-icon-box"
                        style={{
                          width: 20,
                          height: 10,
                          backgroundColor: 'var(--editor-surface)',
                          border: '1px solid var(--editor-border)',
                          borderRadius: 5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--editor-muted)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="8 17 2 12 8 7"></polyline>
                          <polyline points="16 17 22 12 16 7"></polyline>
                        </svg>
                      </div>
                    </div>
                  ))}
              </>,
              handlesData.wrapperElement,
            )}
        </>
      )}

      {popover &&
        (() => {
          const isRightAligned = popover.x > window.innerWidth - 200;
          // No room below (the keyboard stays up during table actions) → FLIP
          // upward, hugging the handle. Do NOT clamp-and-push the top instead:
          // that detaches the popover from its anchor and leaves it floating.
          const estimatedHeight = popover.type === 'table' ? 230 : 175;
          const visibleBottom =
            window.innerHeight - Math.max(0, keyboardScrollState.obscuredHeight);
          const fitsBelow = popover.y + estimatedHeight <= visibleBottom;
          const anchorY = popover.y - 10; // popover.y = tap point + 10
          // bottom-anchored just above the handle; clamped so the top edge stays on-screen
          const flippedBottom = Math.min(
            window.innerHeight - anchorY + 8,
            window.innerHeight - 15 - estimatedHeight,
          );
          const verticalStyle = fitsBelow ? { top: popover.y } : { bottom: flippedBottom };
          return (
            <>
              {/* TOOLBAR FOCUS CONTRACT (ProseMirror/tiptap standard): mousedown's
              default action on a <button> is to focus it, so every popover control
              preventDefaults mousedown. Focus never leaves the editable → keyboard
              stays open through table actions → no hide/show cycle, no scroll
              jump. click still fires. */}
              <div
                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 }}
                onMouseDown={e => e.preventDefault()}
                onClick={() => closePopover()}
              />
              <div
                onMouseDown={e => e.preventDefault()}
                style={{
                  position: 'fixed',
                  ...verticalStyle,
                  ...(isRightAligned ? { right: 15 } : { left: Math.max(15, popover.x) }),
                  backgroundColor: 'var(--editor-surface)',
                  boxShadow:
                    '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                  borderRadius: 14,
                  border: '1px solid rgba(0,0,0,0.05)',
                  padding: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  zIndex: 100,
                  minWidth: 180,
                  opacity: popoverMounted ? 1 : 0,
                  transform: popoverMounted ? 'scale(1)' : 'scale(0.85)',
                  transformOrigin: `${fitsBelow ? 'top' : 'bottom'} ${isRightAligned ? 'right' : 'left'}`,
                  transition:
                    'opacity 0.35s ease-out, transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              >
                {popover.type === 'row' && (
                  <>
                    <button
                      className="table-popover-button"
                      onClick={() => executeTableAction('addRowBefore')}
                    >
                      <InsertRowAboveIcon /> {labels.addRowAbove}
                    </button>
                    <div style={TABLE_POPOVER_DIVIDER_STYLE} />
                    <button
                      className="table-popover-button"
                      onClick={() => executeTableAction('addRowAfter')}
                    >
                      <InsertRowBelowIcon /> {labels.addRowBelow}
                    </button>
                    <div style={TABLE_POPOVER_DIVIDER_STYLE} />
                    <button
                      className="table-popover-button danger"
                      onClick={() => executeTableAction('deleteRow')}
                    >
                      <TableTrashIcon /> {labels.deleteRow}
                    </button>
                  </>
                )}
                {popover.type === 'col' && (
                  <>
                    <button
                      className="table-popover-button"
                      onClick={() => executeTableAction('addColumnBefore')}
                    >
                      <InsertColLeftIcon /> {labels.addColumnLeft}
                    </button>
                    <div style={TABLE_POPOVER_DIVIDER_STYLE} />
                    <button
                      className="table-popover-button"
                      onClick={() => executeTableAction('addColumnAfter')}
                    >
                      <InsertColRightIcon /> {labels.addColumnRight}
                    </button>
                    <div style={TABLE_POPOVER_DIVIDER_STYLE} />
                    <button
                      className="table-popover-button danger"
                      onClick={() => executeTableAction('deleteColumn')}
                    >
                      <TableTrashIcon /> {labels.deleteColumn}
                    </button>
                  </>
                )}
                {popover.type === 'table' && (
                  <>
                    <button
                      className="table-popover-button"
                      onClick={() =>
                        executeTableAction(BridgeMessageType.InsertParagraphBeforeTable)
                      }
                    >
                      <TextCursorIcon /> {labels.insertParagraphAbove}
                    </button>
                    <div style={TABLE_POPOVER_DIVIDER_STYLE} />
                    <button
                      className="table-popover-button"
                      onClick={() => executeTableAction('addRowAfter')}
                    >
                      <InsertRowBelowIcon /> {labels.addRow}
                    </button>
                    <div style={TABLE_POPOVER_DIVIDER_STYLE} />
                    <button
                      className="table-popover-button"
                      onClick={() => executeTableAction('addColumnAfter')}
                    >
                      <InsertColRightIcon /> {labels.addColumn}
                    </button>
                    <div style={TABLE_POPOVER_DIVIDER_STYLE} />
                    <button
                      className="table-popover-button danger"
                      onClick={() => executeTableAction('deleteTable')}
                    >
                      <TableTrashIcon /> {labels.deleteTable}
                    </button>
                  </>
                )}
              </div>
            </>
          );
        })()}
    </>
  );
};

const TABLE_POPOVER_DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  backgroundColor: 'var(--editor-divider)',
  margin: '4px 12px',
};
