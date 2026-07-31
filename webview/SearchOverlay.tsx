import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { getScrollContainer, toContentRect, type ContentRect } from './domUtils';
import { getSearchState } from './extensions/searchHighlight';

/**
 * Highlight overlay for in-note search — same architecture as ImageHandles:
 * portalled into the SCROLL CONTAINER with CONTENT COORDINATES, so it drifts
 * natively with scroll without touching ProseMirror internals (decorations crash
 * under dual-instance; WKWebView has no Custom Highlight API yet). Rects come
 * from a DOM Range, so a match wrapping across lines paints every segment.
 */

type OverlayState = { all: ContentRect[]; active: ContentRect[] };

const EMPTY_OVERLAY: OverlayState = { all: [], active: [] };

/** Cap on painted matches — beyond it, counting/jumping stays correct; we just do not paint them all. */
const MAX_PAINTED_MATCHES = 300;

export const SearchOverlay = ({ editor }: { editor: Editor }) => {
  const [overlay, setOverlay] = useState<OverlayState>(EMPTY_OVERLAY);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const container = getScrollContainer();
      const state = getSearchState(editor);
      if (!container || !state.query || state.matches.length === 0) {
        setOverlay(prev => (prev.all.length || prev.active.length ? EMPTY_OVERLAY : prev));
        return;
      }

      const cRect = container.getBoundingClientRect();
      const all: ContentRect[] = [];
      const active: ContentRect[] = [];

      state.matches.slice(0, MAX_PAINTED_MATCHES).forEach((match, index) => {
        try {
          const start = editor.view.domAtPos(match.from);
          const end = editor.view.domAtPos(match.to);
          const range = document.createRange();
          range.setStart(start.node, start.offset);
          range.setEnd(end.node, end.offset);
          for (const r of Array.from(range.getClientRects())) {
            if (r.width <= 0 || r.height <= 0) continue;
            const rect = toContentRect(r, container, cRect);
            all.push(rect);
            if (index === state.activeIndex) active.push(rect);
          }
        } catch {
          // pos not yet mappable to the DOM (node just redrawn) — skip this pass
        }
      });

      setOverlay({ all, active });
    };

    // 'transaction' fires on EVERY dispatch, including doc-less index changes.
    editor.on('transaction', update);
    window.addEventListener('resize', update);
    update();

    return () => {
      editor.off('transaction', update);
      window.removeEventListener('resize', update);
    };
  }, [editor]);

  const container = getScrollContainer();
  if (!container || (!overlay.all.length && !overlay.active.length)) return null;

  return createPortal(
    <>
      {overlay.all.map((rect, i) => (
        <HighlightBox
          key={`m-${i}`}
          rect={rect}
          color="var(--editor-search-highlight-bg, rgba(250, 204, 21, 0.4))"
          zIndex={40}
        />
      ))}
      {overlay.active.map((rect, i) => (
        <HighlightBox
          key={`a-${i}`}
          rect={rect}
          color="var(--editor-search-active-bg, rgba(245, 158, 11, 0.55))"
          zIndex={41}
        />
      ))}
    </>,
    container,
  );
};

const HighlightBox = ({
  rect,
  color,
  zIndex,
}: {
  rect: ContentRect;
  color: string;
  zIndex: number;
}) => (
  <div
    style={{
      position: 'absolute',
      ...rect,
      backgroundColor: color,
      borderRadius: 2,
      pointerEvents: 'none',
      zIndex,
    }}
  />
);
