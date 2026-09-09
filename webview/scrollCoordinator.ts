import type { Editor } from '@tiptap/core';
import { hostChromeState } from './configStore';
import { getScrollContainer, IS_ANDROID } from './domUtils';
import { getCaptionOwner } from './extensions/captionSession';

/**
 * THE owner of caret reveal — typing, the caption, an image finishing its load.
 * Nothing here scrolls for the keyboard; the editing area is sized instead.
 */

/** Breathing room kept below the caret when scrolling it into view (px). */
const CURSOR_MARGIN_BOTTOM = 60;

/** Breathing room kept above the caret when scrolling it into view (px). */
const CURSOR_MARGIN_TOP = 10;

/** Breathing room kept beside the caret inside a horizontally scrolled table (px). */
const CURSOR_MARGIN_X = 24;

/**
 * Behavior for every programmatic scroll: on iOS an animated one leaves the painted
 * scroll offset behind the layout one, stranding the caret until a touch scroll.
 */
export const SCROLL_BEHAVIOR: ScrollBehavior = IS_ANDROID ? 'smooth' : 'auto';

const boxOf = (rect: { top: number; bottom: number; left: number; right: number }) => ({
  top: rect.top,
  bottom: rect.bottom,
  left: rect.left,
  right: rect.right,
});

/**
 * Size the SCROLL CONTAINER to the visible strip: min() of two INDEPENDENT limits —
 * the host toolbar only RN can see, and the visual viewport on Android.
 */
export const syncVisibleHeight = (): void => {
  const root = document.documentElement.style;
  root.setProperty('--editor-chrome', `${Math.max(0, Math.round(hostChromeState.overlap))}px`);
  const viewport = window.visualViewport;
  if (IS_ANDROID && viewport) {
    root.setProperty('--editor-visible-strip', `${Math.round(viewport.height)}px`);
  }
};
syncVisibleHeight();
// The strip changes with the keyboard, and RN is not the one who knows when.
window.addEventListener('resize', syncVisibleHeight);
window.visualViewport?.addEventListener('resize', syncVisibleHeight);

/**
 * Viewport-coordinate TOP of the visible strip: WebKit scrolls the document to clear
 * the caret even with nothing to scroll. Overlays clamp to it.
 */
export const getVisibleTop = (): number => window.visualViewport?.offsetTop ?? 0;

/**
 * Viewport-coordinate bottom of what the user can SEE. The container already ends
 * there; the visual viewport clamps it, since WebKit can pan the page out from under.
 */
export const getVisibleBottom = (): number => {
  const viewport = window.visualViewport;
  const viewportBottom = viewport
    ? Math.min(window.innerHeight, viewport.offsetTop + viewport.height)
    : window.innerHeight;
  const container = getScrollContainer();
  return container
    ? Math.min(container.getBoundingClientRect().bottom, viewportBottom)
    : viewportBottom;
};

/**
 * The user outranks automatic scrolling. Keyed on touchmove, not touchstart, so a
 * TAP still reveals — only a real scroll gesture takes over.
 */
let userDragging = false;
const trackDrag = (dragging: boolean) => () => {
  userDragging = dragging;
};
document.addEventListener('touchmove', trackDrag(true), { capture: true, passive: true });
document.addEventListener('touchend', trackDrag(false), { capture: true, passive: true });
document.addEventListener('touchcancel', trackDrag(false), { capture: true, passive: true });

/** Whether a finger is currently dragging — the overlay fade keys off this. */
export const isUserDragging = (): boolean => userDragging;

/** Viewport box of the caret, plus the node it sits in for the horizontal pass. */
type CaretBox = { top: number; bottom: number; left: number; right: number; node: Node | null };

/**
 * Viewport box of the REAL caret: the DOM range, else the caption's own rect, else
 * coordsAtPos. `scope` is trusted ONLY while the range sits inside it.
 */
const getCaretViewportBox = (
  editor: Editor | null,
  scope?: HTMLElement | null,
): CaretBox | null => {
  try {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (!scope || scope.contains(range.startContainer)) {
        const rects = range.getClientRects();
        const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
        if (rect && (rect.height > 0 || rect.bottom !== 0)) {
          return { ...boxOf(rect), node: range.startContainer };
        }
      }
    }
  } catch {
    // The range can be invalid mid DOM transition — try the next source.
  }
  if (scope) return { ...boxOf(scope.getBoundingClientRect()), node: scope };
  const caption = getCaptionOwner();
  if (caption) return { ...boxOf(caption.getBoundingClientRect()), node: caption };
  if (!editor) return null;
  try {
    const head = editor.state.selection.head;
    const coords = editor.view.coordsAtPos(head);
    return { ...boxOf(coords), node: editor.view.domAtPos(head).node };
  } catch {
    return null;
  }
};

/**
 * Nearest ancestor that scrolls HORIZONTALLY (a wide table's wrapper), between the
 * caret and the scroll container.
 */
const horizontalScroller = (node: Node | null, container: HTMLElement): HTMLElement | null => {
  let element = node instanceof Element ? node : (node?.parentElement ?? null);
  while (element && element !== container) {
    const overflowX = getComputedStyle(element).overflowX;
    if (
      element.scrollWidth > element.clientWidth + 1 &&
      (overflowX === 'auto' || overflowX === 'scroll')
    ) {
      return element as HTMLElement;
    }
    element = element.parentElement;
  }
  return null;
};

/**
 * Bring the caret inside the visible strip. THE ONE WRITER of caret scroll motion;
 * PM's own reveal is routed here because tentap zeroes its margins.
 */
export const revealFocusedCaretNow = (scope?: HTMLElement | null, editor?: Editor | null): void => {
  // The user is dragging: they just chose what to look at.
  if (userDragging) return;
  const container = getScrollContainer();
  if (!container) return;
  const caret = getCaretViewportBox(editor ?? null, scope);
  if (!caret) return;

  const below = caret.bottom - (getVisibleBottom() - CURSOR_MARGIN_BOTTOM);
  const above = caret.top - (getVisibleTop() + CURSOR_MARGIN_TOP);
  // Below the fold wins: a caret taller than the strip must show its bottom, the
  // line being typed on.
  const distance = below >= 2 ? below : above <= -2 ? above : 0;
  if (distance !== 0) {
    container.scrollTo({ top: container.scrollTop + distance, behavior: SCROLL_BEHAVIOR });
  }

  // Horizontal too: a wide table scrolls inside its own wrapper, and taking PM's
  // reveal over means taking this axis with it — an appended column lands off screen.
  const scroller = horizontalScroller(caret.node, container);
  if (!scroller) return;
  const frame = scroller.getBoundingClientRect();
  const past = caret.right - (frame.right - CURSOR_MARGIN_X);
  const before = caret.left - (frame.left + CURSOR_MARGIN_X);
  const dx = past >= 2 ? past : before <= -2 ? before : 0;
  if (dx !== 0) scroller.scrollTo({ left: scroller.scrollLeft + dx, behavior: SCROLL_BEHAVIOR });
};
