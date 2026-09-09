import { combineTransactionSteps, Extension, getChangedRanges } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { MarkType, Node } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Mapping, Transform } from '@tiptap/pm/transform';

/**
 * The two rules on a link's TRAILING EDGE: typing flush against it JOINS the link, a
 * typed space LEAVES it. Neither may run during a composition, where a changed doc makes
 * Android IMEs re-commit stale text: a composition's edits are replayed once it ends.
 */

/** Text just typed flush against a link that came out unlinked, with its href. */
const linkToRejoin = (
  doc: Node,
  linkType: MarkType,
  from: number,
  to: number,
): { from: number; to: number; href: string } | null => {
  if (to <= from) return null;
  // Only inline content, and only inside one textblock — never a structural paste.
  const $from = doc.resolve(from);
  if (!$from.parent.isTextblock || !$from.sameParent(doc.resolve(to))) return null;
  // Key by key a space would have left the link, so only the leading word joins.
  const word = /^\S+/.exec(doc.textBetween(from, to, undefined, '\ufffc'));
  if (!word) return null;
  const wordTo = from + word[0].length;
  if (doc.rangeHasMark(from, wordTo, linkType)) return null;
  const before = $from.nodeBefore;
  if (!before || !before.isText) return null;
  const mark = linkType.isInSet(before.marks);
  if (!mark) return null;
  const href = mark.attrs.href;
  return typeof href === 'string' && href ? { from, to: wordTo, href } : null;
};

/** The whitespace run that should exit: linked, trailing-edge, ending at `to`. */
const linkedTrailingWhitespace = (
  doc: Node,
  linkType: MarkType,
  from: number,
  to: number,
): { from: number; to: number } | null => {
  if (to <= from) return null;
  const inserted = doc.textBetween(from, to);
  if (!inserted || /\S/.test(inserted)) return null;
  if (!doc.rangeHasMark(from, to, linkType)) return null;
  // Trailing edge only: nothing linked may follow the whitespace.
  const after = doc.resolve(to).nodeAfter;
  if (after && linkType.isInSet(after.marks)) return null;
  return { from, to };
};

/** Both rules over every range `transform` changed, applied to `tr` as it stands. */
const applyEdgeRules = (
  tr: Transaction,
  linkType: MarkType,
  transform: Transform,
  mapping?: Mapping,
): boolean => {
  let applied = false;
  for (const { newRange } of getChangedRanges(transform)) {
    // Ranges from before the edits `mapping` covers: carried past them, never over them.
    const from = mapping ? mapping.map(newRange.from, 1) : newRange.from;
    const to = mapping ? mapping.map(newRange.to, -1) : newRange.to;
    const exiting = linkedTrailingWhitespace(tr.doc, linkType, from, to);
    if (exiting) {
      tr.removeMark(exiting.from, exiting.to, linkType);
      // The caret leaves the link with the space: nothing may re-link
      // the next character through stored marks.
      tr.removeStoredMark(linkType);
      applied = true;
      continue;
    }
    // Disjoint from the exit rule by the whitespace test, so the two can
    // never fight over the same characters.
    const joining = linkToRejoin(tr.doc, linkType, from, to);
    if (joining) {
      tr.addMark(joining.from, joining.to, linkType.create({ href: joining.href }));
      applied = true;
    }
  }
  return applied;
};

/** Edits made while composing, kept with the doc they started from. */
interface Deferred {
  doc: Node;
  transactions: Transaction[];
}

export const LinkEdgeRules = Extension.create({
  name: 'linkEdgeRules',

  addProseMirrorPlugins() {
    // The flag, not the "composition" transaction meta: the meta marks only what PM
    // itself read from the DOM, and other plugins' transactions carry none.
    const isComposing = (editor: Editor): boolean => {
      try {
        return editor.view.composing;
      } catch {
        // The view is not mounted yet — nothing the user could be composing in.
        return false;
      }
    };
    const { editor } = this;
    let deferred: Deferred | null = null;

    /** The deferred edits as one transform, if they lead to `doc`. */
    const takeDeferred = (doc: Node): Transform | null => {
      const pending = deferred;
      deferred = null;
      if (!pending) return null;
      const transform = combineTransactionSteps(pending.doc, pending.transactions);
      return transform.doc.eq(doc) ? transform : null;
    };

    return [
      new Plugin({
        key: new PluginKey('linkEdgeRules'),

        appendTransaction: (transactions, oldState, newState) => {
          const changed = transactions.filter(transaction => transaction.docChanged);
          if (changed.length === 0) return null;
          const linkType = newState.schema.marks.link;
          if (!linkType) return null;
          if (isComposing(editor)) {
            deferred = deferred ?? { doc: oldState.doc, transactions: [] };
            deferred.transactions.push(...changed);
            return null;
          }
          const tr = newState.tr;
          const current = combineTransactionSteps(oldState.doc, changed);
          // A composition's edits first, judged as they stood when it ended, so
          // what follows them sees the link they joined.
          const replay = takeDeferred(oldState.doc);
          let applied = replay ? applyEdgeRules(tr, linkType, replay, current.mapping) : false;
          applied = applyEdgeRules(tr, linkType, current) || applied;
          return applied ? tr : null;
        },

        view: () => ({
          update: view => {
            // A composition that ended on its last edit: no later transaction replays it.
            if (!deferred || view.composing) return;
            const linkType = view.state.schema.marks.link;
            const replay = linkType ? takeDeferred(view.state.doc) : null;
            if (!replay) return;
            const tr = view.state.tr;
            if (!applyEdgeRules(tr, linkType, replay)) return;
            // A deferred mark cleanup, not a user edit: undo must jump
            // straight past it to the typing itself.
            view.dispatch(tr.setMeta('addToHistory', false));
          },
        }),
      }),
    ];
  },
});
