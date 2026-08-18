import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { revealFocusedCaretNow } from '../scrollCoordinator';

/**
 * Hands ProseMirror's caret reveal to scrollCoordinator, so scroll motion has one
 * owner. A PLUGIN prop, not editorProps, which tentap replaces wholesale (quirk 20).
 */
export const CaretReveal = Extension.create({
  name: 'caretReveal',

  addProseMirrorPlugins() {
    // Pass the editor: a caret in an EMPTY block reports a zero-sized DOM range, and
    // coordsAtPos is the only source left that knows where it is.
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('caretReveal'),
        props: {
          handleScrollToSelection: () => {
            revealFocusedCaretNow(null, editor);
            return true;
          },
        },
      }),
    ];
  },
});
