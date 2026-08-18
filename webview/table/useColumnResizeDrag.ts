import React, { useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { TableMap } from '@tiptap/pm/tables';
import { getEditorMetrics } from '../configStore';
import type { TableSession } from './session';

/** Finger travel before a tap on the grip becomes a resize. */
const DRAG_THRESHOLD_PX = 5;

const CELL_TYPES = new Set(['tableCell', 'tableHeader']);

const getColGroupChildren = (table: HTMLTableElement): HTMLElement[] =>
  Array.from(table.querySelector('colgroup')?.children ?? []) as HTMLElement[];

const setColWidth = (col: HTMLElement, width: number) => {
  col.style.width = `${width}px`;
  col.style.minWidth = `${width}px`;
};

/**
 * Drag-resize of a column, previewed on the DOM and committed in ONE transaction on
 * release: a per-frame transaction would redraw the table and cycle the keyboard.
 */
export const useColumnResizeDrag = (
  editor: Editor,
  session: TableSession,
  updateHandles: () => void,
): ((event: React.TouchEvent | React.MouseEvent, cell: HTMLElement) => void) => {
  const { dragRef, setIsDragging, setPopover, popoverRef } = session;

  useEffect(() => {
    const handleTouchMove = (event: TouchEvent) => {
      const drag = dragRef.current;
      if (!drag?.active) return;
      event.preventDefault();
      event.stopPropagation();

      const touch = event.touches[0];
      if (!touch) return;
      const minCellWidth = getEditorMetrics().tableMinCellWidth;
      const deltaX = touch.clientX - drag.startX;

      if (!drag.hasStartedMoving) {
        if (Math.abs(deltaX) < DRAG_THRESHOLD_PX) return;
        drag.hasStartedMoving = true;
        // Pin every column at its measured width so only the dragged one moves.
        getColGroupChildren(drag.tableDOM).forEach((col, index) => {
          setColWidth(col, drag.initialColWidths[index] || minCellWidth);
        });
        setIsDragging(true);
        setPopover(null);
        popoverRef.current = null;
      }

      const newWidth = Math.max(minCellWidth, drag.startWidth + deltaX);
      try {
        const col = getColGroupChildren(drag.tableDOM)[drag.colIndex];
        if (!col) return;
        setColWidth(col, newWidth);
        const widthDiff = newWidth - drag.startWidth;
        if (drag.startTableWidth) {
          const tableWidth = `${drag.startTableWidth + widthDiff}px`;
          drag.tableDOM.style.width = tableWidth;
          drag.tableDOM.style.minWidth = tableWidth;
        }
      } catch {
        // Table DOM may be mid-rerender during the drag — skip this move frame.
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const drag = dragRef.current;
      if (!drag?.active) return;

      const finish = () => {
        drag.active = false;
        dragRef.current = null;
        setIsDragging(false);
        updateHandles();
      };

      // A tap that never moved wrote nothing — nothing to commit.
      if (!drag.hasStartedMoving) {
        finish();
        return;
      }

      const minCellWidth = getEditorMetrics().tableMinCellWidth;
      const touch = event.changedTouches?.[0] ?? event.touches[0];
      const newWidth = touch
        ? Math.max(minCellWidth, drag.startWidth + (touch.clientX - drag.startX))
        : drag.startWidth;

      try {
        // Read what the preview actually produced, then hand the widths to the
        // model and drop the inline styles it was drawn with.
        const actualWidths = Array.from(drag.tableDOM.rows[0]?.cells ?? []).map(
          cell => cell.getBoundingClientRect().width,
        );
        drag.tableDOM.style.width = '';
        drag.tableDOM.style.minWidth = '';

        const $cell = editor.state.doc.resolve(drag.cellPos);
        const tableNode = $cell.node(-1);
        const map = TableMap.get(tableNode);
        const start = $cell.start(-1);
        let tr = editor.state.tr;

        for (let row = 0; row < map.height; row++) {
          for (let column = 0; column < map.width; column++) {
            const mapIndex = row * map.width + column;
            // Skip the cells a rowspan/colspan already covered.
            if (row && map.map[mapIndex] === map.map[mapIndex - map.width]) continue;
            if (column && map.map[mapIndex] === map.map[mapIndex - 1]) continue;

            const pos = map.map[mapIndex];
            const node = tableNode.nodeAt(pos);
            if (!node) continue;

            const { attrs } = node;
            const colwidth = attrs.colwidth ? attrs.colwidth.slice() : Array(attrs.colspan).fill(0);
            let changed = false;
            for (let span = 0; span < attrs.colspan; span++) {
              const targetColumn = column + span;
              const width = Math.round(
                targetColumn === drag.colIndex
                  ? newWidth
                  : actualWidths[targetColumn] || minCellWidth,
              );
              if (colwidth[span] !== width) {
                colwidth[span] = width;
                changed = true;
              }
            }
            if (changed) tr = tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth });
          }
        }

        editor.view.dispatch(tr);
      } catch {
        // cellPos can be stale after concurrent edits — abandon committing the resize.
      }

      finish();
    };

    const options = { capture: true, passive: false } as const;
    window.addEventListener('touchmove', handleTouchMove, options);
    window.addEventListener('touchend', handleTouchEnd, options);
    window.addEventListener('touchcancel', handleTouchEnd, options);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove, { capture: true });
      window.removeEventListener('touchend', handleTouchEnd, { capture: true });
      window.removeEventListener('touchcancel', handleTouchEnd, { capture: true });
    };
  }, [editor, updateHandles, dragRef, setIsDragging, setPopover, popoverRef]);

  return useCallback(
    (event: React.TouchEvent | React.MouseEvent, cell: HTMLElement) => {
      event.preventDefault();
      event.stopPropagation();
      const point = 'touches' in event ? event.touches[0] : event;
      if (!point) return;

      try {
        const cellPos = editor.view.posAtDOM(cell, 0) - 1;
        const node = editor.state.doc.nodeAt(cellPos);
        if (!node || !CELL_TYPES.has(node.type.name)) return;
        const tableDOM = cell.closest<HTMLTableElement>('table');
        if (!tableDOM) return;

        const $cell = editor.state.doc.resolve(cellPos);
        const map = TableMap.get($cell.node(-1));
        const colIndex = map.colCount($cell.pos - $cell.start(-1)) + node.attrs.colspan - 1;

        // Measure only — the colgroup is not written until the finger moves.
        const minCellWidth = getEditorMetrics().tableMinCellWidth;
        const firstRowCells = Array.from(tableDOM.rows[0]?.cells ?? []);
        const colwidth = node.attrs.colwidth;
        let startWidth =
          colwidth?.length && colwidth[colwidth.length - 1] > 0
            ? colwidth[colwidth.length - 1]
            : cell.getBoundingClientRect().width;
        const initialColWidths = getColGroupChildren(tableDOM).map((_col, index) => {
          const width = firstRowCells[index]
            ? firstRowCells[index].getBoundingClientRect().width
            : minCellWidth;
          if (index === colIndex) startWidth = width;
          return width;
        });

        dragRef.current = {
          active: true,
          hasStartedMoving: false,
          cellPos,
          startX: point.clientX,
          startWidth,
          colIndex,
          tableDOM,
          startTableWidth: tableDOM.getBoundingClientRect().width,
          initialColWidths,
        };
      } catch {
        // posAtDOM can fail on a stale/detached cell — do not start the drag.
      }
    },
    [editor, dragRef],
  );
};
