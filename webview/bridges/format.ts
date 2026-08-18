import { getMarkRange } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { BridgeExtension } from '@10play/tentap-editor/web';
// Type-only: setLink/unsetLink module augmentation. The Link runtime already
// ships inside TenTapStartKit.
import type {} from '@tiptap/extension-link';
import { BridgeMessageType, FormatBridgeMessage, FormatBridgeState } from '../../src/protocol';
import { assertUnhandled } from '../domUtils';
import { leaveImageSession } from '../extensions/imageActions';

/**
 * The range selected when the link editor opened: a host control holding the keyboard
 * clears the WebView's DOM selection, and the link would then duplicate the text.
 */
let savedSelection: { from: number; to: number } | null = null;

/** The saved range, if it is still non-empty and inside the current document. */
const takeSavedSelection = (editor: Editor): { from: number; to: number } | null => {
  const range = savedSelection;
  savedSelection = null;
  if (!range || range.from >= range.to) return null;
  if (range.to > editor.state.doc.content.size) return null;
  return range;
};
import { createTextRangeSelection, createTextSelectionAt } from '../extensions/pmSelection';

/** Formatting-clear + link bridge. */
export const FormatBridge = new BridgeExtension<
  FormatBridgeState,
  Record<string, never>,
  FormatBridgeMessage
>({
  forceName: 'format',
  onBridgeMessage: (editor, message) => {
    switch (message.type) {
      case BridgeMessageType.ClearFormatting:
        editor.chain().focus().clearNodes().unsetAllMarks().run();
        return true;
      case BridgeMessageType.SaveSelection: {
        const { from, to } = editor.state.selection;
        savedSelection = from < to ? { from, to } : null;
        return true;
      }
      case BridgeMessageType.SetLink: {
        const href = message.payload.href;
        if (!href) return true;
        const text = message.payload.text;
        // Restore the range the user actually selected: a collapsed one would take the
        // "insert a new link" branch below and duplicate the text.
        const restored = editor.state.selection.empty ? takeSavedSelection(editor) : null;
        if (restored) {
          const range = createTextRangeSelection(
            editor.state,
            editor.state.doc,
            restored.from,
            restored.to,
          );
          if (range) editor.view.dispatch(editor.state.tr.setSelection(range));
        }
        const { empty } = editor.state.selection;
        const inLink = !!editor.getAttributes('link').href;
        if (empty && !inLink) {
          // Nothing selected → insert the display text as a link. No escape space: the
          // mark is inclusive and a typed space exits it (linkEdgeRules).
          const label = text?.trim() || href;
          editor
            .chain()
            .focus()
            .insertContent([
              { type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] },
            ])
            .run();
          return true;
        }
        // A selection, or the caret inside an existing link: cover the whole
        // link run, then update text and href together.
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .command(({ state, tr, dispatch }) => {
            const { from, to } = tr.selection;
            const current = tr.doc.textBetween(from, to);
            // Empty display-text field = "use the URL", matching the insert
            // default; undefined = legacy caller, keep the current text.
            const label = text === undefined ? current : text.trim() || href;
            const linkMark = state.schema.marks.link.create({ href });
            // Text replacement stays inside ONE textblock: a selection spanning
            // blocks only gets the mark, never a destructive rewrite.
            const sameBlock = tr.doc.resolve(from).sameParent(tr.doc.resolve(to));
            if (label !== current && sameBlock && label) {
              if (dispatch) {
                // Keep the non-link marks of the first character (bold, color…)
                // so renaming does not silently strip formatting.
                const kept = (tr.doc.nodeAt(from)?.marks ?? []).filter(
                  mark => mark.type.name !== 'link',
                );
                tr.replaceWith(from, to, state.schema.text(label, [...kept, linkMark]));
                const caret = createTextSelectionAt(state, tr.doc, from + label.length);
                if (caret) tr.setSelection(caret);
              }
              return true;
            }
            if (dispatch) tr.addMark(from, to, linkMark);
            return true;
          })
          .run();
        return true;
      }
      case BridgeMessageType.Unlink:
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        return true;
      case BridgeMessageType.SelectAll:
        // Select-all is DOCUMENT-level: during an image session it means leaving that
        // session, so end it and hand the keyboard over first.
        leaveImageSession(editor, { focusEditor: true });
        editor.commands.selectAll();
        return true;
      default:
        assertUnhandled(message);
        break;
    }
    return false;
  },
  extendEditorState: editor => {
    const { state } = editor;
    const activeLinkHref = (editor.getAttributes('link').href as string | undefined) ?? null;
    let activeLinkText: string | null = null;
    if (activeLinkHref) {
      const range = getMarkRange(state.selection.$from, state.schema.marks.link);
      if (range) activeLinkText = state.doc.textBetween(range.from, range.to);
    }
    const { from, to, empty } = state.selection;
    // Capped: this rides every state update and only prefills the link modal.
    const selectionText = empty ? '' : state.doc.textBetween(from, to, ' ', ' ').slice(0, 200);
    return { activeLinkHref, activeLinkText, selectionText };
  },
});
