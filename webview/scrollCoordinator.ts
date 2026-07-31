import type { Editor } from '@tiptap/core';
import { keyboardScrollState } from './configStore';
import { getScrollContainer } from './domUtils';

/**
 * SOLE owner of scrollTop. Every scroll motion carries a generation; the newest
 * command wins and older rAF loops stop themselves. Without it a fast blur→focus
 * chain (a popover toggled while the keyboard is up) leaves several loops writing
 * scrollTop to different targets and the scroll jumps around.
 */

/** Breathing room kept below the caret when scrolling it into view (px). */
export const CURSOR_MARGIN_BOTTOM = 60;

/**
 * Breathing room kept above the caret (px). Paired with CURSOR_MARGIN_BOTTOM but
 * consumed only by main.tsx's autoScrollToCursor, which scrolls in both directions.
 */
export const CURSOR_MARGIN_TOP = 10;

let generation = 0;

/** Cancel any scroll motion in flight — called when the keyboard closes. */
export const cancelKeyboardScroll = () => {
  generation += 1;
  keyboardScrollState.active = false;
};

/**
 * Keep the cursor above the keyboard as it rises (iOS, KeyboardWillShow from RN).
 * Other scroll sources must yield while keyboardScrollState.active.
 */
export const animateScrollForKeyboard = (editor: Editor, kbOffset: number, duration: number) => {
  if (!editor || !editor.view) return;
  const scrollContainer = getScrollContainer();
  if (!scrollContainer) return;

  try {
    const { head } = editor.state.selection;
    const coords = editor.view.coordsAtPos(head);
    const cursorDocY = coords.bottom + scrollContainer.scrollTop;
    const targetVisibleBottom = window.innerHeight - kbOffset;

    if (cursorDocY > targetVisibleBottom - CURSOR_MARGIN_BOTTOM) {
      const startScrollTop = scrollContainer.scrollTop;
      const targetScrollTop = cursorDocY - (targetVisibleBottom - CURSOR_MARGIN_BOTTOM);
      const distance = targetScrollTop - startScrollTop;
      if (Math.abs(distance) < 2) return;

      const myGeneration = ++generation;
      keyboardScrollState.active = true;
      const startTime = performance.now();
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

      const animate = (currentTime: number) => {
        // A newer command took over
        if (myGeneration !== generation) return;

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(progress);

        scrollContainer.scrollTop = startScrollTop + distance * eased;

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setTimeout(() => {
            if (myGeneration === generation) {
              keyboardScrollState.active = false;
            }
          }, 100);
        }
      };
      requestAnimationFrame(animate);
    }
  } catch {
    // coordsAtPos throws when the pos has no DOM yet (mid-redraw) — skip this pass.
  }
};
