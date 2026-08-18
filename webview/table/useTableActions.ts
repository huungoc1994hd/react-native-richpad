import React, { useCallback } from 'react';
import type { ChainedCommands, Command, Editor } from '@tiptap/core';
import type { Node as PMNode, ResolvedPos } from '@tiptap/pm/model';
import { TableMap } from '@tiptap/pm/tables';
import { BridgeMessageType } from '../../src/protocol';
import { getEditorMetrics } from '../configStore';
import { assertUnhandled } from '../domUtils';
import { createTextSelectionAt } from '../extensions/pmSelection';
import type { TableSession } from './session';
import type { TableAction } from './constants';
import type { TablePopoverState } from './types';

export type TableActions = {
  openPopover: (
    event: React.MouseEvent | React.TouchEvent,
    type: TablePopoverState['type'],
    index: number,
  ) => void;
  closePopover: () => void;
  run: (action: TableAction) => void;
};

/** Position of the table containing `$pos`, or -1. */
const findTablePos = ($pos: ResolvedPos): number => {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type.name === 'table') return $pos.start(depth) - 1;
  }
  return -1;
};

/** Width each column carries in the model, or null where it has none. */
const columnWidths = (table: PMNode, map: TableMap): (number | null)[] => {
  const widths: (number | null)[] = Array(map.width).fill(null);
  const firstRow = table.firstChild;
  if (!firstRow) return widths;

  let column = 0;
  for (let i = 0; i < firstRow.childCount; i++) {
    const { colspan, colwidth } = firstRow.child(i).attrs;
    for (let span = 0; span < colspan; span++, column++) {
      widths[column] = colwidth?.[span] || null;
    }
  }
  return widths;
};

/**
 * Gives an inserted column the minimum width: `addColumn` builds cells with no attrs,
 * and the sized columns take their pixels first. A table with no widths is left alone.
 */
const sizeUnsizedColumns =
  (tablePosBefore: number): Command =>
  ({ tr, dispatch }) => {
    const tablePos = tr.mapping.map(tablePosBefore, -1);
    const table = tr.doc.nodeAt(tablePos);
    if (table?.type.name !== 'table') return true;

    const map = TableMap.get(table);
    const widths = columnWidths(table, map);
    const missing = widths.filter(width => width === null).length;
    if (!missing || missing === widths.length || !dispatch) return true;

    const minWidth = getEditorMetrics().tableMinCellWidth;
    widths.forEach((width, column) => {
      if (width !== null) return;
      for (let row = 0; row < map.height; row++) {
        const cellPos = map.map[row * map.width + column];
        const cell = table.nodeAt(cellPos);
        // Merged cells share one colwidth array across columns; this editor never
        // creates them, so leave them alone rather than guess at the split.
        if (!cell || cell.attrs.colspan !== 1) continue;
        // setNodeMarkup preserves node size, so earlier writes do not shift these.
        tr.setNodeMarkup(tablePos + 1 + cellPos, null, { ...cell.attrs, colwidth: [minWidth] });
      }
    });
    return true;
  };

/** Picks a cell from the grid as it stands when the command runs. */
type CellPicker = (map: TableMap) => { row: number; column: number };

const atCell =
  (row: number, column: number): CellPicker =>
  () => ({ row, column });

/** First cell of the last row — where a row is appended, and lands. */
const lastRowStart: CellPicker = map => ({ row: map.height - 1, column: 0 });

/** Top cell of the last column — same, by column. */
const lastColumnStart: CellPicker = map => ({ row: 0, column: map.width - 1 });

/**
 * Moves the caret to a cell in the SAME transaction that reshapes the grid, locating
 * the table by its position BEFORE the action. `reveal` adds scrollIntoView.
 */
const moveCaretTo =
  (tablePosBefore: number, pick: CellPicker, reveal = false): Command =>
  ({ state, tr, dispatch }) => {
    const tablePos = tr.mapping.map(tablePosBefore, -1);
    const tableNode = tr.doc.nodeAt(tablePos);
    // The table itself can be gone (deleting its only row) — leave the selection
    // wherever the action put it.
    if (tableNode?.type.name !== 'table') return true;

    const map = TableMap.get(tableNode);
    const { row, column } = pick(map);
    const clampedRow = Math.max(0, Math.min(row, map.height - 1));
    const clampedColumn = Math.max(0, Math.min(column, map.width - 1));
    const cellOffset = map.map[clampedRow * map.width + clampedColumn];
    const selection = createTextSelectionAt(state, tr.doc, tablePos + 1 + cellOffset + 1);
    if (!selection || !dispatch) return true;

    tr.setSelection(selection);
    if (reveal) tr.scrollIntoView();
    return true;
  };

