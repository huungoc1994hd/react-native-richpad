import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * INVARIANT: every image lives inside a figure, so the caption toggle never rebuilds
 * the <img>. Bare images are a parse-time way-station and are wrapped right after.
 */

/** Wrap every image whose parent is not a figure; returns null when none exist. */
const wrapLooseImages = (tr: Transaction, doc: PMNode, editor: Editor): Transaction | null => {
  const schema = editor.schema;
  const loose: { pos: number; node: PMNode }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === 'figure') return false;
    if (node.type.name === 'image') loose.push({ pos, node });
    return true;
  });
  if (loose.length === 0) return null;

  // Reverse order: edits from the doc end don't shift the earlier positions.
  for (const { pos, node } of loose.reverse()) {
    const figure = schema.nodes.figure.create(
      {
        width: node.attrs.pctWidth ?? null,
        pxWidth: node.attrs.pxWidth ?? null,
        align: node.attrs.align ?? null,
      },
      // alt stays on the image: it carries the stashed caption text.
      schema.nodes.image.create({ ...node.attrs, pctWidth: null, pxWidth: null, align: null }),
    );
    tr.replaceWith(pos, pos + node.nodeSize, figure);
  }
  return tr;
};

export const ImageNormalizer = Extension.create({
  name: 'imageNormalizer',

  onCreate() {
    const { state, view } = this.editor;
    const tr = wrapLooseImages(state.tr, state.doc, this.editor);
    if (tr) {
      // The pre-normalization shape never existed for the user — undo must not
      // resurrect it.
      view.dispatch(tr.setMeta('addToHistory', false));
    }
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('imageNormalizer'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some(t => t.docChanged)) return null;
          return wrapLooseImages(newState.tr, newState.doc, editor);
        },
      }),
    ];
  },
});
