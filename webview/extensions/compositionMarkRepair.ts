import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Fragment } from '@tiptap/pm/model';

/**
 * Restores the outer mark wrapper Chromium drops when an IME re-commits text unchanged
 * Trigger = the loss condition: same characters back, fewer marks.
 */
export const CompositionMarkRepair = Extension.create({
  name: 'compositionMarkRepair',

  addProseMirrorPlugins() {
    /** The textblock as it stood when the IME started composing in it. */
    let snapshot: { blockStart: number; text: string; content: Fragment } | null = null;

    return [
      new Plugin({
        key: new PluginKey('compositionMarkRepair'),
        props: {
          handleDOMEvents: {
            compositionstart: view => {
              const $from = view.state.selection.$from;
              snapshot = $from.parent.isTextblock
                ? {
                    blockStart: $from.before(),
                    text: $from.parent.textContent,
                    content: $from.parent.content,
                  }
                : null;
              return false;
            },
          },
        },

        appendTransaction(transactions, _oldState, newState) {
          const snap = snapshot;
          if (!snap || !transactions.some(transaction => transaction.docChanged)) return null;

          // The snapshot outlives its dispatch, so carry the position forward: left raw,
          // a structural delete puts it past the end and nodeAt throws.
          const blockStart = transactions.reduce(
            (pos, transaction) => transaction.mapping.map(pos, 1),
            snap.blockStart,
          );
          snapshot = { ...snap, blockStart };

          const block =
            blockStart < newState.doc.content.size ? newState.doc.nodeAt(blockStart) : null;
          if (!block?.isTextblock) {
            snapshot = null;
            return null;
          }
          if (block.textContent !== snap.text) {
            snapshot = null;
            return null;
          }
          if (block.content.eq(snap.content)) return null;

          snapshot = null;
          const start = blockStart + 1;
          return (
            newState.tr
              .replaceWith(start, start + block.content.size, snap.content)
              // Plumbing, not an edit: undo must step over it to the user's own.
              .setMeta('addToHistory', false)
          );
        },
      }),
    ];
  },
});
