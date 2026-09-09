import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
// Decoration from tentap's export, the copy the view runs: a DecorationSet built from
// another ProseMirror copy crashes the view it is handed to.
import { Decoration, DecorationSet } from '@10play/tentap-editor/web';

/**
 * Carries the font size that will be typed NEXT, on the two things with no text to
 * hold it yet: the placeholder and the caret. Only while the block is EMPTY.
 */
export const PendingFontSize = Extension.create({
  name: 'pendingFontSize',

  onTransaction() {
    const fontSize = this.editor.getAttributes('textStyle').fontSize as string | undefined;
    document.documentElement.style.setProperty(
      '--editor-placeholder-font-size',
      fontSize ?? 'inherit',
    );
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('pendingFontSize'),
        props: {
          decorations: state => {
            const { selection, storedMarks, doc } = state;
            if (!selection.empty) return null;
            const $from = selection.$from;
            // depth 0 means the selection is not inside a block — nothing to style.
            if ($from.depth === 0) return null;
            const block = $from.parent;
            if (!block.isTextblock || block.content.size > 0) return null;

            // storedMarks is the size just picked in the toolbar; $from.marks() is
            // the size the position inherits when nothing was picked.
            const marks = storedMarks ?? $from.marks();
            const fontSize = marks.find(mark => mark.type.name === 'textStyle')?.attrs.fontSize as
              string | undefined;
            if (!fontSize) return null;

            const from = $from.before();
            return DecorationSet.create(doc, [
              Decoration.node(from, from + block.nodeSize, { style: `font-size: ${fontSize}` }),
            ]);
          },
        },
      }),
    ];
  },
});
