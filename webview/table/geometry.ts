import type { Editor } from '@tiptap/core';
import { getScrollContainer } from '../domUtils';
import type { ActiveCell, TableHandlesData } from './types';

const CELL_TYPES = new Set(['tableCell', 'tableHeader']);

/** The cell the caret sits in, resolved to DOM nodes and grid indices. */
export const resolveActiveCell = (editor: Editor): ActiveCell | null => {
  const { selection } = editor.state;
  if (!selection.empty) return null;

  try {
    const { $anchor } = selection;
    for (let depth = $anchor.depth; depth > 0; depth--) {
      if (!CELL_TYPES.has($anchor.node(depth).type.name)) continue;

      const { node } = editor.view.domAtPos($anchor.start(depth));
      // domAtPos may land on a text node, which has no closest().
      const anchorDOM = node instanceof Element ? node : node.parentElement;
      const cell = anchorDOM?.closest<HTMLTableCellElement>('td, th') ?? null;
      const row = cell?.closest<HTMLTableRowElement>('tr') ?? null;
      const table = row?.closest<HTMLTableElement>('table') ?? null;
      if (!cell || !row || !table) return null;

      return {
        table,
        row,
        cell,
        rowIndex: Array.from(table.rows).indexOf(row),
        colIndex: Array.from(row.cells).indexOf(cell),
      };
    }
  } catch {
    // Selection→DOM lookups can throw mid-transaction — treat as no active table.
  }
  return null;
};

/** Everything the overlays need to place themselves around `active`. */
export const measureHandles = (active: ActiveCell): TableHandlesData => {
  const { table } = active;
  const wrapper = table.closest<HTMLElement>('.tableWrapper');
  const tableRect = table.getBoundingClientRect();
  const rowRects = Array.from(table.rows).map(row => row.getBoundingClientRect());
  const firstRowCells = Array.from(table.rows[0].cells);
  const colRects = firstRowCells.map(cell => cell.getBoundingClientRect());

  let tableRelTop = 0;
  let tableRelLeft = 0;
  let pinnedLeft = tableRect.left + window.scrollX;
  let rowRelRects = rowRects.map(rect => ({ top: rect.top, height: rect.height }));
  let colRelRects = colRects.map(rect => ({
    left: rect.left + window.scrollX,
    right: rect.right + window.scrollX,
    width: rect.width,
  }));

  if (wrapper) {
    const wrapperRect = wrapper.getBoundingClientRect();
    const { scrollLeft, scrollTop } = wrapper;
    tableRelTop = tableRect.top - wrapperRect.top + scrollTop;
    tableRelLeft = tableRect.left - wrapperRect.left + scrollLeft;
    rowRelRects = rowRects.map(rect => ({
      top: rect.top - wrapperRect.top + scrollTop,
      height: rect.height,
    }));
    colRelRects = colRects.map(rect => ({
      left: rect.left - wrapperRect.left + scrollLeft,
      right: rect.right - wrapperRect.left + scrollLeft,
      width: rect.width,
    }));
    pinnedLeft = Math.max(tableRect.left, wrapperRect.left) + window.scrollX;
  }

  const container = getScrollContainer();
  const containerRect = container?.getBoundingClientRect();
  const contentTop = (containerRect?.top ?? 0) - (container?.scrollTop ?? 0);
  const contentLeft = containerRect?.left ?? 0;

  return {
    tableSize: { width: tableRect.width, height: tableRect.height },
    tableRelTop,
    tableRelLeft,
    rowRelRects,
    colRelRects,
    wrapperElement: wrapper,
    firstRowCells,
    containerElement: container,
    pinnedLeftContent: pinnedLeft - window.scrollX - contentLeft,
    tableTopContent: tableRect.top - contentTop,
    rowTopsContent: rowRects.map(rect => ({ top: rect.top - contentTop, height: rect.height })),
  };
};
