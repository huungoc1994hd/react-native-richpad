import type { Editor } from '@tiptap/core';

import { revealFocusedCaretNow } from '../scrollCoordinator';

/**
 * Ownership of the caption input session: which field holds it, announcing every
 * change, and the focus transitions into one. See CONTRIBUTING quirks 1, 2 and 10.
 */

/**
 * The field that OWNS the session. Claimed by announcing, BEFORE focus lands, so a
 * value means "owns the keyboard, now or imminently", not "is focused".
 */
let captionOwner: HTMLElement | null = null;

let captionEditorView: Editor['view'] | null = null;

export const setCaptionEditorView = (view: Editor['view']): void => {
  captionEditorView = view;
};

/**
 * Tell PM "the DOM selection is this now", so its observer does not READ a caret
 * inside a caption and dispatch a TextSelection over the image's NodeSelection.
 */
export const syncPmSelectionSnapshot = (): void => {
  const observer = (
    captionEditorView as unknown as { domObserver?: { setCurSelection?: () => void } } | null
  )?.domObserver;
  try {
    observer?.setCurSelection?.();
  } catch {
    // Internal prosemirror-view API — losing it only costs this safeguard.
  }
};

export const getCaptionOwner = (): HTMLElement | null => captionOwner;

/**
 * Phase of the session: `pending` covers the gap between the announce and focus
 * landing. DERIVED, never stored — WebKit blurs an editing host without telling us.
 */
export type CaptionSessionState = 'idle' | 'pending' | 'focused';

export const getCaptionSessionState = (): CaptionSessionState => {
  if (!captionOwner) return 'idle';
  return document.activeElement === captionOwner ? 'focused' : 'pending';
};

/** Relayed to RN immediately, so ownership is settled before the keyboard reports. */
type CaptionFocusListener = (focused: boolean) => void;
let captionFocusListener: CaptionFocusListener | null = null;
export const setCaptionFocusListener = (listener: CaptionFocusListener | null): void => {
  captionFocusListener = listener;
};

/** Claim (or release, with null) the session and notify the listener
 * synchronously, so the message wins the race against keyboardWillShow. */
export const announceCaptionFocus = (element: HTMLElement | null): void => {
  const changed = captionOwner !== element;
  captionOwner = element;
  if (changed) captionFocusListener?.(!!element);
};

/**
 * Blur whatever holds focus, BEFORE dispatching the image selection: it commits an
 * open composition and stops PM painting its selection over the caret (quirk 5).
 */
export const releaseDomFocus = (except?: HTMLElement | null): void => {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== except) {
    active.blur();
  }
};

/**
 * Whether the caret is anchored on a live TEXT NODE inside the field — the only
 * anchor WebKit paints in an editable island nested in cE=false (quirk 1).
 */
export function isCaretAttachedIn(field: HTMLElement): boolean {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const anchor = selection.getRangeAt(0).startContainer;
  return anchor instanceof Text && anchor.isConnected && field.contains(anchor);
}

/**
 * Caret to the END, anchored on a text node (quirk 1). An empty field takes offset
 * 0: placed after the <br> holding the line box, WebKit paints it on a second line.
 */
export function placeCaretAtEnd(field: HTMLElement): void {
  try {
    const selection = window.getSelection();
    if (!selection) return;
    // collapse() rather than removeAllRanges+addRange: different WebCore paths, and
    // addRange can leave the caret unpainted in a nested editable island.
    const last = field.lastChild;
    if (last instanceof Text) {
      selection.collapse(last, last.length);
    } else if ((field.textContent ?? '') === '') {
      // Empty field: anchor on the empty TEXT NODE before the <br> (ensureCaretLine's
      // invariant). The (field, 0) fallback covers the instant before it holds.
      const anchor = field.firstChild;
      if (anchor instanceof Text) {
        selection.collapse(anchor, 0);
      } else {
        selection.collapse(field, 0);
      }
    } else {
      selection.selectAllChildren(field);
      selection.collapseToEnd();
    }
  } catch {
    // The selection API can throw mid DOM transition.
  }
}

/**
 * Focus a field directly: blur the source, focus with preventScroll, caret to the
 * end, reveal through the coordinator. Also the second half of the IME dance.
 */
export function focusCaptionFieldDirect(field: HTMLElement): boolean {
  // Blur the source FIRST to commit any open composition: WebKit ignores focus()
  // while the old host still holds marked text (quirk 5).
  const previous = document.activeElement;
  const handingOffFromEditingHost =
    previous instanceof HTMLElement && previous !== field && previous.isContentEditable;
  if (previous instanceof HTMLElement && previous !== field) {
    previous.blur();
  }
  if (handingOffFromEditingHost) {
    // Handing off between editing hosts leaves UIKit's session pointing at the old
    // caret rect, so nothing is painted. Toggling cE rebuilds it (quirk 2).
    field.contentEditable = 'false';
    void field.offsetHeight;
    field.contentEditable = 'true';
  }
  // preventScroll: WebKit's own reveal picks its own target and jumps the view. Place
  // the caret BEFORE focus (the session reads its rect then) and confirm it after.
  placeCaretAtEnd(field);
  field.focus({ preventScroll: true });
  placeCaretAtEnd(field);
  syncPmSelectionSnapshot();
  // Re-assert at the END OF THE TURN: later dispatches can replace the field's child
  // nodes, leaving the anchor detached — focus survives, the caret stops painting.
  queueMicrotask(() => {
    if (document.activeElement !== field) return;
    if (!isCaretAttachedIn(field)) {
      placeCaretAtEnd(field);
    }
    // Re-snapshot after every DOM change in this turn, since a later dispatch
    // may have moved the selection.
    syncPmSelectionSnapshot();
  });
  // Changing owner while the keyboard is up produces no keyboard event, so reveal
  // here. Scoped to this field: a refused focus would leave the caret far away.
  if (document.activeElement === field) {
    revealFocusedCaretNow(field);
    return true;
  }
  return false;
}

/**
 * Focus a figure's caption field. Announce BEFORE focusing so RN settles ownership
 * ahead of keyboardWillShow; the focus is always direct (quirk 2).
 */
export function focusCaptionField(figureDom: Element | null | undefined): boolean {
  const field = figureDom?.querySelector('figcaption[contenteditable="true"]');
  if (!(field instanceof HTMLElement)) return false;
  announceCaptionFocus(field);
  return focusCaptionFieldDirect(field);
}
