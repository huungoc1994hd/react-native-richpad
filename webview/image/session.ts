import { useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ActiveImage, DragState } from './types';

/** Window in which a stolen selection is reclaimed, and the image it belongs to. */
type Reassert = { pos: number; until: number };

/**
 * State shared by every part of the image toolkit — one session across tap, drag and
 * relay. Refs, not state: the listeners run outside React's commit cycle.
 */
export type ImageSession = {
  active: ActiveImage | null;
  setActive: Dispatch<SetStateAction<ActiveImage | null>>;
  /** `active`, readable from a listener that has no access to the latest render. */
  activeRef: MutableRefObject<ActiveImage | null>;
  dragRef: MutableRefObject<DragState | null>;
  /** Short window after a resize: if a stray event steals the image selection, reclaim it. */
  reassertRef: MutableRefObject<Reassert | null>;
  /** Timestamp of the last INTENTIONAL touch on the editing area — tells it apart from a "ghost" event. */
  lastEditorTouchRef: MutableRefObject<number>;
};

export const useImageSession = (): ImageSession => {
  const [active, setActive] = useState<ActiveImage | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const dragRef = useRef<DragState | null>(null);
  const reassertRef = useRef<Reassert | null>(null);
  const lastEditorTouchRef = useRef(0);

  return { active, setActive, activeRef, dragRef, reassertRef, lastEditorTouchRef };
};
