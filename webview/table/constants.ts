import type React from 'react';
import { BridgeMessageType } from '../../src/protocol';

export const SELECTION_FADE_MS = 160;

/**
 * Actions the row/column/table popover can run. Row and column menus insert relative
 * to the caret; `append*` belongs to the TABLE menu and always adds at the end.
 */
export type TableAction =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'appendRow'
  | 'appendColumn'
  | 'deleteTable'
  | typeof BridgeMessageType.InsertParagraphBeforeTable;

export const HANDLE_DOT_STYLE: React.CSSProperties = {
  width: 2,
  height: 2,
  backgroundColor: 'white',
  borderRadius: 1,
};

/** 30×30 tap area every handle sits in the middle of, whatever it draws. */
export const HANDLE_TOUCH_TARGET_STYLE: React.CSSProperties = {
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

export const TABLE_POPOVER_DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  backgroundColor: 'var(--editor-divider)',
  margin: '4px 12px',
};
