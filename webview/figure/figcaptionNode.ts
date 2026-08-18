import { Node } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { getEditorLabels } from '../configStore';
import {
  announceCaptionFocus,
  getCaptionOwner,
  isCaretAttachedIn,
  placeCaretAtEnd,
  setCaptionEditorView,
} from '../extensions/captionSession';
import { ensureCaretLine, readValue } from './captionDom';
import { attachCaptionEvents } from './captionEvents';
import type { CaptionContext } from './captionSync';

/**
 * The caption is its OWN EDITING HOST: <figcaption contenteditable> in a cE=false
 * figure, so deletion cannot reach the <img> and PM never sees the typing.
 */
export const Figcaption = Node.create({
  name: 'figcaption',
  content: 'inline*',
  selectable: false,
  // A black box to PM: its content only changes through NodeView transactions.
  atom: true,
  isolating: true,

  addNodeView() {
    const editor = this.editor;
    setCaptionEditorView(editor.view);
    return ({ node, getPos }) => {
      const dom = document.createElement('figcaption');
      dom.contentEditable = 'true';
      dom.setAttribute('data-placeholder', getEditorLabels().imageCaptionPlaceholder);
      dom.textContent = node.textContent;
      ensureCaretLine(dom);

      const ctx: CaptionContext = {
        dom,
        editor,
        resolvePos: () => (typeof getPos === 'function' ? getPos() : undefined),
      };
      const composition = attachCaptionEvents(ctx);

      return {
        dom,
        update(updated: PMNode) {
          if (updated.type.name !== 'figcaption') return false;
          const text = updated.textContent;
          // Overwrite only when the change came from OUTSIDE (undo/redo/setContent);
          // rewriting mid-composition would destroy the IME's marked text.
          if (readValue(dom) !== text && !composition.composing) {
            const hadFocus = document.activeElement === dom;
            // Default to the end; keep the old offset only when a text node carries it.
            let caret = text.length;
            if (hadFocus) {
              const selection = document.getSelection();
              const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
              if (
                range &&
                range.startContainer instanceof Text &&
                dom.contains(range.startContainer)
              ) {
                caret = Math.min(range.startOffset, text.length);
              }
            }
            dom.textContent = text;
            ensureCaretLine(dom);
            if (hadFocus) {
              try {
                // collapse() on a TEXT NODE: an element anchor leaves it unpainted.
                const selection = document.getSelection();
                const textNode = dom.firstChild;
                if (selection && textNode instanceof Text) {
                  selection.collapse(textNode, Math.min(caret, textNode.length));
                } else if (selection) {
                  selection.collapse(dom, 0);
                }
              } catch {
                // The selection API can throw mid DOM transition.
              }
            }
          }
          dom.setAttribute('data-placeholder', getEditorLabels().imageCaptionPlaceholder);
          // Self-repair: focus held but the anchor was replaced, so nothing is painted.
          if (document.activeElement === dom && !isCaretAttachedIn(dom)) placeCaretAtEnd(dom);
          return true;
        },
        // Every event and mutation inside the caption belongs to the field.
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy() {
          // Removal fires no blur (undo deleting the figure), so close the session
          // here or RN stays at captionFocused with a dimmed toolbar.
          if (getCaptionOwner() === dom) announceCaptionFocus(null);
        },
      };
    };
  },

  parseHTML() {
    return [{ tag: 'figcaption' }];
  },

  renderHTML() {
    // data-placeholder is shown via CSS ::before while the caption is empty.
    return ['figcaption', { 'data-placeholder': getEditorLabels().imageCaptionPlaceholder }, 0];
  },
});
