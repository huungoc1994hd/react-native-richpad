import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ActiveCell, ColumnDrag, TableHandlesData, TablePopoverState } from './types';

/**
 * State shared by every part of the table overlay — one session across handle, drag
 * and popover. Refs, not state: the window listeners run outside React's commit cycle.
 */
export type TableSession = {
  activeCell: ActiveCell | null;
  setActiveCell: Dispatch<SetStateAction<ActiveCell | null>>;
  /** `activeCell`, readable from a listener with no access to the latest render. */
  activeCellRef: MutableRefObject<ActiveCell | null>;

  handles: TableHandlesData | null;
  setHandles: Dispatch<SetStateAction<TableHandlesData | null>>;

  popover: TablePopoverState | null;
  setPopover: Dispatch<SetStateAction<TablePopoverState | null>>;
  popoverRef: MutableRefObject<TablePopoverState | null>;

  isDragging: boolean;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  dragRef: MutableRefObject<ColumnDrag | null>;
};

export const useTableSession = (): TableSession => {
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null);
  const activeCellRef = useRef(activeCell);
  activeCellRef.current = activeCell;

  const [handles, setHandles] = useState<TableHandlesData | null>(null);

  const [popover, setPopover] = useState<TablePopoverState | null>(null);
  const popoverRef = useRef(popover);
  popoverRef.current = popover;

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<ColumnDrag | null>(null);

  return {
    activeCell,
    setActiveCell,
    activeCellRef,
    handles,
    setHandles,
    popover,
    setPopover,
    popoverRef,
    isDragging,
    setIsDragging,
    dragRef,
  };
};
