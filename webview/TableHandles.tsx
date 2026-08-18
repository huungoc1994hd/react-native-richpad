import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { getEditorLabels, subscribeEditorConfig } from './configStore';
import { tablePopoverCss } from './icons';
import { tapHandlers } from './tapGuard';
import { useTableSession } from './table/session';
import { useActiveTable } from './table/useActiveTable';
import { useColumnResizeDrag } from './table/useColumnResizeDrag';
import { useTableActions } from './table/useTableActions';
import {
  ColumnResizeGrip,
  PillHandle,
  SelectionOverlay,
  TableHandle,
  TablePopover,
} from './table/overlayParts';
import type { TableHandlesData, TablePopoverState } from './table/types';

/** Geometry of the blue highlight while the menu is open, or null. */
const selectionRect = (
  popover: TablePopoverState,
  handles: TableHandlesData,
  rowIndex: number,
  colIndex: number,
): React.CSSProperties | null => {
  const base: React.CSSProperties = {
    position: 'absolute',
    boxSizing: 'border-box',
    border: '2px solid var(--editor-accent)',
    backgroundColor: 'var(--editor-accent-soft)',
    pointerEvents: 'none',
    zIndex: 15,
  };
  const column = handles.colRelRects[colIndex];
  const row = handles.rowRelRects[rowIndex];

  if (popover.type === 'col' && column) {
    return {
      ...base,
      top: handles.tableRelTop,
      left: column.left,
      width: column.width,
      height: handles.tableSize.height,
    };
  }
  if (popover.type === 'row' && row) {
    return {
      ...base,
      top: row.top,
      left: handles.tableRelLeft,
      width: handles.tableSize.width,
      height: row.height,
    };
  }
  if (popover.type === 'table') {
    return {
      ...base,
      top: handles.tableRelTop,
      left: handles.tableRelLeft,
      width: handles.tableSize.width,
      height: handles.tableSize.height,
    };
  }
  return null;
};

/**
 * Table overlay: handles for the table, row and column, plus a resize grip per column
 * edge. Portalled INTO the scroll flow; the parts live in ./table.
 */
export const TableHandles = ({ editor }: { editor: Editor }) => {
  // Dynamic labels from InitConfig (English by default — the RN app passes translations).
  const [labels, setLabels] = useState(getEditorLabels());
  useEffect(() => subscribeEditorConfig(() => setLabels({ ...getEditorLabels() })), []);

  const session = useTableSession();
  const updateHandles = useActiveTable(editor, session);
  const startDrag = useColumnResizeDrag(editor, session, updateHandles);
  const actions = useTableActions(editor, session);

  const { activeCell, handles, popover, isDragging } = session;

  return (
    <>
      <style>{tablePopoverCss}</style>

      {handles && activeCell && handles.containerElement && (
        <>
          {createPortal(
            <>
              {(!popover || popover.type === 'table') && (
                <TableHandle
                  active={popover?.type === 'table'}
                  // -25 / -20 lift the handle clear of the table's top-left corner.
                  top={handles.tableTopContent - 25}
                  left={handles.pinnedLeftContent - 20}
                  hidden={isDragging}
                  tap={tapHandlers(event => actions.openPopover(event, 'table', 0), {
                    stopPropagation: true,
                  })}
                />
              )}

              {(!popover || popover.type === 'row') &&
                handles.rowTopsContent[activeCell.rowIndex] && (
                  <PillHandle
                    orientation="row"
                    active={popover?.type === 'row'}
                    top={
                      handles.rowTopsContent[activeCell.rowIndex].top +
                      handles.rowTopsContent[activeCell.rowIndex].height / 2 -
                      15
                    }
                    left={handles.pinnedLeftContent - 20}
                    hidden={isDragging}
                    transition="top 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)"
                    tap={tapHandlers(
                      event => actions.openPopover(event, 'row', activeCell.rowIndex),
                      { stopPropagation: true },
                    )}
                  />
                )}
            </>,
            handles.containerElement,
          )}

          {handles.wrapperElement &&
            createPortal(
              <>
                {(!popover || popover.type === 'col') &&
                  handles.colRelRects[activeCell.colIndex] && (
                    <PillHandle
                      orientation="col"
                      active={popover?.type === 'col'}
                      top={handles.tableRelTop - 20}
                      left={
                        handles.colRelRects[activeCell.colIndex].left +
                        handles.colRelRects[activeCell.colIndex].width / 2 -
                        15
                      }
                      hidden={isDragging}
                      transition="left 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)"
                      tap={tapHandlers(
                        event => actions.openPopover(event, 'col', activeCell.colIndex),
                        { stopPropagation: true },
                      )}
                    />
                  )}

                <SelectionOverlay
                  rect={
                    popover
                      ? selectionRect(popover, handles, activeCell.rowIndex, activeCell.colIndex)
                      : null
                  }
                />

                {!popover &&
                  handles.colRelRects.map((column, index) => (
                    <ColumnResizeGrip
                      key={`resize-${index}`}
                      top={handles.tableRelTop - 23}
                      // The last grip sits fully inside the table, the rest straddle the edge.
                      left={
                        index === handles.colRelRects.length - 1
                          ? column.right - 24
                          : column.right - 15
                      }
                      hidden={isDragging}
                      onStart={event => startDrag(event, handles.firstRowCells[index])}
                    />
                  ))}
              </>,
              handles.wrapperElement,
            )}
        </>
      )}

      {popover && (
        <TablePopover
          popover={popover}
          labels={labels}
          onAction={actions.run}
          onDismiss={actions.closePopover}
        />
      )}
    </>
  );
};
