/** The cell holding the caret, with its DOM nodes and grid coordinates. */
export type ActiveCell = {
  table: HTMLTableElement;
  row: HTMLTableRowElement;
  cell: HTMLTableCellElement;
  rowIndex: number;
  colIndex: number;
};

/** Which handle opened the popover, and the tap it was opened from. */
export type TablePopoverState = {
  type: 'row' | 'col' | 'table';
  x: number;
  y: number;
  index: number;
  /** Wrapper scroll offset when it opened — the menu closes once that changes. */
  scrollLeft: number;
};

/**
 * Geometry of the active table in TWO coordinate systems: `*Rel*` to the tableWrapper
 * (column handles), `*Content*` to the scroll container (table and row handles).
 */
export type TableHandlesData = {
  tableSize: { width: number; height: number };
  tableRelTop: number;
  tableRelLeft: number;
  rowRelRects: { top: number; height: number }[];
  colRelRects: { left: number; right: number; width: number }[];
  wrapperElement: HTMLElement | null;
  firstRowCells: HTMLTableCellElement[];
  containerElement: HTMLElement | null;
  pinnedLeftContent: number;
  tableTopContent: number;
  rowTopsContent: { top: number; height: number }[];
};

export type ColumnDrag = {
  active: boolean;
  cellPos: number;
  startX: number;
  startWidth: number;
  colIndex: number;
  tableDOM: HTMLTableElement;
  startTableWidth: number;
  /** The colgroup is only written once the finger passes the movement threshold. */
  hasStartedMoving: boolean;
  initialColWidths: number[];
};
