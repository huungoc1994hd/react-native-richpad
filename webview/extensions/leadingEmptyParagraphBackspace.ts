import { Extension } from '@tiptap/core';
// Selections must come from the running PM instance — see extensions/figure.ts.
import { findTextSelectionNear } from './figure';

/** Containers whose boundary backspace cannot join backward across. */
const JOIN_BARRIER_PARENTS = new Set(['doc', 'tableCell', 'tableHeader']);

/**
 * Deletes an orphan empty line: an EMPTY paragraph sitting FIRST inside a
 * join-barrier container (doc start or a table cell) with a node after it. Stock
 * ProseMirror is stuck there — joinBackward needs content before the paragraph
 * within the same container, and doc start / isolating table cells have none.
 * Every other backspace case is handled by PM before this handler runs.
 */
export const LeadingEmptyParagraphBackspace = Extension.create({
  name: 'leadingEmptyParagraphBackspace',

  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state, view } = this.editor;
        const { selection, tr } = state;
        const { empty, $anchor } = selection;

        if (!empty) return false;

        const parent = $anchor.parent;
        if (parent.type.name !== 'paragraph' || parent.content.size > 0) {
          return false;
        }

        const containerDepth = $anchor.depth - 1;
        if (containerDepth < 0) return false;
        const container = $anchor.node(containerDepth);
        if (!JOIN_BARRIER_PARENTS.has(container.type.name)) return false;
        const paragraphIndex = $anchor.index(containerDepth);
        if (paragraphIndex !== 0 || container.childCount < 2) return false;

        const from = $anchor.before();
        const to = $anchor.after();
        tr.delete(from, to);
        const nextSelection = findTextSelectionNear(state, tr.doc.resolve(from), 1);
        if (nextSelection) {
          tr.setSelection(nextSelection);
        }
        view.dispatch(tr);
        return true;
      },
    };
  },
});
