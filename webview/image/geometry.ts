import type { CellDragContext } from './types';

export const getContentWidth = (): number => {
  const pm = document.querySelector('.ProseMirror') as HTMLElement | null;
  if (!pm) return window.innerWidth - 36;
  const cs = getComputedStyle(pm);
  return pm.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
};

/**
 * Width of the image's real CONTAINING BLOCK: the basis that keeps % rendering
 * and drag math in agreement in EVERY context (top level / table cell).
 */
export const getBasisWidth = (targetDom: HTMLElement): number => {
  const parent = targetDom.parentElement;
  if (!parent) return getContentWidth();
  const cs = getComputedStyle(parent);
  const width =
    parent.clientWidth - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.paddingRight || '0');
  return width > 0 ? width : getContentWidth();
};

/**
 * Column context for an image inside a table cell; null when no <col> exists (legacy
 * tables), which simply caps the width at the cell edge.
 */
export const captureCellContext = (
  targetDom: HTMLElement,
  basisWidth: number,
): CellDragContext | null => {
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