/** The row/column/table popover: opening it, closing it, and running its actions. */
export const useTableActions = (editor: Editor, session: TableSession): TableActions => {
  const { activeCell, handles, popoverRef, setPopover } = session;

  /**
   * Must be bound through tapHandlers: a ghost mousedown would re-run it with page
   * coordinates while the popover is position:fixed, throwing it off-screen.
   */
  const openPopover = useCallback(
    (
      event: React.MouseEvent | React.TouchEvent,
      type: TablePopoverState['type'],
      index: number,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const next: TablePopoverState = {
        type,
        x: 'touches' in event ? event.touches[0].clientX : event.pageX,
        y: ('touches' in event ? event.touches[0].clientY : event.pageY) + 10,
        index,
        scrollLeft: handles?.wrapperElement?.scrollLeft ?? 0,
      };
      // Written before React commits: the tap moves the selection out of the cell,
      // and updateHandles reads this ref to know the cell is being held.
      popoverRef.current = next;
      setPopover(next);
    },
    [handles, popoverRef, setPopover],
  );

  const closePopover = useCallback(() => {
    popoverRef.current = null;
    setPopover(null);
  }, [popoverRef, setPopover]);

  const run = useCallback(
    (action: TableAction) => {
      closePopover();
      if (!activeCell) return;
      const tablePos = findTablePos(editor.state.selection.$anchor);
      if (tablePos === -1) return;

      const { rowIndex, colIndex } = activeCell;

      /** Ends a chain by placing the caret; `reveal` scrolls it into view. */
      const land = (chain: ChainedCommands, pick: CellPicker, reveal = false) =>
        chain.command(moveCaretTo(tablePos, pick, reveal)).run();

      /** Same, for a chain that added a column and left it without a width. */
      const landInColumn = (chain: ChainedCommands, pick: CellPicker, reveal = false) =>
        land(chain.command(sizeUnsizedColumns(tablePos)), pick, reveal);

      // Appending parks the caret in the last row/column first, so prosemirror-tables
      // inserts after THAT one wherever the caret started.
      switch (action) {
        // Every insert lands in the FIRST cell of what it just created.
        case 'addRowBefore':
          land(editor.chain().addRowBefore(), atCell(rowIndex, 0), true);
          return;
        case 'addRowAfter':
          land(editor.chain().addRowAfter(), atCell(rowIndex + 1, 0), true);
          return;
        case 'addColumnBefore':
          landInColumn(editor.chain().addColumnBefore(), atCell(0, colIndex), true);
          return;
        case 'addColumnAfter':
          landInColumn(editor.chain().addColumnAfter(), atCell(0, colIndex + 1), true);
          return;
        case 'appendRow':
          land(
            editor.chain().command(moveCaretTo(tablePos, lastRowStart)).addRowAfter(),
            lastRowStart,
            true,
          );
          return;
        case 'appendColumn':
          landInColumn(
            editor.chain().command(moveCaretTo(tablePos, lastColumnStart)).addColumnAfter(),
            lastColumnStart,
            true,
          );
          return;
        // Deletes land on the neighbour that survived.
        case 'deleteRow':
          land(editor.chain().deleteRow(), atCell(Math.max(0, rowIndex - 1), colIndex));
          return;
        case 'deleteColumn':
          land(editor.chain().deleteColumn(), atCell(rowIndex, Math.max(0, colIndex - 1)));
          return;
        case 'deleteTable':
          editor.chain().deleteTable().run();
          return;
        case BridgeMessageType.InsertParagraphBeforeTable:
          editor
            .chain()
            .insertContentAt(tablePos, '<p></p>')
            .setTextSelection(tablePos + 1)
            .run();
          return;
        default:
          assertUnhandled(action);
      }
    },
    [editor, activeCell, closePopover],
  );

  return { openPopover, closePopover, run };
};
