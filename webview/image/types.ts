import type { ContentRect } from '../domUtils';
import type { ImageWidth } from '../extensions/imageActions';
import type { ImageAlign } from '../extensions/imageExtended';

export type ActiveImage = {
  imagePos: number;
  /** pos of the FIGURE that receives the geometry attrs (every image has one) */
  targetPos: number;
  hasCaption: boolean;
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
export type CellDragContext = {
  colEl: HTMLElement;
  tableEl: HTMLElement;
  /** column width when the drag started (px) — never shrink below this */
  originalColWidth: number;
  originalTableWidth: number;
  /** gap between the column width and the image content (the cell's padding + border) */
  padH: number;
};

export type DragState = {
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
