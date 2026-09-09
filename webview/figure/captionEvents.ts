import type { Node as PMNode } from '@tiptap/pm/model';
import { IS_ANDROID, isInputSessionLive } from '../domUtils';
import { revealFocusedCaretNow } from '../scrollCoordinator';
import {
  announceCaptionFocus,
  focusCaptionField,
  getCaptionOwner,
  isCaretAttachedIn,
  placeCaretAtEnd,
  releaseDomFocus,
} from '../extensions/captionSession';
import { selectImageNodeAt } from '../extensions/pmSelection';
import { ensureCaretLine } from './captionDom';
import { commitOnBlur, ensureImageSelected, syncToDoc, type CaptionContext } from './captionSync';

/** Whether an IME composition is open, which update() must not interrupt. */
export type CompositionFlag = { readonly composing: boolean };

/**
 * Wire the caption field's DOM events. The field is its own editing host, so these
 * handlers own the whole input session — PM sees none of it.
 */
export const attachCaptionEvents = (ctx: CaptionContext): CompositionFlag => {
  const { dom, editor, resolvePos } = ctx;

  dom.addEventListener('input', () => {
    ensureCaretLine(dom);
    // Deleting the last character drops the text node WebKit anchors the caret on,
    // and an empty-to-empty transaction produces no update to re-anchor on.
    if (document.activeElement === dom && !isCaretAttachedIn(dom)) placeCaretAtEnd(dom);
    syncToDoc(ctx);
  });

  dom.addEventListener('pointerdown', event => {
    // Read-only document: no session to open, and the image must not activate either
    if (!editor.isEditable) return;
    announceCaptionFocus(dom);
    const pos = resolvePos();
    if (typeof pos !== 'number') return;
    const { state } = editor;
    const $pos = state.doc.resolve(pos);
    if ($pos.parent.type.name !== 'figure') return;
    const imagePos = $pos.before() + 1;
    const selectedNode = (state.selection as { node?: PMNode }).node;
    const alreadySelected =
      selectedNode?.type.name === 'image' && state.selection.from === imagePos;

    // Image not active yet: own the whole transition inside the gesture, blurring the
    // source BEFORE the dispatch so PM cannot paint over the caret.
    if (!alreadySelected) {
      event.preventDefault();
      releaseDomFocus(dom);
      selectImageNodeAt(editor, imagePos);
      focusCaptionField(dom.closest('figure'));
      return;
    }
    if (document.activeElement === dom) return;

    // Opening a NEW session: the default focus brings UIKit's reveal, which moves the
    // view on its own and ignores preventScroll. Own this entry point too.
    event.preventDefault();
    // Suspended session: defer through the restore-input-focus handshake, which
    // carries no coordinates — the caret goes to the end.
    const pmHost = dom.closest('.ProseMirror');
    const locked = pmHost instanceof HTMLElement && pmHost.contentEditable === 'false';
    if (locked && !isInputSessionLive()) return;
    releaseDomFocus(dom);
    dom.focus({ preventScroll: true });
    try {
      const point = document.caretRangeFromPoint?.(event.clientX, event.clientY);
      // collapse() rather than addRange — same reason as placeCaretAtEnd.
      if (point && dom.contains(point.startContainer)) {
        window.getSelection()?.collapse(point.startContainer, point.startOffset);
      }
    } catch {
      // caretRangeFromPoint can throw mid DOM transition; focus already placed a caret.
    }
    revealFocusedCaretNow(dom);
  });

  dom.addEventListener('focus', () => {
    announceCaptionFocus(dom);
    ensureImageSelected(ctx);
  });

  dom.addEventListener('blur', event => {
    // Android with relatedTarget=null: the WebView lost native focus to the IME dance,
    // not the user. The session survives it.
    if (IS_ANDROID && event.relatedTarget === null) return;
    // Withdraw the announce only while still the owner: caption A → B announces B
    // first, and A's blur must not clobber it.
    if (getCaptionOwner() === dom) announceCaptionFocus(null);
    commitOnBlur(ctx);
  });

  // Single-line caption: Enter ends the input session.
  dom.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      dom.blur();
    }
  });

  dom.addEventListener('beforeinput', event => {
    if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
      event.preventDefault();
    }
    if (!event.inputType.startsWith('delete')) return;
    // A delete with nothing left to delete spills over to the PARENT editing host,
    // taking focus and selection with it — pin it inside this one instead.
    const empty = (dom.textContent ?? '') === '';
    const selection = document.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    const atStart =
      !range ||
      (range.collapsed &&
        range.startOffset === 0 &&
        (range.startContainer === dom || range.startContainer === dom.firstChild));
    if (empty || (atStart && event.inputType.includes('Backward'))) event.preventDefault();
  });

  // Plain text only: contenteditable pastes HTML by default.
  dom.addEventListener('paste', event => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text) document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
  });

  const flag = { composing: false };
  dom.addEventListener('compositionstart', () => {
    flag.composing = true;
  });
  dom.addEventListener('compositionend', () => {
    flag.composing = false;
  });
  return flag;
};
