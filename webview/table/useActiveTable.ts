import { useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/core';
import { measureHandles, resolveActiveCell } from './geometry';
import type { TableSession } from './session';

/**
 * Keeps the session pointed at the table the caret is in, re-measuring on document,
 * selection and viewport changes. Returns `updateHandles` for the drag to call.
 */
export const useActiveTable = (editor: Editor, session: TableSession): (() => void) => {
  const { activeCellRef, popoverRef, setActiveCell, setHandles, setPopover } = session;

  // Memoized on [editor] so it can sit in the dep array of the subscribing effect
  // below; a plain function would re-subscribe on every render.
  const updateHandles = useCallback(() => {
    // While the popover is open the cell stays put: the tap that opened it moved
    // the selection out.
    const active = (popoverRef.current ? activeCellRef.current : null) ?? resolveActiveCell(editor);

    if (!active) {
      setActiveCell(null);
      setHandles(null);
      setPopover(null);
      popoverRef.current = null;
      return;
    }
    setHandles(measureHandles(active));
    setActiveCell(active);
  }, [editor, activeCellRef, popoverRef, setActiveCell, setHandles, setPopover]);

  useEffect(() => {
    editor.on('selectionUpdate', updateHandles);
    editor.on('update', updateHandles);
    window.addEventListener('resize', updateHandles);

    // Handles ride scrolling natively; the only job left is closing the popover once
    // the table scrolls out from under it. Keyed on the offset having actually MOVED.
    const handleWrapperScroll = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target?.classList?.contains('tableWrapper')) return;
      const open = popoverRef.current;
      if (!open || target.scrollLeft === open.scrollLeft) return;
      popoverRef.current = null;
      setPopover(null);
    };
    document.addEventListener('scroll', handleWrapperScroll, true);

    return () => {
      editor.off('selectionUpdate', updateHandles);
      editor.off('update', updateHandles);
      window.removeEventListener('resize', updateHandles);
      document.removeEventListener('scroll', handleWrapperScroll, true);
    };
  }, [editor, updateHandles, popoverRef, setPopover]);

  return updateHandles;
};
