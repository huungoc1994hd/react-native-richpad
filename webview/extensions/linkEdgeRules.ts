import { combineTransactionSteps, Extension, getChangedRanges } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * The two rules on a link's TRAILING EDGE: typing flush against it JOINS the link, a
 * typed space LEAVES it. Neither may run during a composition (quirk 13).
 */

/** Text just typed flush against a link that came out unlinked, with its href. */
const linkToRejoin = (
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number; href: string } | null => {
  if (to <= from) return null;
  const linkType = state.schema.marks.link;
  const inserted = state.doc.textBetween(from, to);
  if (!inserted || !/\S/.test(inserted)) return null;
  // Only text, and only inside one textblock — never a structural paste.
  const $from = state.doc.resolve(from);
  if (!$from.parent.isTextblock || !$from.sameParent(state.doc.resolve(to))) return null;
  if (state.doc.rangeHasMark(from, to, linkType)) return null;
  const before = $from.nodeBefore;
  if (!before || !before.isText) return null;
  const mark = linkType.isInSet(before.marks);
  if (!mark) return null;
  const href = mark.attrs.href;
  return typeof href === 'string' && href ? { from, to, href } : null;
};

/** The whitespace run that should exit: linked, trailing-edge, ending at `to`. */
const linkedTrailingWhitespace = (
  state: EditorState,
  from: number,
  to: number,
): { from: number; to: number } | null => {
  if (to <= from) return null;
  const linkType = state.schema.marks.link;
  const inserted = state.doc.textBetween(from, to);
  if (!inserted || /\S/.test(inserted)) return null;
  if (!state.doc.rangeHasMark(from, to, linkType)) return null;
  // Trailing edge only: nothing linked may follow the whitespace.
  const after = state.doc.resolve(to).nodeAfter;
  if (after && linkType.isInSet(after.marks)) return null;
  return { from, to };
};

/** The composition-commit case: linked whitespace sitting right before the caret. */
const linkedTrailingWhitespaceAtCaret = (
  state: EditorState,
): { from: number; to: number } | null => {
  const { $from, empty } = state.selection;
  if (!empty) return null;
  const before = $from.nodeBefore;
  if (!before || !before.isText || !before.text) return null;
  if (!state.schema.marks.link.isInSet(before.marks)) return null;
  const match = /\s+$/.exec(before.text);
  if (!match) return null;
  return linkedTrailingWhitespace(state, $from.pos - match[0].length, $from.pos);
};

export const LinkEdgeRules = Extension.create({
  name: 'linkEdgeRules',

  addProseMirrorPlugins() {
    // The flag, not a transaction meta: the inlined prosemirror-view never sets
    // one (quirk 9).
    const isComposing = (editor: Editor): boolean => {
      try {
        return editor.view.composing;
      } catch {
        // The view is not mounted yet — nothing the user could be composing in.
        return false;
      }
    };
    const { editor } = this;

    return [
      new Plugin({
        key: new PluginKey('linkEdgeRules'),

        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some(transaction => transaction.docChanged)) return null;
          if (isComposing(editor)) return null;
          const linkType = newState.schema.marks.link;
          if (!linkType) return null;

          const transform = combineTransactionSteps(oldState.doc, [...transactions]);
          let tr: Transaction | null = null;

          for (const { newRange } of getChangedRanges(transform)) {
            const exiting = linkedTrailingWhitespace(newState, newRange.from, newRange.to);
            if (exiting) {
              tr = tr ?? newState.tr;
              tr.removeMark(exiting.from, exiting.to, linkType);
              // The caret leaves the link with the space: nothing may re-link
              // the next character through stored marks.
              tr.removeStoredMark(linkType);
              continue;
            }
            // Disjoint from the exit rule by the whitespace test, so the two can
            // never fight over the same characters.
            const joining = linkToRejoin(newState, newRange.from, newRange.to);
            if (joining) {
              tr = tr ?? newState.tr;
              tr.addMark(joining.from, joining.to, linkType.create({ href: joining.href }));
            }
          }

          return tr;
        },

        view: editorView => {
          let lastDoc = editorView.state.doc;
          return {
            update: view => {
              const docChanged = view.state.doc !== lastDoc;
              lastDoc = view.state.doc;
              if (!docChanged) return;
              if (view.composing) return;
              const range = linkedTrailingWhitespaceAtCaret(view.state);
              if (!range) return;
              const linkType = view.state.schema.marks.link;
              view.dispatch(
                view.state.tr
                  .removeMark(range.from, range.to, linkType)
                  .removeStoredMark(linkType)
                  // A deferred mark cleanup, not a user edit: undo must jump
                  // straight past it to the typing itself.
                  .setMeta('addToHistory', false),
              );
            },
          };
        },
      }),
    ];
  },
});
