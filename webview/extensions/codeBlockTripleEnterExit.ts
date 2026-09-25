import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/** Leaves a code block whose caret sits after two trailing newlines; false anywhere else. */
const exitAfterDoubleNewline = (editor: Editor): boolean => {
  const { $from, empty } = editor.state.selection;
  if (!empty || $from.parent.type.name !== 'codeBlock') return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  if (!$from.parent.textContent.endsWith('\n\n')) return false;
  return editor
    .chain()
    .command(({ tr }) => {
      tr.delete($from.pos - 2, $from.pos);
      return true;
    })
    .exitCode()
    .run();
};

/**
 * The third Enter at the end of a code block leaves it on Android too: prosemirror-view drops
 * Enter keydowns on Chrome Android, so the newline only arrives as text, via handleTextInput.
 */
export const CodeBlockTripleEnterExit = Extension.create({
  name: 'codeBlockTripleEnterExit',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('codeBlockTripleEnterExit'),
        props: {
          handleTextInput: (_view, _from, _to, text) =>
            text === '\n' && exitAfterDoubleNewline(editor),
        },
      }),
    ];
  },
});
